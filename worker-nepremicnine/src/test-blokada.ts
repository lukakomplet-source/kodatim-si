import "dotenv/config";
import { connect } from "./db.js";
import { faktorHitrosti, hlajenjeDo, preberiBlokado, zabelezBlokado, zabelezUspeh } from "./samopopravilo.js";

/**
 * Preverba spomina na blokado: premor se ob ponovitvah daljša, hitrost se
 * vrača počasi, en čist pregled je ne vrne.
 *
 * Test uporablja izmišljeno ime vira, da se ne dotakne resničnih zapisov, in
 * za sabo pospravi.
 *
 *   npx tsx src/test-blokada.ts
 */

const VIR = "test-vir.example";
const db = connect();
let padlo = 0;

const trdi = (ime: string, pogoj: boolean, kaj: string) => {
  if (!pogoj) padlo += 1;
  console.log(`${pogoj ? "OK   " : "PADLO"} ${ime}: ${kaj}`);
};

const pocisti = async () => {
  await db.from("nep_statistika").delete().eq("kljuc", `blokada:${VIR}`);
};

await pocisti();

// Čist začetek: brez hlajenja, polna hitrost.
trdi("brez zapisa", (await faktorHitrosti(db, VIR)) === 1, "faktor je 1");
trdi("brez zapisa", (await hlajenjeDo(db, VIR)) === null, "hlajenja ni");

// Prva blokada spoštuje adapterjevo nastavitev.
await zabelezBlokado(db, VIR, 6, "prva blokada");
let s = await preberiBlokado(db, VIR);
const ur1 = (new Date(s.do as string).getTime() - Date.now()) / 3_600_000;
trdi("1. blokada", s.stopnja === 1 && s.faktor === 2, `stopnja ${s.stopnja}, faktor ${s.faktor}`);
trdi("1. blokada", ur1 > 5.9 && ur1 < 6.1, `premor ${ur1.toFixed(1)} h (adapterjevih 6)`);

// Druga zapored: daljši premor in dvojni faktor.
await zabelezBlokado(db, VIR, 6, "druga blokada");
s = await preberiBlokado(db, VIR);
const ur2 = (new Date(s.do as string).getTime() - Date.now()) / 3_600_000;
trdi("2. blokada", s.stopnja === 2 && s.faktor === 4, `stopnja ${s.stopnja}, faktor ${s.faktor}`);
trdi("2. blokada", ur2 > ur1, `premor ${ur2.toFixed(1)} h je daljši od prvega`);

// Faktor je omejen — počasnost ima mejo, sicer bi vir sčasoma brali enkrat na uro.
await zabelezBlokado(db, VIR, 6, "tretja");
await zabelezBlokado(db, VIR, 6, "cetrta");
await zabelezBlokado(db, VIR, 6, "peta");
s = await preberiBlokado(db, VIR);
trdi("meja", s.faktor === 4, `faktor ostane 4 (in ne raste v nedogled)`);
trdi("meja", s.stopnja === 4, `stopnja se ustavi pri 4`);
const ur5 = (new Date(s.do as string).getTime() - Date.now()) / 3_600_000;
trdi("meja", ur5 > 47 && ur5 < 49, `najdaljši premor je 48 h (${ur5.toFixed(1)})`);

// Hlajenje je zdaj dejavno.
trdi("hlajenje", (await hlajenjeDo(db, VIR)) !== null, "vir počiva");

// En čist pregled: hlajenje pade, hitrost pa NE.
await zabelezUspeh(db, VIR);
s = await preberiBlokado(db, VIR);
trdi("1. čist pregled", s.do === null, "hlajenje odpravljeno");
trdi("1. čist pregled", s.faktor === 4 && s.cistih === 1, `faktor ostane ${s.faktor} (${s.cistih}/3)`);

// Drugi čist pregled: še vedno ne.
await zabelezUspeh(db, VIR);
s = await preberiBlokado(db, VIR);
trdi("2. čist pregled", s.faktor === 4 && s.cistih === 2, `faktor ostane ${s.faktor} (${s.cistih}/3)`);

// Tretji: en korak hitrosti nazaj.
await zabelezUspeh(db, VIR);
s = await preberiBlokado(db, VIR);
trdi("3. čist pregled", s.faktor === 2 && s.cistih === 0, `faktor spuščen na ${s.faktor}`);

// Blokada med okrevanjem ponastavi štetje in spet podvoji.
await zabelezBlokado(db, VIR, 6, "blokada med okrevanjem");
s = await preberiBlokado(db, VIR);
trdi("blokada med okrevanjem", s.faktor === 4 && s.cistih === 0, `faktor spet ${s.faktor}, štetje ponastavljeno`);

await pocisti();
const { data: ostanek } = await db.from("nep_statistika").select("kljuc").eq("kljuc", `blokada:${VIR}`).maybeSingle();
trdi("pospravljeno", !ostanek, "testni zapis pobrisan");

console.log(padlo === 0 ? "\nVse je v redu." : `\n${padlo} preverb je padlo.`);
// Kratek predah pred izhodom: odjemalec baze ima še odprte vtičnice in
// takojšen konec procesa na Windowsu sproži trditev v libuv (async.c:94) —
// po že izpisanem rezultatu, a z izhodno kodo 1, zaradi česar je test
// izgledal kot padel, čeprav so vse preverbe uspele.
await new Promise((r) => setTimeout(r, 300));
process.exitCode = padlo === 0 ? 0 : 1;
