import {
  izracunajPosel,
  ocenaPosla,
  refinanciranje,
  projekcijaEquityja,
  type VnosPosla,
} from "../src/lib/nepremicnine/posel";
import { predlagajFinanciranje } from "../src/lib/nepremicnine/predlogFinanciranja";

/**
 * Prenos iz Kompletka mora biti DOBESEDEN. Merilo je posel "Parmova ulica 4,
 * Vojnik", kakor ga je Kompletko izračunal 31. 8. 2026 (posnetek zaslona):
 * vložek 106.800 €, tok 634 €/mes, CoC 7,1 %, LTV 46,8 %, DSCR 1,64, ROI
 * 23,3 %, equity iz prenove 132.500 €, ocena 85/100 "invest".
 *
 * Če se katera od teh številk razide, prenos ni prenos, ampak nov kalkulator —
 * in obe strani bi uporabniku za isti posel kazali različni resnici.
 *
 *   npx tsx scripts/test-nep-posel.ts
 */

let padlo = 0;
const trdi = (ime: string, dobljeno: number | null, pricakovano: number, toleranca = 0.6) => {
  const ok = dobljeno !== null && Math.abs(dobljeno - pricakovano) <= toleranca;
  if (!ok) padlo += 1;
  console.log(`${ok ? "OK   " : "PADLO"} ${ime}: ${dobljeno} (pričakovano ${pricakovano})`);
};

const parmova: VnosPosla = {
  kupnina: 105_000,
  datumNakupa: null, // posel v presoji
  vrednostDanes: 150_000,
  pologPct: 35,
  obrestnaMeraPct: 3.9,
  dobaLet: 30,
  stroskiNakupa: 1_500,
  prenova: 0,
  rezervaPrenovePct: 10,
  drugiZacetniStroski: 7_500,
  vrednostPoPrenovi: 450_000,
  postavkePrenove: [
    { naziv: "Del objekta", znesek: 45_000, stopnjaPct: 6 },
    { naziv: "Oprema", znesek: 30_000, stopnjaPct: 20 },
    { naziv: "Celoten objekt", znesek: 80_000, stopnjaPct: 3 },
    { naziv: "Del objekta", znesek: 30_000, stopnjaPct: 6 },
  ],
  kreditZaPrenovo: true,
  pologZaPrenovoPct: 30,
  stEnot: 3,
  najemninaNaEnoto: 650,
  prazninePct: 5,
  upravljanjePct: 0,
  vzdrzevanjePct: 0,
  rezervaCapexPct: 0,
  zavarovanjeLeto: 500,
  komunalaLeto: 500,
  davkiLeto: 0,
  // Posnetek kaže "skupaj stroški 2.700 €" pri vidnih 1.000 € — preostanek je
  // v poljih, ki jih posnetek ne kaže. Vpišemo ga tu, da se NOI ujema.
  drugiStroskiLeto: 1_700,
  rastVrednostiPct: 3,
  ciljRoiPct: 12,
  ciljCocPct: 8,
  ciljLtvPct: 70,
  amortizacijaZgradbePct: 3,
  delezZemljiscaPct: 20,
  davcniRezim: "doo",
  stroskiRefinanciranja: 0,
  obrestiRefinanciranjaPct: null,
  dobaRefinanciranjaLet: null,
};

const f = izracunajPosel(parmova, "2026-08-31");

console.log("— Kompletko, Parmova ulica 4 (31. 8. 2026) —");
trdi("prenova z rezervo", f.prenovaSkupaj, 203_500);
trdi("all-in", f.allIn, 317_500);
trdi("kredit nakupa", f.kreditNakupa, 68_250);
trdi("kredit prenove", f.kreditPrenove, 142_450);
trdi("kredit skupaj", f.kredit, 210_700);
trdi("polog skupaj", f.polog, 97_800);
trdi("gotovina za stroške", f.gotovinaZaStroske, 9_000);
trdi("moj vložek", f.vlozeno, 106_800);
trdi("mesečni obrok", f.obrok, 994, 1);
trdi("efektivni prihodek", f.efektivniPrihodek, 22_230);
trdi("NOI", f.noi, 19_530);
trdi("denarni tok / leto", f.denarniTok, 7_604, 12);
trdi("denarni tok / mesec", f.denarniTokMesec, 634, 1);
trdi("cash-on-cash %", f.cashOnCash, 7.1, 0.06);
trdi("LTV %", f.ltv, 46.8, 0.06);
trdi("DSCR", f.dscr, 1.64, 0.006);
trdi("equity iz prenove", f.equityIzPrenove, 132_500);
trdi("donos nepremičnine (na strošek) %", f.donosNaStrosek, 6.2, 0.06);
trdi("razlika do obresti %", f.razlikaDoObresti, 2.3, 0.06);
trdi("amortizacija prenove / leto", f.amortizacijaPrenove, 12_900);
trdi("davek d.o.o.", f.davekLeto, 0);
// Kompletko v analizi kaže 2.504 € (obresti iz načrta), v predogledu 2.489 €
// (obresti = kredit × obresti). Prenos sledi analizi, ki je natančnejša.
trdi("amortizacija prihrani davka", f.prihranekAmortizacije, 2_504, 15);
trdi("odplačana glavnica 1. leto", f.glavnicaLetos, 3_775, 12);
trdi("rast vrednosti / leto", f.rastLeto, 13_500);
trdi("celotni donos / leto", f.celotniDonosLeto, 24_880, 30);
trdi("ROI %", f.roi, 23.3, 0.06);

const refi = refinanciranje(parmova, f);
trdi("refinanciranje — izplačilo", refi.izplacilo, 104_300, 1);

const ocena = ocenaPosla(parmova, f, refi);
trdi("ocena / 100", ocena.tocke, 85, 0);
console.log(`${ocena.razsodba === "invest" ? "OK   " : "PADLO"} razsodba: ${ocena.razsodba} (pričakovano invest)`);
if (ocena.razsodba !== "invest") padlo += 1;
for (const p of ocena.preverbe) console.log(`       ${p.naziv}: ${p.tocke}/${p.najvecTock} — ${p.podrobnost}`);

// Projekcija: po 10 letih mora biti dolg manjši in equity večji kot danes.
const proj = projekcijaEquityja(f, parmova.rastVrednostiPct, 10);
console.log(`${proj[9].saldo < f.saldoKredita && proj[9].equity > f.equity ? "OK   " : "PADLO"} projekcija 10 let: saldo ${proj[9].saldo}, equity ${proj[9].equity}`);
if (!(proj[9].saldo < f.saldoKredita && proj[9].equity > f.equity)) padlo += 1;

// Predlogi financiranja: pri Parmovi mora obstajati vsaj en izvedljiv predlog.
const predlog = predlagajFinanciranje({
  kupnina: parmova.kupnina,
  allIn: f.allIn,
  vrednost: f.vrednost,
  noi: f.noi,
  obrestnaMeraPct: parmova.obrestnaMeraPct,
  ciljCocPct: parmova.ciljCocPct,
  ciljLtvPct: parmova.ciljLtvPct,
  najmanjsiPologPct: 30,
});
console.log(`${predlog.predlogi.length > 0 ? "OK   " : "PADLO"} predlogi financiranja: ${predlog.predlogi.map((p) => `${p.naziv} ${p.pologPct} %/${p.dobaLet} let`).join(", ") || predlog.tezava}`);
if (predlog.predlogi.length === 0) padlo += 1;
if (predlog.predlogi.some((p) => p.pologPct < 30)) {
  padlo += 1;
  console.log("PADLO predlog pod najmanjšim pologom 30 %");
}

// ——— Robni primeri, ki ne smejo vreči napake ———
// Prazen vnos: nič ne sme biti NaN; brez vrednosti ni LTV; brez kredita ni DSCR.
// (CoC pa NI null: 9.000 € stroškov brez kredita je še vedno vložek.)
const prazen = izracunajPosel({ ...parmova, kupnina: 0, stEnot: 0, postavkePrenove: [], vrednostPoPrenovi: null, vrednostDanes: null }, "2026-08-31");
const brezNaN = Object.values(prazen).every((x) => typeof x !== "number" || Number.isFinite(x));
console.log(`${brezNaN && prazen.ltv === null && prazen.dscr === null ? "OK   " : "PADLO"} prazen vnos: brez NaN, LTV null, DSCR null`);
if (!(brezNaN && prazen.ltv === null && prazen.dscr === null)) padlo += 1;

const brezKredita = izracunajPosel({ ...parmova, pologPct: 100, kreditZaPrenovo: false }, "2026-08-31");
console.log(`${brezKredita.dscr === null && brezKredita.obrok === 0 ? "OK   " : "PADLO"} brez kredita: DSCR null, obrok 0`);
if (!(brezKredita.dscr === null && brezKredita.obrok === 0)) padlo += 1;

// Prag zasedenosti upošteva, da odstotni stroški padajo s prihodkom.
const zOdstotki = izracunajPosel({ ...parmova, upravljanjePct: 10, vzdrzevanjePct: 10 }, "2026-08-31");
const rocno = ((zOdstotki.stroskiFiksni + zOdstotki.obrokiLeto) / (1 - 0.2) / zOdstotki.brutoNajemnina) * 100;
trdi("prag zasedenosti (odstotni stroški)", zOdstotki.pragZasedenosti, Math.round(rocno * 100) / 100, 0.02);

console.log(padlo === 0 ? "\nVse je v redu." : `\n${padlo} preverb je padlo.`);
process.exitCode = padlo === 0 ? 0 : 1;
