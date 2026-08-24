import "dotenv/config";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { connect } from "./db.js";
import { jeIzziv } from "./izziv.js";
import { zabelezBlokado, zabelezUspeh, preberiBlokado } from "./samopopravilo.js";
import {
  klasificiraj,
  klasificirajPrazno,
  jeBlokada,
  ustaviKrog,
  potrebujePreverbo,
  proracunVira,
  oceniZdravje,
  zaznajAnomalijo,
  zabelezDogodek,
  preberiDnevnik,
  pocakajNaVrsto,
  zabelezParserOkvaro,
  pocistiParserOkvaro,
} from "./stanje-vira.js";

/**
 * Devet scenarijev iz zahteve — VSI brez enega samega zahtevka na bolho.
 *
 * To je poanta te datoteke. Doslej se je vsaka sprememba adapterja preizkusila
 * na živem viru; prav tako preizkušanje je 24. 8. 2026 pripeljalo do CAPTCHE.
 * Zaslon preverjanja, zavrnitev in prazna kategorija so zdaj shranjeni v
 * fixtures/bolha/ in se berejo z diska.
 *
 *   npx tsx src/test-stanje.ts
 */

const VIR = "test-vir.example";
const db = connect();
let padlo = 0;

const trdi = (ime: string, pogoj: boolean, kaj: string) => {
  if (!pogoj) padlo += 1;
  console.log(`${pogoj ? "OK   " : "PADLO"} ${ime}: ${kaj}`);
};

const pocisti = async () => {
  for (const k of [`blokada:${VIR}`, `proracun:${VIR}`, `poraba:${VIR}`, `ritem:${VIR}`, `dnevnik:${VIR}`, `parser:${VIR}`]) {
    await db.from("nep_statistika").delete().eq("kljuc", k);
  }
};

await pocisti();

// ——— SCENARIJ 1: normalen odgovor ———
trdi("1. normalen odgovor", klasificiraj("") === "neznano", "prazno sporočilo ni blokada");
// klasificirajPrazno() se poklice SAMO, kadar kartic ni. "Vir pravi 385,
// prebrali smo 0" zato ni normalen odgovor, ampak najbolj jasen dokaz, da se
// je stran spremenila — in prav to mora povedati.
trdi(
  "1. normalen odgovor",
  klasificirajPrazno({ skupajZadetkov: 385, dolzinaBesedila: 40_000 }) === "parser",
  "vir pravi 385 zadetkov, prebrali pa smo 0 → parser, ne blokada"
);

// ——— SCENARIJ 2 in 3: časovna omejitev, ponovljena ———
trdi("2. časovna omejitev", klasificiraj("zOmejitvijo: page.goto timeout 60000ms") === "cas_potekel", "prepoznana");
trdi("2. časovna omejitev", !jeBlokada("cas_potekel"), "NI blokada — vir nas ni zavrnil");
trdi("2. časovna omejitev", !ustaviKrog("cas_potekel"), "krog se nadaljuje");
trdi("3. napaka strežnika", klasificiraj("HTTP 503 Service Unavailable") === "streznik", "500-ke so težava vira");
trdi("3. napaka strežnika", !jeBlokada("streznik"), "12-urno hlajenje zaradi TUJE okvare bi bilo neumno");

// ——— SCENARIJ 4: CAPTCHA / zavrnitev dostopa ———
const captcha = readFileSync(new URL("../fixtures/bolha/captcha.html", import.meta.url), "utf8");
const zavrnjen = readFileSync(new URL("../fixtures/bolha/dostop-zavrnjen.html", import.meta.url), "utf8");
const prazna = readFileSync(new URL("../fixtures/bolha/prazna-kategorija.html", import.meta.url), "utf8");

const brskalnik = await chromium.launch({ args: ["--no-sandbox"] });
const stran = await brskalnik.newPage();

const naloziIzTeksta = async (html: string) => {
  await stran.setContent(html, { waitUntil: "domcontentloaded" });
  const naslov = await stran.title();
  const besedilo = await stran.evaluate(() => (document.body ? document.body.innerText.slice(0, 500) : ""));
  return { naslov, besedilo };
};

const c = await naloziIzTeksta(captcha);
trdi("4. CAPTCHA", jeIzziv(c.naslov, c.besedilo), "zaslon preverjanja prepoznan iz fixture");
trdi("4. CAPTCHA", klasificiraj("vir blokira (preverjanje CAPTCHA)") === "captcha", "klasificirana kot captcha");
trdi("4. CAPTCHA", jeBlokada("captcha") && ustaviKrog("captcha"), "ustavi krog in sproži hlajenje");

const z = await naloziIzTeksta(zavrnjen);
trdi("4. zavrnitev", !jeIzziv(z.naslov, z.besedilo), "403 ni zaslon preverjanja (loči se po statusu)");
trdi("4. zavrnitev", klasificiraj("HTTP 403 - vir blokira") === "zavrnjen_dostop", "klasificirana kot zavrnitev");

const p = await naloziIzTeksta(prazna);
trdi("9. prazna kategorija", !jeIzziv(p.naslov, p.besedilo), "prazna kategorija NI zaslon preverjanja");
trdi(
  "9. prazna kategorija",
  klasificirajPrazno({ skupajZadetkov: 0, dolzinaBesedila: p.besedilo.length }) === "prazno",
  "vir sam pove 0 zadetkov — gremo naprej, brez hlajenja"
);
await brskalnik.close();

// ——— SCENARIJ 8: spremenjena postavitev ———
trdi(
  "8. spremenjen HTML",
  klasificirajPrazno({ skupajZadetkov: null, dolzinaBesedila: 45_000 }) === "parser",
  "polna stran brez kartic = pokvarjen parser, ne blokada"
);
trdi("8. spremenjen HTML", !jeBlokada("parser"), "upočasnjevanje pokvarjenega parserja ne popravi");
trdi("8. spremenjen HTML", ustaviKrog("parser"), "a krog vseeno ustavi — brez podatkov ni smisla nadaljevati");
trdi(
  "8. spremenjen HTML",
  klasificirajPrazno({ skupajZadetkov: null, dolzinaBesedila: 300 }) === "neznano",
  "kratka prazna stran je lahko marsikaj — ne ugibamo"
);

// ——— SCENARIJ 5, 6, 7: hlajenje → preverba → okrevanje / ponovna zavrnitev ———
trdi("5. pred blokado", !potrebujePreverbo(await preberiBlokado(db, VIR)), "brez zgodovine ni preverbe");

await zabelezBlokado(db, VIR, 6, "testna blokada");
let s = await preberiBlokado(db, VIR);
trdi("5. med hlajenjem", !potrebujePreverbo(s), "med hlajenjem se vira ne dotaknemo");

// Prevrtimo hlajenje v preteklost — brez čakanja šestih ur.
await db.from("nep_statistika").upsert({
  kljuc: `blokada:${VIR}`,
  podatki: { ...s, do: new Date(Date.now() - 60_000).toISOString() },
  izracunano: new Date().toISOString(),
});
s = await preberiBlokado(db, VIR);
trdi("5. po hlajenju", potrebujePreverbo(s), "prvi obisk po hlajenju je PREVERBA (en zahtevek, ne 40)");

let zd = await oceniZdravje(db, VIR, { omogocen: true });
trdi("5. po hlajenju", zd.stanje === "preverba", `stanje = ${zd.stanje}`);

await zabelezUspeh(db, VIR);
s = await preberiBlokado(db, VIR);
trdi("6. preverba uspela", !potrebujePreverbo(s), "po uspešni preverbi normalen krog");
zd = await oceniZdravje(db, VIR, { omogocen: true });
trdi("6. preverba uspela", zd.stanje === "okrevanje", `stanje = ${zd.stanje}, faktor ${zd.faktor}`);
trdi("6. preverba uspela", zd.faktor === 2, "razmiki ostanejo dvojni do treh čistih pregledov");

await zabelezBlokado(db, VIR, 6, "preverba spet zavrnjena");
s = await preberiBlokado(db, VIR);
trdi("7. preverba padla", s.faktor === 4 && s.cistih === 0, `faktor ${s.faktor}, hlajenje spet teče`);
zd = await oceniZdravje(db, VIR, { omogocen: true });
trdi("7. preverba padla", zd.stanje === "hlajenje" && zd.ocena <= 25, `stanje ${zd.stanje}, ocena ${zd.ocena}`);

// ——— PARSER: zastavica in njena odprava ———
await zabelezParserOkvaro(db, VIR, "kartic ni na 3 straneh zapored");
zd = await oceniZdravje(db, VIR, { omogocen: true });
trdi("parser", zd.stanje === "parser_pokvarjen", "okvara parserja prevlada nad hlajenjem v prikazu");
await pocistiParserOkvaro(db, VIR);
zd = await oceniZdravje(db, VIR, { omogocen: true });
trdi("parser", zd.stanje !== "parser_pokvarjen", "po uspešnem branju zastavica pade");

trdi("izklopljen vir", (await oceniZdravje(db, VIR, { omogocen: false })).stanje === "izklopljen", "prikaže se kot izklopljen");

// ——— PRORAČUN: skupen, poreže se ob blokadi ———
const pr = await proracunVira(db, VIR, { osnova: 60, korak: 20, strop: 160, rezervacijaZbiralnika: 40 });
trdi("proračun", pr.skupaj === 60, `danes je bila blokada → osnova ${pr.skupaj}`);
trdi("proračun", pr.zaZbiralnik === 40 && pr.zaArhiv === 20, `zbiralnik ${pr.zaZbiralnik}, arhiv ${pr.zaArhiv}`);

// Ključ dneva je LOKALEN, ne UTC: ob polnoči pri nas je v UTC še vceraj in
// zapis z ISO datumom bi se štel za včerajšnjega (natanko tako je ta preverba
// prvič padla — ob 00:05 po naši uri).
const d = new Date();
const danesLokalno = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
await db.from("nep_statistika").upsert({
  kljuc: `poraba:${VIR}`,
  podatki: { dan: danesLokalno, strani: 55 },
  izracunano: new Date().toISOString(),
});
const pr2 = await proracunVira(db, VIR, { osnova: 60, korak: 20, strop: 160, rezervacijaZbiralnika: 40 });
trdi("proračun", pr2.zaZbiralnik + pr2.zaArhiv <= 5, `po 55 porabljenih ostane ${pr2.zaZbiralnik}+${pr2.zaArhiv}`);

// ——— RITEM: drugi zahtevek počaka na prvega ———
await pocakajNaVrsto(db, VIR, 0);
const zacetek = Date.now();
const cakal = await pocakajNaVrsto(db, VIR, 2_000);
const dejansko = Date.now() - zacetek;
trdi("ritem", cakal > 1_000 && dejansko > 1_000, `drugi zahtevek je počakal ${Math.round(dejansko)} ms`);

// ——— ANOMALIJA ———
trdi(
  "anomalija",
  zaznajAnomalijo({ najdenih: 3, strani: 10, obicajnoNaStran: 25 }).jeAnomalija,
  "0,3 oglasa na stran namesto 25 → sumljivo"
);
trdi(
  "anomalija",
  !zaznajAnomalijo({ najdenih: 240, strani: 10, obicajnoNaStran: 25 }).jeAnomalija,
  "normalen izid ne sproži ničesar"
);
trdi(
  "anomalija",
  !zaznajAnomalijo({ najdenih: 900, strani: 10, obicajnoNaStran: 25 }).jeAnomalija,
  "VEČ od običajnega ni anomalija — varovalka je enosmerna"
);

// ——— DNEVNIK ———
await zabelezDogodek(db, VIR, { stanje: "hlajenje", kaj: "testni dogodek", kdo: "test" });
const dnevnik = await preberiDnevnik(db, VIR);
trdi("dnevnik", dnevnik.length === 1 && dnevnik[0].kaj === "testni dogodek", "dogodek zapisan in prebran");

await pocisti();
const { data: ostanek } = await db.from("nep_statistika").select("kljuc").like("kljuc", `%${VIR}`);
trdi("pospravljeno", (ostanek ?? []).length === 0, "testni zapisi pobrisani");

console.log(padlo === 0 ? "\nVse je v redu." : `\n${padlo} preverb je padlo.`);
// Predah pred izhodom — sicer libuv na Windowsu vrže trditev po že izpisanem
// rezultatu in test izgleda kot padel, čeprav so vse preverbe uspele.
await new Promise((r) => setTimeout(r, 300));
process.exitCode = padlo === 0 ? 0 : 1;
