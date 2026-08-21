import "dotenv/config";
import { chromium } from "playwright";
import { uporabniskiAgent } from "./identiteta.js";
import { connect } from "./db.js";
import { najdiVir } from "./viri/index.js";
import { preveriIzziv, razbremeniKontekst } from "./izziv.js";
import { hlajenjeDo } from "./samopopravilo.js";

/**
 * Ali je seznam vira razvrščen OD NAJNOVEJŠEGA?
 *
 * Od tega odgovora je odvisna zastavica `razvrsceniPoNovosti`, ta pa dovoli
 * inkrementalno branje — ustavitev, ko dve strani zapored ne prineseta nič
 * novega. Če razvrstitev ni po novosti, so novi in stari oglasi pomešani in
 * zgodnja ustavitev tiho izpusti del trga. Prav ta razred napake (tiha izguba,
 * ki je v dnevniku ni videti) nas je pri števcu strani stal dve tretjini
 * kataloga, zato se zastavica NE vklopi na občutek.
 *
 * Merilo je preprosto in ne potrebuje datumov z oglasa: če je seznam razvrščen
 * po novosti, potem so oglasi s PRVE strani v naši bazi v povprečju videni
 * pozneje (`first_seen`) kot oglasi z globljih strani. Bazo uporabimo kot uro,
 * ki jo že imamo.
 *
 * Poraba: 3 zahtevki. Vir v hlajenju se ne dotakne.
 *
 *   npx tsx src/test-razvrstitev.ts bolha.com
 */

const virIme = process.argv[2] ?? "bolha.com";
const vir = najdiVir(virIme);
if (!vir) {
  console.error(`Vira "${virIme}" ni v registru.`);
  process.exit(2);
}

const db = connect();
const hlajenje = await hlajenjeDo(db, vir.vir);
if (hlajenje) {
  console.error(
    `Vir ${vir.vir} počiva po blokadi do ${new Date(hlajenje).toLocaleString("sl-SI")}. ` +
      `Meritve ne delamo med hlajenjem — to bi bilo natanko tisto, čemur se izogibamo.`
  );
  process.exit(4);
}

const rezina = vir.rezine()[0];
const browser = await chromium.launch({ args: ["--no-sandbox"] });

/** Povprečen `first_seen` oglasov ene strani, prebran iz naše baze. */
async function povprecnaStarost(virIdji: string[]): Promise<{ povprecje: number | null; znanih: number }> {
  if (virIdji.length === 0) return { povprecje: null, znanih: 0 };
  const { data } = await db
    .from("nep_oglasi")
    .select("vir_id, first_seen")
    .eq("vir", vir!.vir)
    .in("vir_id", virIdji);
  const casi = (data ?? [])
    .map((v) => new Date(v.first_seen as string).getTime())
    .filter((t) => Number.isFinite(t));
  if (casi.length === 0) return { povprecje: null, znanih: 0 };
  return { povprecje: casi.reduce((a, b) => a + b, 0) / casi.length, znanih: casi.length };
}

const meritve: { stran: number; kartic: number; znanih: number; povprecje: number | null }[] = [];
for (const stran of [1, 2, 3]) {
  const ctx = await browser.newContext({
    locale: "sl-SI",
    userAgent: uporabniskiAgent(),
  });
  await razbremeniKontekst(ctx).catch(() => {});
  const page = await ctx.newPage();
  try {
    const r = await page.goto(vir.seznamUrl(rezina, stran), { waitUntil: "domcontentloaded", timeout: 45_000 });
    const status = r?.status() ?? 0;
    if (status === 403 || status === 429) {
      console.error(`\nVir je vrnil HTTP ${status} — meritev prekinjena, brez ponovnega poskusa.`);
      break;
    }
    await page.waitForTimeout(1500);
    await preveriIzziv(page);
    const { kartice } = await vir.preberiSeznam(page);
    const { povprecje, znanih } = await povprecnaStarost(kartice.map((k) => k.virId));
    meritve.push({ stran, kartic: kartice.length, znanih, povprecje });
    console.log(
      `stran ${stran}: kartic ${kartice.length}, v bazi znanih ${znanih}` +
        (povprecje ? `, povprečno prvič videno ${new Date(povprecje).toLocaleString("sl-SI")}` : "")
    );
  } catch (e) {
    console.error(`stran ${stran}: ${e instanceof Error ? e.message : String(e)}`);
    break;
  } finally {
    await page.close();
    await ctx.close();
  }
  if (stran < 3) await new Promise((r) => setTimeout(r, vir.omejitve.zamikMs));
}
await browser.close();

const uporabne = meritve.filter((m) => m.povprecje !== null && m.znanih >= 5);
if (uporabne.length < 2) {
  console.log(
    `\nIZID: premalo podatkov (potrebni sta vsaj dve strani z vsaj petimi znanimi oglasi). ` +
      `Zastavice razvrsceniPoNovosti NE vklapljaj.`
  );
  process.exitCode = 1;
} else {
  const prva = uporabne[0].povprecje as number;
  const zadnja = uporabne[uporabne.length - 1].povprecje as number;
  const razlikaUr = (prva - zadnja) / 3_600_000;
  const razvrsceno = razlikaUr > 1;
  console.log(
    `\nPrva stran je v povprečju ${razlikaUr.toFixed(1)} h mlajša od zadnje merjene.\n` +
      (razvrsceno
        ? `IZID: seznam JE razvrščen od najnovejšega — razvrsceniPoNovosti: true je upravičena.`
        : `IZID: razvrstitev po novosti NI potrjena. Zastavice ne vklapljaj: inkrementalno branje bi ` +
          `tiho izpustilo del trga.`)
  );
  process.exitCode = razvrsceno ? 0 : 1;
}

await new Promise((r) => setTimeout(r, 300));
