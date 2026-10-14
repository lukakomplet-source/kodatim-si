/**
 * Vsebina demo strani za Kamenarič d.o.o. (embalaža, tisk, poslovna darila).
 *
 * Kategorije in postopki so povzeti po njihovi obstoječi strani
 * (kamenaric.si/-embalaza/embalaza.htm). Cene so izmišljeni PRIMERI za demo
 * trgovine in so na strani tudi tako označene — edina prava je škatla za
 * značke (0,38 €), ki jo navajajo sami.
 */

export const KONTAKT = {
  podjetje: "Kamenarič d.o.o.",
  telefon: "041 336 547",
  telefonHref: "tel:+38641336547",
};

export type Paket = 1 | 2 | 3;

export const PAKETI: { st: Paket; ime: string; kratko: string }[] = [
  { st: 1, ime: "Osnovna", kratko: "Predstavitvena stran" },
  { st: 2, ime: "Trgovina", kratko: "Spletna trgovina + konfigurator" },
  { st: 3, ime: "Premium", kratko: "B2B portal + AI" },
];

/** Slike so z Unsplash (glej public/demo/kamenaric/VIRI.txt) — dokler stranka ne pošlje svojih. */
export const SLIKE = "/demo/kamenaric";

export const KATEGORIJE = [
  { id: "darila", ime: "Poslovna darila", opis: "Kakovostna darila za vaše poslovne partnerje", slika: "kat-darila" },
  { id: "oblacila", ime: "Promocijska oblačila", opis: "Majice, polo majice in delovna oblačila", slika: "kat-oblacila" },
  { id: "vrecke", ime: "Vrečke", opis: "Papirnate, PE in nakupovalne vrečke s potiskom", slika: "kat-vrecke" },
  { id: "skatle", ime: "Embalaža in trakovi", opis: "Škatle, darilna embalaža in potiskani trakovi", slika: "kat-skatle" },
  { id: "pisarna", ime: "Pisarna in pisala", opis: "Pisala, beležke in pisarniški pripomočki", slika: "kat-pisarna" },
  { id: "koledarji", ime: "Koledarji in tisk", opis: "Stenski, namizni koledarji in voščilnice", slika: "kat-koledarji" },
] as const;

export const POSTOPKI = [
  { ime: "Tampotisk", opis: "Natančen tisk na ukrivljene in majhne površine — pisala, vžigalniki, ključki." },
  { ime: "Globoki tisk", opis: "Logotip, vtisnjen v material. Elegantno, brez barve, trajno." },
  { ime: "Slepi tisk", opis: "Reliefni vtis brez barve — za premium škatle in mape." },
  { ime: "Reliefni tisk", opis: "Dvignjen motiv, ki ga začutiš s prsti. Embalaža, ki se jo zapomniš." },
  { ime: "QR embalaža", opis: "Embalaža s QR kodo, ki stranko pelje na vašo stran, akcijo ali navodila." },
  { ime: "Dodelave", opis: "Rezanje, lepljenje, ročaji, okenca — embalaža do zadnjega detajla." },
];

export type Izdelek = {
  id: string;
  ime: string;
  kategorija: (typeof KATEGORIJE)[number]["id"];
  cena: number; // € / kos brez tiska, PRIMER
  min: number; // najmanjša količina
  opis: string;
  barva: string; // za ilustracijo
  oblika: "vrecka" | "skatla" | "trak" | "koledar" | "pisalo" | "majica";
  slika: string; // datoteka v SLIKE, brez .jpg
};

export const IZDELKI: Izdelek[] = [
  { id: "papir-vrecka", ime: "Papirnata vrečka kraft", kategorija: "vrecke", cena: 0.42, min: 100, opis: "32 × 12 × 41 cm, vrvični ročaj", barva: "#c69c6d", oblika: "vrecka", slika: "papir-vrecka" },
  { id: "pe-vrecka", ime: "PE vrečka z izsekanim ročajem", kategorija: "vrecke", cena: 0.09, min: 500, opis: "40 × 50 cm, 50 µm", barva: "#e8e8e8", oblika: "vrecka", slika: "pe-vrecka" },
  { id: "nakupovalna", ime: "Nakupovalna torba iz netkane tkanine", kategorija: "vrecke", cena: 0.85, min: 100, opis: "38 × 42 cm, dolgi ročaji", barva: "#1f2937", oblika: "vrecka", slika: "nakupovalna" },
  { id: "skatla-znacke", ime: "Škatla za značke", kategorija: "skatle", cena: 0.38, min: 50, opis: "Kartonska, z vložkom", barva: "#f5f5f4", oblika: "skatla", slika: "skatla-znacke" },
  { id: "darilna-skatla", ime: "Darilna škatla s pokrovom", kategorija: "skatle", cena: 1.9, min: 50, opis: "20 × 20 × 8 cm, mat laminat", barva: "#111827", oblika: "skatla", slika: "darilna-skatla" },
  { id: "posiljka", ime: "Poštna škatla", kategorija: "skatle", cena: 0.65, min: 100, opis: "31 × 22 × 10 cm, valovita lepenka", barva: "#b8875a", oblika: "skatla", slika: "posiljka" },
  { id: "trak", ime: "Potiskan darilni trak", kategorija: "skatle", cena: 0.12, min: 200, opis: "na tekoči meter, 25 mm", barva: "#dc2626", oblika: "trak", slika: "trak" },
  { id: "koledar", ime: "Stenski koledar 12 listov", kategorija: "koledarji", cena: 3.4, min: 50, opis: "A3, spirala, vaša fotografija na vsakem mesecu", barva: "#fafaf9", oblika: "koledar", slika: "koledar" },
  { id: "pisalo", ime: "Kovinsko pisalo", kategorija: "pisarna", cena: 0.95, min: 100, opis: "modro črnilo, tampotisk ali gravura", barva: "#334155", oblika: "pisalo", slika: "pisalo" },
  { id: "polo", ime: "Polo majica", kategorija: "oblacila", cena: 6.9, min: 20, opis: "pique bombaž, S–3XL", barva: "#0f172a", oblika: "majica", slika: "polo" },
];

export const TISKI = [
  { id: "brez", ime: "Brez tiska", doplacilo: 0, priprava: 0 },
  { id: "1b", ime: "Tisk 1 barva", doplacilo: 0.08, priprava: 25 },
  { id: "2b", ime: "Tisk 2 barvi", doplacilo: 0.14, priprava: 40 },
  { id: "polno", ime: "Polnobarvni tisk", doplacilo: 0.22, priprava: 55 },
  { id: "slepi", ime: "Slepi / reliefni tisk", doplacilo: 0.3, priprava: 90 },
] as const;

/** Količinski popust — večja naročila, nižja cena na kos. */
export function popust(kolicina: number) {
  if (kolicina >= 5000) return 0.25;
  if (kolicina >= 1000) return 0.15;
  if (kolicina >= 500) return 0.08;
  return 0;
}

export function izracun(izdelek: Izdelek, kolicina: number, tiskId: string) {
  const tisk = TISKI.find((t) => t.id === tiskId) ?? TISKI[0];
  const naKos = (izdelek.cena + tisk.doplacilo) * (1 - popust(kolicina));
  const skupaj = naKos * kolicina + tisk.priprava;
  return { naKos, priprava: tisk.priprava, skupaj, popust: popust(kolicina) };
}

export const eur = (n: number) =>
  n.toLocaleString("sl-SI", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

/** Kaj stranka dobi v posameznem paketu — prikazano na dnu vsake verzije. */
export const VSEBINA_PAKETOV: Record<Paket, { naslov: string; tocke: string[]; zakaj: string }> = {
  1: {
    naslov: "Paket 1 — Osnovna spletna stran",
    tocke: [
      "Moderna stran, ki deluje na telefonu, tablici in računalniku",
      "Vse kategorije, postopki tiska in reference na enem mestu",
      "Gumb za klic in obrazec za povpraševanje z nalaganjem logotipa",
      "Osnovni SEO: Google najde »embalaža s tiskom«, »vrečke z logotipom« …",
      "Hitro nalaganje, varna domena (https), Google Maps",
    ],
    zakaj: "Prvi vtis šteje: stranka, ki pride z Googla, v 5 sekundah vidi, da ste resen dobavitelj — in vas pokliče, namesto da gre h konkurenci.",
  },
  2: {
    naslov: "Paket 2 — Spletna trgovina",
    tocke: [
      "Vse iz paketa 1",
      "Katalog izdelkov s cenami in količinskimi popusti",
      "Konfigurator: izdelek + količina + vrsta tiska + logotip → takojšnja cena",
      "Košarica in naročilo 24/7 — tudi ob nedeljah ob 23h",
      "Plačilo po predračunu ali s kartico, samodejni e-mail potrdila",
      "Pregled naročil v enostavnem skrbniškem vmesniku",
    ],
    zakaj: "Manj telefonskih klicev za »koliko stane 500 vrečk«, več zaključenih naročil. Stranka si ceno izračuna sama — vi dobite urejeno naročilo z logotipom v prilogi.",
  },
  3: {
    naslov: "Paket 3 — Premium B2B portal",
    tocke: [
      "Vse iz paketa 2",
      "Prijava za stalne poslovne stranke z njihovimi cenami in popusti",
      "Ponovi naročilo z enim klikom (lanski koledarji, lanske vrečke …)",
      "Sledenje naročilu: priprava → tisk → odprema",
      "AI pomočnik, ki iz stavka »500 vrečk z logotipom do petka« sestavi ponudbo",
      "3D predogled embalaže z logotipom stranke še pred naročilom",
      "Samodejna PDF ponudba in opomnik pred sezono (koledarji, novoletna darila)",
    ],
    zakaj: "Stalne stranke se vračajo same: lanska naročila jih čakajo, sezonski opomnik jih pokliče namesto vas, 3D predogled pa odpravi »nisem si tako predstavljal«.",
  },
};
