import { cenaOglasa, detajlIzSurovega, normaliziraj as normNep } from "./viri/nepremicnine-net.js";
import { detajlIzSurovegaBolha } from "./viri/bolha.js";
import { detajlIzSurovegaSalomon } from "./viri/salomon.js";
import type { SurovaKartica } from "./viri/vmesnik.js";

/**
 * Regresijski test razčlenjevalnikov — za vsako napako, ki jo je adversarni
 * pregled 21. 8. 2026 potrdil, en primer.
 *
 * Vse te funkcije so čiste in tečejo v Node, ne v brskalniku, prav zato da
 * jih je mogoče preveriti brez omrežja in brez vira.
 *
 *   npm run test:adapterji
 */

let padlo = 0;
const trdi = (ime: string, dobljeno: unknown, pricakovano: unknown) => {
  const ok = JSON.stringify(dobljeno) === JSON.stringify(pricakovano);
  if (!ok) padlo += 1;
  console.log(`${ok ? "OK   " : "PADLO"} ${ime}: ${JSON.stringify(dobljeno)}${ok ? "" : ` (pričakovano ${JSON.stringify(pricakovano)})`}`);
};

const kartica = (delno: Partial<SurovaKartica>): SurovaKartica => ({
  url: "https://www.nepremicnine.net/oglasi-prodaja/x_1/",
  virId: "1",
  lokacija: null,
  naslovVrstica: null,
  opis: null,
  cenaBesedilo: null,
  telefon: null,
  agencija: null,
  slika: null,
  stSlik: null,
  ...delno,
});

console.log("── nepremicnine.net: cena ─────────────────────────────────────");

trdi(
  "navadna cena iz mikropodatka",
  cenaOglasa(kartica({ cenaBesedilo: "185000.00", opis: "80 m2, prodamo. Cena: 185.000,00 EUR" }), 80),
  185000
);
// Oglas 7304321 (Slavina): price=0.40 je bil v bazi "parcela za 40 centov".
trdi(
  "cena na m2 se pomnozi s povrsino",
  cenaOglasa(kartica({ cenaBesedilo: "0.40", opis: "27.663 m2, posest, prodamo. Cena: 0,40 EUR/m2" }), 27663),
  11065
);
trdi(
  "cena na m2 brez povrsine ostane NEZNANA",
  cenaOglasa(kartica({ cenaBesedilo: "0.40", opis: "posest, prodamo. Cena: 0,40 EUR/m2" }), null),
  null
);
trdi("brez cene", cenaOglasa(kartica({ cenaBesedilo: null }), 100), null);
trdi(
  "slovenski zapis se ne pomnozi x100",
  cenaOglasa(kartica({ cenaBesedilo: "3.850.000,00 €", opis: "hisa, prodamo" }), 300),
  3850000
);

console.log("\n── nepremicnine.net: podtip in lastnosti ──────────────────────");

const nep = normNep(
  kartica({
    naslovVrstica: "Prodaja: Hiša, Samostojna BISTRICA OB DRAVI 208",
    opis: "208,4 m2, zgrajen l. 1980, 730 m2 zemljišča",
    cenaBesedilo: "365000.00",
  }),
  { oznaka: "prodaja/podravska/hisa", posel: "prodaja", regija: "podravska", tip: "hisa" }
);
// Prej je split(/s+/) iz "Samostojna BISTRICA" naredil zmazek.
trdi("podtip", nep.podtip, "samostojna");
trdi("povrsina iz opisa", nep.povrsinaM2, 208.4);
trdi("zemljisce iz opisa", nep.zemljisceM2, 730);

const d = detajlIzSurovega({
  vrstice: ["Velikost: 82,00 m2", "Št. spalnic: 2", "Št. kopalnic: 1", "Balkon", "D (85 - 120 kWh/m2a)"],
  slike: ["https://img.nepremicnine.net/a.jpg", "https://img.nepremicnine.net/a.jpg"],
  prodajalec: "Zasebna ponudba",
  cena: "365000",
  telefon: "tel:041 663 707",
  opis: "opis",
});
// "Št. spalnic: 2" je z [\d.]+ vrnilo 0, ker je vzorec pobral piko iz "Št."
trdi("st. spalnic", d.stSpalnic, 2);
trdi("st. kopalnic", d.stKopalnic, 1);
trdi("velikost", d.povrsinaM2, 82);
trdi("energetska izkaznica brez predpone EI", d.energetskiRazred, "D (85 - 120 kWh/m2a)");
trdi("zasebna ponudba ni agencija", d.agencija, null);
trdi("telefon brez predpone", d.telefon, "041 663 707");
trdi("podvojene slike se odstranijo", d.slikeUrls, ["https://img.nepremicnine.net/a.jpg"]);

console.log("\n── bolha: stevila, tocno ujemanje, zastavice ──────────────────");

const b = detajlIzSurovegaBolha({
  pari: [
    "Bivalna površina", "173.72 m²",
    "Površina parcele", "400,00 m²",
    "Klet", "Ne",
    "Dvigalo", "Da",
    "Število sob", "6",
  ],
  skupine: [],
  cena: "1.050.000 €",
  sifra: "Šifra oglasa: 15780363",
  posrednik: "Agencija d.o.o.",
  opis: "opis",
  slike: [],
});
// Slepo brisanje pik je iz 173,72 m2 naredilo 17.372 m2.
trdi("angleski zapis stevila", b.povrsinaM2, 173.72);
trdi("slovenski zapis stevila", b.zemljisceM2, 400);
// "Površina" kot delno ujemanje je jemala parcelo namesto bivalne povrsine.
trdi("bivalna povrsina ni parcela", b.povrsinaM2 !== b.zemljisceM2, true);
trdi("klet: Ne pomeni ne", b.klet, false);
trdi("dvigalo: Da pomeni da", b.dvigalo, true);
trdi("cena", b.cenaEur, 1050000);
trdi("sifra brez predpone", b.sifraOglasa, "15780363");

// Kadar bivalne povrsine ni, "Površina" ostane zadnja izbira in sme prevzeti.
const b2 = detajlIzSurovegaBolha({
  pari: ["Površina", "94,40 m²"],
  skupine: [],
  cena: null,
  sifra: null,
  posrednik: null,
  opis: null,
  slike: [],
});
trdi("zadnja izbira 'Površina' deluje", b2.povrsinaM2, 94.4);
trdi("neznana zastavica ostane neznana", b2.klet, null);

console.log("\n── salomon: telefon in zastavice ──────────────────────────────");

const s = detajlIzSurovegaSalomon({
  vrstice: [
    { glava: true, celice: ["Država", "Regija"] },
    { glava: false, celice: ["Slovenija", "Obalno-kraška"] },
    { glava: true, celice: ["Površina", "Občina"] },
    { glava: false, celice: ["112 m2", "Koper"] },
    { glava: true, celice: ["Letnik izgradnje", "Naselje"] },
    { glava: false, celice: ["2010", "Koper"] },
    { glava: true, celice: ["Balkon"] },
    { glava: false, celice: ["Ne"] },
  ],
  slike: [],
  opis: null,
  cena: "490,00 €",
  sifra: "22.SZQE3",
  objava: "2022-09-28T08:11:20+02:00",
  telefon: "tel:030 704 336",
  prodajalec: "RE/MAX nepremičnine",
});
// Vrstice glav in vrednosti so LOCENE; zaporedno parjenje jih je zamaknilo.
trdi("parjenje po stolpcih: povrsina", s.povrsinaM2, 112);
trdi("parjenje po stolpcih: letnik", s.letoIzgradnje, 2010);
trdi("kraj iz naselja", s.kraj, "Koper");
trdi("telefon brez predpone tel:", s.telefon, "030 704 336");
trdi("balkon: Ne pomeni ne", s.balkon, false);
trdi("datum objave", s.datumObjave, "2022-09-28");
trdi("cena", s.cenaEur, 490);

console.log(padlo === 0 ? "\nVse je v redu." : `\n${padlo} preverb je padlo.`);
process.exitCode = padlo === 0 ? 0 : 1;
