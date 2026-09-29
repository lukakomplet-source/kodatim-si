import { nastanitevIz } from "./parse.js";

/**
 * Detektor nastanitvenih objektov. Vsi stavki so dobesedno iz baze (28. 9.
 * 2026) — tudi pasti, ki so prvo različico zavedle, da je studio v bližini
 * hotela hotel.
 */
type Primer = { ime: string; besedilo: string; tip: string | null; pricakovano: Record<string, unknown> };

const primeri: Primer[] = [
  {
    ime: "penzion s sobami v opisu",
    besedilo: "Poslovni prostor, Drugo KAMNIK slovni prostor, zgrajen l. 1847, adaptiran l. 2018, 604 m2 zemljišča, penzion z restavracijo in 11 sobami, k...",
    tip: "poslovni_prostor",
    pricakovano: { vrsta: "penzion", sob: 11, enot: 11 },
  },
  {
    ime: "apart-hotel: enote in postelje",
    besedilo: "SEŽANA - APART-HOTEL v izgradnji, 13 enot / 28 postelj, 16km",
    tip: "posest",
    pricakovano: { vrsta: "hotel", enot: 13, lezisc: 28 },
  },
  {
    ime: "siol: strukturirana kategorija",
    besedilo: "Hostel Turistični objekt, Hotel · 986,00 m² · BAJTIGA d.o.o.",
    tip: "pocitniski_objekt",
    pricakovano: { vrsta: "hotel", enot: null },
  },
  {
    ime: "hotel z zvezdicami v naslovu",
    besedilo: "HOTEL 3 ZVEZDICE, V BLIŽINI TERMALNEGA ZDRAVILIŠČA",
    tip: "poslovni_prostor",
    pricakovano: { vrsta: "hotel" },
  },
  {
    ime: "hotelski kompleks",
    besedilo: "NAPRODAJ HOTELSKI KOMPLEKS V ORMOŽU",
    tip: "poslovni_prostor",
    pricakovano: { vrsta: "hotel" },
  },
  {
    ime: "hotel iz ležišč: ocena, ne trditev",
    besedilo: "Prodamo manjši hotel ob jezeru, 60+10 ležišč, restavracija.",
    tip: "poslovni_prostor",
    pricakovano: { vrsta: "hotel", enot: null, lezisc: 60, enotOcena: 24 },
  },
  {
    ime: "apartmajska hiša brez te besede",
    besedilo: "Hiša z 8 apartmaji na otoku Krku, 150 m od morja",
    tip: "hisa",
    pricakovano: { vrsta: "apartmajska_hisa", apartmajev: 8, enot: 8 },
  },
  // ── Pasti ────────────────────────────────────────────────────────────────
  {
    ime: "PAST: studio v bližini hotela",
    besedilo: "MEDULIN! STUDIO APARTMA. BLIŽINA HOTELA BELVEDERE.",
    tip: "pocitniski_objekt",
    pricakovano: { vrsta: null },
  },
  {
    ime: "PAST: stanovanje v aparthotelu",
    besedilo: "Umag. Prodamo stanovanje v luksuznem aparthotelu!",
    tip: "stanovanje",
    pricakovano: { vrsta: null },
  },
  {
    ime: "PAST: parcela nad hotelom",
    besedilo: "ZAZIDLJIVA PARCELA NAD HOTELOM METROPOL",
    tip: "posest",
    pricakovano: { vrsta: null },
  },
  {
    ime: "PAST: dnevna soba z 2 ležišči (vila)",
    besedilo: "Posest, Zazidljiva Novo CRIKVENICA 572 m2. Po projektu je tloris vile naslednji: Pritličje: - Dnevna soba z 2 ležišči - Kuhinja",
    tip: "posest",
    pricakovano: { vrsta: null, lezisc: null },
  },
  {
    ime: "PAST: družinska hiša s 5 sobami ni 5 enot",
    besedilo: "Hiša, Samostojna ŽALEC, 180 m2, 5 sob, 2 kopalnici, garaža",
    tip: "hisa",
    pricakovano: { vrsta: null, enot: null },
  },
  {
    ime: "PAST: hotel omenjen globoko v opisu hiše",
    besedilo:
      "Hiša, Samostojna BLED. Prodamo lepo obnovljeno družinsko hišo z vrtom in garažo, v mirnem naselju, primerno za družino. Hiša ima tri spalnice, dnevni prostor, kuhinjo, dve kopalnici in teraso s pogledom na gore. Hotel Park je oddaljen deset minut hoje.",
    tip: "hisa",
    pricakovano: { vrsta: null },
  },
  {
    ime: "PAST: letnica ni število sob",
    besedilo: "Penzion, zgrajen 2004 sobe prenovljene",
    tip: "poslovni_prostor",
    pricakovano: { vrsta: "penzion", sob: null },
  },
  {
    ime: "PAST: šifra pred apartmajem ni število",
    besedilo: "Medulin Medulin REGI 117 Apartma 42 m2",
    tip: "pocitniski_objekt",
    pricakovano: { vrsta: null, apartmajev: null },
  },
  {
    ime: "PAST: siolova kategorija Turistični objekt, Vikend",
    besedilo: "BIVALNI VIKEND S HIŠNO ŠTEVILKO NA VELIKI PARCELI Turistični objekt, Vikend · 0336",
    tip: "pocitniski_objekt",
    pricakovano: { vrsta: null },
  },
  {
    ime: "PAST: možnost kamp prikolice",
    besedilo: "ELITNA PARCELA OB KRKI. MOŽNOST KAMP PRIKOLICE, AVTODOMA IN PIKNIK prostora",
    tip: "posest",
    pricakovano: { vrsta: null },
  },
  {
    ime: "PAST: hiša z enim apartmajem",
    besedilo: "Hiša z apartmajem in vrtom, Portorož",
    tip: "hisa",
    pricakovano: { vrsta: null },
  },
  {
    ime: "hiša s 6 apartmaji (s, ne z)",
    besedilo: "Crikvenica - hiša s 6 apartmaji, bazen Samostojna hiša Bivalna površina: 320 m2",
    tip: "hisa",
    pricakovano: { vrsta: "apartmajska_hisa", enot: 6 },
  },
  {
    ime: "PAST: možnost ni trditev (recenzija thinkslovenia)",
    besedilo: "Nekdanji hotel v Bohinju, možnost ureditve 15 enot, 900 m2",
    tip: "poslovni_prostor",
    pricakovano: { vrsta: "hotel", enot: null, enotOcena: 15 },
  },
  {
    ime: "PAST: gradbeno dovoljenje za apartmaje ni obstoječih 20 enot",
    besedilo: "Hotel za obnovo, pridobljeno gradbeno dovoljenje za 20 apartmajev",
    tip: "poslovni_prostor",
    pricakovano: { vrsta: "hotel", enot: null, enotOcena: 20 },
  },
  {
    ime: "trditev ostane trditev ob možnosti",
    besedilo: "Penzion z 11 sobami, možnost dozidave še 6 sob",
    tip: "poslovni_prostor",
    pricakovano: { vrsta: "penzion", enot: 11, enotOcena: null },
  },
];

let napak = 0;
for (const p of primeri) {
  const r = nastanitevIz(p.besedilo, p.tip) as Record<string, unknown>;
  console.log(`\n${p.ime}`);
  for (const [k, v] of Object.entries(p.pricakovano)) {
    const ok = r[k] === v;
    if (!ok) napak += 1;
    console.log(`  ${ok ? "OK    " : "NAPAKA"} ${k}=${JSON.stringify(r[k])} (pričakovano ${JSON.stringify(v)})`);
  }
}
console.log(napak === 0 ? "\nVSE OK" : `\n${napak} NAPAK`);
process.exitCode = napak === 0 ? 0 : 1;
