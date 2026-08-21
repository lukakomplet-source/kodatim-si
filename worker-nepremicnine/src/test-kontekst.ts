import "dotenv/config";
import { chromium } from "playwright";
import { uporabniskiAgent } from "./identiteta.js";
import { connect } from "./db.js";
import { najdiVir } from "./viri/index.js";
import { jeIzziv, razbremeniKontekst } from "./izziv.js";
import { hlajenjeDo } from "./samopopravilo.js";

/**
 * MERITEV, KI ODGOVARJA NA PRAVNO VPRAŠANJE, NE NA TEHNIČNO.
 *
 * Adapter za nepremicnine.net odpre za vsako stran SVEŽ brskalniški kontekst.
 * V kodi je to utemeljeno z opombo, da "Cloudflare pusti prvo zahtevo konteksta
 * skozi, vsako naslednjo pošlje na izziv". Če to drži, potem svež kontekst ni
 * tehnična podrobnost, ampak način, kako se izogniti preverjanju — in
 * izogibanje preverjanju je natanko tisto, česar ta projekt ne počne.
 *
 * Zato se to izmeri in ne domneva. Test prebere nekaj strani z ENIM samim
 * obstojnim kontekstom (kot bi jih navaden obiskovalec) in pove, ali se izziv
 * res pojavi.
 *
 *   npx tsx src/test-kontekst.ts [koliko-strani]
 *
 * Odgovor je pomemben v obe smeri:
 *  - če se izziv POJAVI, je sedanja koda obhod in jo je treba opustiti,
 *    čeprav to pomeni, da tega vira ne moremo več brati;
 *  - če se NE pojavi, je svež kontekst nepotreben in opombo v kodi je treba
 *    popraviti, ker trdi nekaj, kar ne drži.
 */

const koliko = Number(process.argv[2] ?? 4);
/** Razmik med stranmi; z njim se loči "beremo prehitro" od "seja je zavrnjena". */
const zamikMs = Number(process.argv[3] ?? 0) || null;
/** Kateri vir merimo (--vir=bolha.com); privzeto nepremicnine.net. */
const virArg = process.argv.find((a) => a.startsWith("--vir="))?.slice(6) ?? "nepremicnine.net";
const vir = najdiVir(virArg);
if (!vir) {
  console.error(`Vira "${virArg}" ni v registru.`);
  process.exit(2);
}

// Meritve NIKOLI ne delamo med hlajenjem: to bi bilo natanko tisto, čemur se
// ta datoteka posveča.
const db = connect();
const hlajenje = await hlajenjeDo(db, vir.vir);
if (hlajenje) {
  console.error(
    `Vir ${vir.vir} počiva po blokadi do ${new Date(hlajenje).toLocaleString("sl-SI")}. Meritev ni dovoljena.`
  );
  process.exit(4);
}

const rezina = vir.rezine().find((r) => r.oznaka === "prodaja/podravska/stanovanje") ?? vir.rezine()[0];

/**
 * Ločnici, ki morata biti v testu neodvisni:
 *  - `svez`: nov kontekst za vsako stran (kot dela adapter) proti enemu obstojnemu;
 *  - `brez`: ali podvirov (slike, slogi) ne zahtevamo.
 *
 * Brez te ločitve je prva različica testa merila oboje hkrati in bi zavrnitev,
 * ki jo povzroči blokada slogov, pripisala seji.
 */
const svezNaStran = process.argv.includes("--svez");
const brezPodvirov = !process.argv.includes("--s-podviri");

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const noviKontekst = async () => {
  const c = await browser.newContext({
    locale: "sl-SI",
    userAgent: uporabniskiAgent(),
  });
  if (brezPodvirov) await razbremeniKontekst(c).catch(() => {});
  return c;
};
const ctx = await noviKontekst();

const razmik = zamikMs ?? vir.omejitve.zamikMs;
console.log(
  `${svezNaStran ? "SVEŽ kontekst za vsako stran" : "EN obstojen kontekst"}, ` +
    `podviri ${brezPodvirov ? "BLOKIRANI" : "dovoljeni"}, ${koliko} strani, ${razmik / 1000} s razmika.\n`
);
let zavrnitev = 0;
let uspehov = 0;
for (let stran = 1; stran <= koliko; stran++) {
  const kontekst = svezNaStran ? await noviKontekst() : ctx;
  const page = await kontekst.newPage();
  try {
    const url = vir.seznamUrl(rezina, stran);
    const r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1500);
    const naslov = await page.title().catch(() => "");
    const besedilo = (await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 500) : "")).catch(
      () => ""
    )) as string;
    const izziv = jeIzziv(naslov, besedilo);
    const status = r?.status() ?? 0;
    const { kartice, skupajZadetkov } = await vir.preberiSeznam(page);
    /**
     * ODTIS VSAKEGA ZAHTEVKA. Brez njega se tri različne zavrnitve zlijejo v
     * eno: gol 403, zaslon preverjanja (pride s statusom 200!) in "postrezi
     * lažne podatke" (stran, ki ima obliko, a ne vsebine — Radware to navaja
     * med svojimi ukrepi). Vsaka ima drug odgovor, zato jih je treba ločiti.
     */
    const koncniUrl = page.url();
    const dolzina = (await page.content().catch(() => "")).length;
    const zavrnjena =
      izziv || status === 403 || status === 429 || (kartice.length === 0 && skupajZadetkov !== 0);
    if (zavrnjena) zavrnitev += 1;
    else if (kartice.length > 0) uspehov += 1;
    console.log(
      `stran ${stran} | HTTP ${status} | kartic ${String(kartice.length).padStart(3)} | ` +
        `HTML ${Math.round(dolzina / 1024)} kB | ${izziv ? "IZZIV: " + naslov : zavrnjena ? "ZAVRNJENO" : "v redu"}`
    );
    if (zavrnjena) {
      console.log(`         končni URL: ${koncniUrl}`);
      console.log(`         naslov: ${naslov}`);
      console.log(`         začetek besedila: ${besedilo.replace(/\s+/g, " ").slice(0, 220)}`);
      // Ob prvi zavrnitvi se USTAVIMO. Prejšnja različica je nadaljevala do
      // konca in vsak nadaljnji zahtevek je bil trkanje na vrata, ki so nam
      // jih pravkar zaprli.
      console.log(`\nUstavljam meritev ob prvi zavrnitvi — brez ponovnega poskusa.`);
      break;
    }
  } catch (e) {
    console.log(`stran ${stran} | NAPAKA: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await page.close();
    if (svezNaStran) await kontekst.close().catch(() => {});
  }
  if (stran < koliko) await new Promise((r) => setTimeout(r, razmik));
}
await ctx.close();
await browser.close();

console.log(
  zavrnitev > 0
    ? `\nIZID: ${zavrnitev} od ${koliko} strani ZAVRNJENIH pri ${razmik / 1000} s razmika. Če je zavrnitev tudi ` +
        `pri dolgem razmiku, vir ne omejuje hitrosti, ampak sejo — in svež kontekst za vsako stran je obhod.`
    : `\nIZID: ${uspehov} od ${koliko} strani prebranih brez zavrnitve pri ${razmik / 1000} s razmika. ` +
        `Obstojen kontekst pri tem tempu deluje.`
);
process.exitCode = 0;
