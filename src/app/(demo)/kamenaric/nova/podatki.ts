/**
 * Vsebina NOVE demo strani za Kamenarič d.o.o. — povzeta po njihovi obstoječi
 * strani kamenaric.si (pregledano 14. 10. 2026).
 *
 * Vse cene so z njihove strani ali iz njihovih katalogov (VPC brez DDV):
 * promocijska voda (cenik po količinah), rokovniki R0040–R0044, škatlice za
 * značke, oblikovanje. Kjer cene na njihovi strani ni, je ne izmišljujemo —
 * izdelek je označen »cena na povpraševanje«.
 *
 * Fotografije so z njihove strani (public/demo/kamenaric/izdelki) — za pravo
 * stran jih prosimo za originale v večji ločljivosti.
 */

export type Paket = 1 | 2 | 3;

export const KONTAKT = {
  podjetje: "Kamenarič d.o.o.",
  telefon: "041 336 547",
  telefonMednarodno: "+386 (0)41 336 547",
  telefonHref: "tel:+38641336547",
  email: "prodaja@kamenaric.si",
  naslov: "Zadobrovška c. 25, 1260 Ljubljana",
  ure: "pon–pet 7:00–16:30",
};

/** Pogoji poslovanja, kot jih navajajo sami. */
export const POGOJI = {
  najmanjse: 100, // € neto
  brezPostnine: 250, // € neto, dostava po Sloveniji
};

export const PAKETI: { st: Paket; ime: string; kratko: string }[] = [
  { st: 1, ime: "Osnovna", kratko: "Predstavitvena stran s katalogom" },
  { st: 2, ime: "Trgovina", kratko: "Spletna trgovina s cenami in košarico" },
  { st: 3, ime: "Premium", kratko: "B2B portal + AI" },
];

export const SLIKE = "/demo/kamenaric/izdelki";
export const slika = (ime: string) => `${SLIKE}/${ime}.jpg`;

export type KategorijaId =
  | "voda"
  | "rokovniki"
  | "oblacila"
  | "ultra"
  | "diseci"
  | "darila"
  | "brisace"
  | "embalaza"
  | "koledarji"
  | "pisarna"
  | "sladko"
  | "promocija"
  | "promet";

export const KATEGORIJE: { id: KategorijaId; ime: string; opis: string; slika: string }[] = [
  { id: "voda", ime: "Promocijska voda", opis: "Plastenke 0,5 l in 1,5 l z vašo etiketo", slika: "voda-promo" },
  { id: "rokovniki", ime: "Rokovniki 2027", opis: "Rokovniki, poslovniki, planerji", slika: "rok-r0044" },
  { id: "oblacila", ime: "Oblačila in tekstil", opis: "Majice, polo, softshell, kape", slika: "tekstil-kape" },
  { id: "ultra", ime: "Ultra vidno", opis: "Odsevna in delovna oblačila", slika: "ultra-polo" },
  { id: "diseci", ime: "Dišeči obeski", opis: "Reklamni osvežilci zraka", slika: "diseci-novi" },
  { id: "darila", ime: "Poslovna darila", opis: "Dežniki, termovke, torbe, usnje", slika: "dezniki" },
  { id: "brisace", ime: "Brisače", opis: "Beardream, z vezenjem ali tiskom", slika: "brisace-tumb" },
  { id: "embalaza", ime: "Embalaža in vrečke", opis: "Vrečke, trakovi, škatlice", slika: "vrecke-darilne" },
  { id: "koledarji", ime: "Koledarji 2027", opis: "Stenski, namizni, voščilnice", slika: "koledar-vas" },
  { id: "pisarna", ime: "Pisarna in tehnika", opis: "USB, polnilci, pisarniški dodatki", slika: "polnilci" },
  { id: "sladko", ime: "Sladko in slano", opis: "Bonboni, čokolade, piškoti", slika: "sladko-razno" },
  { id: "promocija", ime: "Sejmi in promocija", opis: "Roll-up, stene, zastave, značke", slika: "stena2" },
  { id: "promet", ime: "Za promet", opis: "Avto oprema, senčniki, odsevniki", slika: "sencnik" },
];

/** [od količine, cena na kos brez DDV] — naraščajoče po količini. */
export type Stopnja = [number, number];

export type Izdelek = {
  id: string;
  kategorija: KategorijaId;
  ime: string;
  opis: string;
  slika: string;
  /** Fiksna cena na kos (VPC brez DDV), kadar jo navajajo. */
  cena?: number;
  /** Cenik po količinah, kadar ga navajajo (voda). */
  stopnje?: Stopnja[];
  min?: number;
  rok?: string;
  lastnosti?: string[];
  izbira?: { ime: string; moznosti: string[] };
  oznaka?: string;
  /** Slika je stran iz kataloga — prikaži celo (contain), ne obreži. */
  katalog?: boolean;
};

const POKROVCKI = ["bel", "črn", "zelen", "rdeč", "moder", "rumen", "oranžen"];

export const IZDELKI: Izdelek[] = [
  // ── promocijska voda (cenik z njihove strani)
  {
    id: "voda-05",
    kategorija: "voda",
    ime: "Izvirska voda 0,5 l z vašo etiketo",
    opis: "Naravna izvirska voda v plastenki, etiketa z vašim designom.",
    slika: "voda-promo",
    stopnje: [
      [120, 0.4802],
      [240, 0.4018],
      [360, 0.343],
      [480, 0.3136],
      [600, 0.2842],
      [1200, 0.2646],
    ],
    min: 120,
    rok: "7 delovnih dni",
    izbira: { ime: "Barva pokrovčka", moznosti: POKROVCKI },
  },
  {
    id: "voda-15",
    kategorija: "voda",
    ime: "Izvirska voda 1,5 l z vašo etiketo",
    opis: "Naročilo po paleti (504 kos).",
    slika: "voda-prangl",
    stopnje: [[504, 0.495]],
    min: 504,
    rok: "10 delovnih dni",
  },
  {
    id: "voda-okus",
    kategorija: "voda",
    ime: "Izvirska voda z okusom 0,5 l",
    opis: "Istega okusa vsaj 240 kos.",
    slika: "voda-okusi",
    stopnje: [
      [240, 0.5586],
      [360, 0.4998],
      [600, 0.4606],
      [1200, 0.441],
    ],
    min: 240,
    rok: "do 21 delovnih dni",
    izbira: { ime: "Okus", moznosti: ["bezeg", "breskev", "jabolko", "jagoda", "limona + pomaranča"] },
  },
  {
    id: "ledeni-caj",
    kategorija: "voda",
    ime: "Ledeni čaj 0,5 l, breskev",
    opis: "Z vašo etiketo.",
    slika: "voda-okusi",
    stopnje: [
      [240, 0.588],
      [360, 0.5292],
      [600, 0.49],
      [1200, 0.4704],
    ],
    min: 240,
    rok: "do 21 delovnih dni",
  },
  {
    id: "voda-multivitamin",
    kategorija: "voda",
    ime: "Izvirska voda z multivitamini 0,5 l",
    opis: "Z okusom brusnice.",
    slika: "voda-objava",
    stopnje: [[300, 0.637]],
    min: 300,
    rok: "do 21 delovnih dni",
  },

  // ── rokovniki 2027 (cene iz njihovega kataloga, VPC brez DDV)
  { id: "r0044", kategorija: "rokovniki", ime: "Rokovnik tedenski R0044", opis: "Tedenski datumi 2027, 200 × 260 mm", slika: "rok-r0044", cena: 6.9, katalog: true, oznaka: "Novo 2027" },
  { id: "r0043", kategorija: "rokovniki", ime: "Rokovnik dnevni R0043", opis: "Dnevni datumi 2027, 170 × 240 mm", slika: "rok-r0043", cena: 7.2, katalog: true, oznaka: "Novo 2027" },
  { id: "r0041", kategorija: "rokovniki", ime: "Rokovnik Viva R0041", opis: "200 × 260 mm, 6 barv", slika: "rok-r0041", cena: 6.99, katalog: true, izbira: { ime: "Barva", moznosti: ["črna", "rdeča", "modra", "siva", "zelena", "bež"] } },
  { id: "r0040", kategorija: "rokovniki", ime: "Rokovnik Semiš R0040", opis: "200 × 260 mm, semiš", slika: "rok-r0040", cena: 6.99, katalog: true },
  { id: "r0042", kategorija: "rokovniki", ime: "Rokovnik Clasik R0042", opis: "200 × 260 mm, klasičen", slika: "rok-r0042", cena: 6.9, katalog: true },
  { id: "bova", kategorija: "rokovniki", ime: "Poslovnik A5 planer BOVA", opis: "Dnevnik A5, več barv", slika: "rok-bova", katalog: true },
  { id: "lago", kategorija: "rokovniki", ime: "Poslovnik B5 LAGO", opis: "Dnevnik B5", slika: "rok-lago", katalog: true },
  { id: "ostuni", kategorija: "rokovniki", ime: "Poslovnik OSTUNI 20 × 27", opis: "Dnevnik A5 / 20 × 27 cm", slika: "rok-ostuni", katalog: true },

  // ── oblačila
  { id: "t-majice", kategorija: "oblacila", ime: "T-majice", opis: "Bombažne majice, potisk ali vezenje", slika: "tekstil-majice" },
  { id: "polo", kategorija: "oblacila", ime: "Polo majice", opis: "Za ekipe in prodajalne", slika: "tekstil-polo" },
  { id: "softshell", kategorija: "oblacila", ime: "Softshell jakne", opis: "Z vezenim logotipom", slika: "tekstil-softshell" },
  { id: "kape", kategorija: "oblacila", ime: "Kape s šiltom", opis: "Baseball in pletene kape", slika: "tekstil-kape" },
  { id: "jakne", kategorija: "oblacila", ime: "Jakne in vetrovke", opis: "Za zunanje ekipe", slika: "tekstil-jakne" },
  { id: "delovna", kategorija: "oblacila", ime: "Delovna oblačila", opis: "Kombinezoni, hlače, brezrokavniki", slika: "tekstil-delovna" },

  // ── ultra vidno
  { id: "ultra-polo", kategorija: "ultra", ime: "Ultra vidna polo majica SOL's", opis: "Visoko vidna, z odsevnimi trakovi", slika: "ultra-polo", katalog: true },
  { id: "ultra-brezrokavnik", kategorija: "ultra", ime: "Ultra vidni brezrokavnik Korntex", opis: "Odsevni, z vašim tiskom", slika: "ultra-brezrokavnik", katalog: true },
  { id: "ultra-softshell", kategorija: "ultra", ime: "Ultra vidna softshell jakna", opis: "Korntex", slika: "ultra-softshell", katalog: true },
  { id: "ultra-kapa", kategorija: "ultra", ime: "Ultra vidna kapa s šiltom", opis: "Odsevne obrobe", slika: "ultra-kapa", katalog: true },
  { id: "ultra-nahrbtnik", kategorija: "ultra", ime: "Ultra vidni nahrbtnik", opis: "Za kolesarje in šolarje", slika: "ultra-nahrbtnik", katalog: true },

  // ── dišeči obeski
  {
    id: "diseci-obeski",
    kategorija: "diseci",
    ime: "Dišeči obesek z vašim tiskom",
    opis: "Pravokotnik ali krog. Izdelan v EU, brez zdravju nevarnih snovi.",
    slika: "diseci-novi",
    rok: "okoli 14 delovnih dni",
    izbira: { ime: "Vonj", moznosti: ["bor", "češnja", "jabolko", "lavanda", "limona", "mango", "pomaranča", "vanilija"] },
    lastnosti: ["Druge oblike: do 21 delovnih dni", "Nova oblika: min. 1.000 kos (+5 dni za orodje)"],
    oznaka: "Izdelano v EU",
  },
  { id: "diseci-oblike", kategorija: "diseci", ime: "Dišeči obeski — oblike", opis: "Vse obstoječe oblike in izreze", slika: "diseci-3", katalog: true },

  // ── poslovna darila
  { id: "dezniki", kategorija: "darila", ime: "Dežniki", opis: "Na sto načinov — zložljivi, golf, s tiskom", slika: "dezniki" },
  { id: "termovke", kategorija: "darila", ime: "Termovke in čutare", opis: "Gravura ali tisk", slika: "termovke" },
  { id: "potovalke", kategorija: "darila", ime: "Torbe in nahrbtniki", opis: "Potovalke, nahrbtniki", slika: "potovalka" },
  { id: "denarnice", kategorija: "darila", ime: "Usnje in denarnice", opis: "Usnjena galanterija", slika: "denarnice" },
  { id: "vino", kategorija: "darila", ime: "Darila za vino", opis: "Seti in embalaža za vino", slika: "vino" },
  { id: "odeje", kategorija: "darila", ime: "Flis odeje", opis: "Z vezenim logotipom", slika: "odeje" },

  // ── brisače
  { id: "brisace-classic", kategorija: "brisace", ime: "Brisače CLASSIC", opis: "Bombaž, 450 g/m²", slika: "brisace-classic", katalog: true },
  { id: "brisace-premium", kategorija: "brisace", ime: "Brisače premium sport", opis: "Bombaž, 500 g/m²", slika: "brisace-premium" },
  { id: "brisace-sublim", kategorija: "brisace", ime: "Sublim brisače", opis: "Bombaž 400 g/m², s PE robom za polnobarvni tisk", slika: "brisace-sublim" },
  { id: "brisace-golf", kategorija: "brisace", ime: "Golf brisače", opis: "Bombaž, 450 g/m²", slika: "brisace-golf", katalog: true },
  { id: "brisace-otroska", kategorija: "brisace", ime: "Otroška brisača s kapuco", opis: "Bombaž, 360 g/m²", slika: "brisace-otroska" },

  // ── embalaža
  { id: "skatlice-znacke", kategorija: "embalaza", ime: "Škatlice za značke 42 × 42 × 22", opis: "Z vložkom", slika: "znacka", cena: 0.38 },
  { id: "darilne-vrecke", kategorija: "embalaza", ime: "Darilne vrečke", opis: "Papirnate, s potiskom", slika: "vrecke-darilne" },
  { id: "pe-vrecke", kategorija: "embalaza", ime: "PE vrečke s potiskom", opis: "Vrečke-torbe", slika: "pe-vrecka" },
  { id: "tekstilne-torbe", kategorija: "embalaza", ime: "Tekstilne torbe", opis: "Bombažne, TNT", slika: "vreca-torba" },
  { id: "zavijalni-trak", kategorija: "embalaza", ime: "Potiskani zavijalni trak", opis: "Z vašim napisom", slika: "zavijalni-trak" },
  { id: "darilni-trak", kategorija: "embalaza", ime: "Darilni trak s tiskom", opis: "Satenast, tiskan", slika: "darilni-trak" },
  { id: "embalaza-pisala", kategorija: "embalaza", ime: "Embalaža za pisala", opis: "Škatlice in tulci", slika: "embalaza-pisala" },

  // ── koledarji
  { id: "koledar-vas", kategorija: "koledarji", ime: "Koledar po vašem designu", opis: "Nad 200 kos ekonomičen barvni dotisk pred vezavo", slika: "koledar-vas", oznaka: "Novo 2027" },
  { id: "koledar-stenski", kategorija: "koledarji", ime: "Stenski in trimesečni koledarji", opis: "Tri-, štiri-, šestmesečni", slika: "koledar-stenski" },
  { id: "koledar-namizni", kategorija: "koledarji", ime: "Namizni koledarji", opis: "Ležeči planer", slika: "koledar-namizni" },
  { id: "voscilnice", kategorija: "koledarji", ime: "Voščilnice", opis: "Novoletne, s tiskom", slika: "voscilnice" },
  { id: "koledarska-okenca", kategorija: "koledarji", ime: "Koledarska okenca in zatiči", opis: "Za večmesečne koledarje", slika: "koledarska-okenca", katalog: true },

  // ── pisarna in tehnika
  { id: "polnilci", kategorija: "pisarna", ime: "Polnilci in powerbanki", opis: "Brezžični polnilci s tiskom", slika: "polnilci" },
  { id: "usb", kategorija: "pisarna", ime: "USB ključki", opis: "Z logotipom", slika: "usb" },
  { id: "pisarna-dodatki", kategorija: "pisarna", ime: "Pisarniški dodatki", opis: "Lističi, mape, vizitkarji", slika: "pisarna" },
  { id: "loncki", kategorija: "pisarna", ime: "Keramični lončki", opis: "Polnobarvni tisk", slika: "loncek" },

  // ── sladko in slano
  { id: "sladko-mix", kategorija: "sladko", ime: "Promocijske sladkarije", opis: "Bonboni, čokolade, lizike, žitne tablice", slika: "sladko-razno" },
  { id: "cokolade", kategorija: "sladko", ime: "Čokolade z vašim ovitkom", opis: "Personalizirane", slika: "cokolade" },
  { id: "praline", kategorija: "sladko", ime: "Personalizirane praline", opis: "Z vašim logotipom", slika: "praline-krka" },
  { id: "piskoti", kategorija: "sladko", ime: "Reklamni piškoti", opis: "S sporočilom v notranjosti", slika: "piskoti" },
  { id: "bonboni", kategorija: "sladko", ime: "Trdi bonboni", opis: "V ovitku z logotipom", slika: "bonboni" },

  // ── sejmi in promocija
  { id: "stene", kategorija: "promocija", ime: "Promocijske sejemske stene", opis: "Tekstilne, ukrivljene", slika: "stena2" },
  { id: "rollup", kategorija: "promocija", ime: "Roll-up pano", opis: "S torbo za prenos", slika: "rollup" },
  { id: "zastave", kategorija: "promocija", ime: "Reklamne zastave", opis: "Beachflag 300 in 420 cm", slika: "zastava" },
  { id: "priponke", kategorija: "promocija", ime: "Priponke in bedži", opis: "Po naročilu", slika: "priponke" },
  { id: "ovratni-trakovi", kategorija: "promocija", ime: "Ovratni trakovi", opis: "S tiskom", slika: "ovratni-trak" },
  { id: "vzigalniki", kategorija: "promocija", ime: "Vžigalniki s tiskom", opis: "Polnobarvni", slika: "vzigalniki" },
  { id: "vetrnice", kategorija: "promocija", ime: "Vetrnice", opis: "Za dogodke in sejme", slika: "vetrnice" },

  // ── promet
  { id: "avto-set", kategorija: "promet", ime: "Set obvezne opreme za avto", opis: "V torbici z vašim logotipom", slika: "avto-set" },
  { id: "sencniki", kategorija: "promet", ime: "Avto senčniki", opis: "Reklamni, potiskani", slika: "sencnik" },
  { id: "promet-oprema", kategorija: "promet", ime: "Oprema za promet", opis: "Vratne blazine, potovalni pripomočki", slika: "promet" },
  { id: "svetila", kategorija: "promet", ime: "Svetilke", opis: "Kolesarske in ročne svetilke", slika: "svetila" },
];

/** Tehnike brandiranja z njihove strani »dodelave«. */
export const DODELAVE = [
  { ime: "Globoki / slepi / reliefni tisk", opis: "Vtisnjen logotip brez barve — usnje, rokovniki, mape.", slika: "tisk-globoki" },
  { ime: "Sitotisk", opis: "Žive barve na večjih ploskvah — tekstil, vrečke, dežniki.", slika: "tisk-sito" },
  { ime: "Tampotisk", opis: "Majhne in ukrivljene površine — pisala, vžigalniki, ključki.", slika: "tisk-tampo" },
  { ime: "Zlatotisk / srebro / baker", opis: "Kovinski sijaj za darila in voščilnice.", slika: "tisk-zlato" },
  { ime: "Lasersko graviranje", opis: "Trajno — kovina, les, termovke, usnje.", slika: "tisk-laser" },
  { ime: "Vezenje", opis: "Za polo majice, kape, brisače in odeje.", slika: "tisk-vezenje" },
  { ime: "Preslikač tisk na tekstil", opis: "Polnobarvni motivi na majicah in dežnikih.", slika: "preslikac" },
  { ime: "Digitalni tisk", opis: "Fotografije in prelivi brez omejitve barv.", slika: null },
  { ime: "Sublimacijski tisk", opis: "Polnobarvno na brisače, lončke, poliester.", slika: null },
];

/** Prava dela z njihove strani (galerija promocijske vode). */
export const REFERENCE = [
  { ime: "UL FGG", opis: "Voda 0,5 l z etiketo fakultete", slika: "voda-ulfgg" },
  { ime: "Burek Olimpija", opis: "Voda z etiketo za lokale", slika: "voda-burek2" },
  { ime: "Prangl", opis: "Voda 1,5 l z etiketo podjetja", slika: "voda-prangl" },
];

export const eur = (n: number, dec = 2) =>
  n.toLocaleString("sl-SI", { style: "currency", currency: "EUR", minimumFractionDigits: dec, maximumFractionDigits: dec });

export function stopnjaZa(izdelek: Izdelek, kolicina: number): Stopnja | null {
  if (!izdelek.stopnje) return null;
  let s: Stopnja | null = null;
  for (const st of izdelek.stopnje) if (kolicina >= st[0]) s = st;
  return s;
}

/** Cena na kos za dano količino; null = cena na povpraševanje. */
export function cenaNaKos(izdelek: Izdelek, kolicina: number): number | null {
  if (izdelek.stopnje) return stopnjaZa(izdelek, kolicina)?.[1] ?? izdelek.stopnje[0][1];
  return izdelek.cena ?? null;
}

export function cenaOd(izdelek: Izdelek): number | null {
  if (izdelek.stopnje) return izdelek.stopnje[izdelek.stopnje.length - 1][1];
  return izdelek.cena ?? null;
}

/** Največji prihranek na kos med prvo in zadnjo stopnjo (npr. voda −45 %). */
export function najvecjiPrihranek(izdelek: Izdelek) {
  const s = izdelek.stopnje;
  if (!s || s.length < 2) return 0;
  return 1 - s[s.length - 1][1] / s[0][1];
}

/** Dostava vode po Sloveniji, po njihovem ceniku (0,5 l). */
export function dostavaVode(kolicina: number) {
  if (kolicina <= 600) return { opis: "pol palete", cena: 33 };
  return { opis: "paleta", cena: 43 };
}

export const VSEBINA_PAKETOV: Record<Paket, { naslov: string; tocke: string[]; zakaj: string }> = {
  1: {
    naslov: "Paket 1 — Predstavitvena stran s katalogom",
    tocke: [
      "Vseh 13 skupin izdelkov s fotografijami in opisi — pregledno, na telefonu in računalniku",
      "Cenik promocijske vode in rokovnikov z izračunom po količini",
      "Pogoji poslovanja na vidnem mestu: minimum 100 €, brez poštnine nad 250 €",
      "Obrazec za povpraševanje z nalaganjem logotipa — izdelek se izpolni sam",
      "Osnovni SEO: »promocijska voda«, »rokovniki 2027«, »dišeči obeski z logotipom« …",
    ],
    zakaj: "Danes stranka na vaši strani išče po menijih in maili za ceno. Nova stran ji v nekaj sekundah pokaže, kaj imate, koliko približno stane in kako naročiti.",
  },
  2: {
    naslov: "Paket 2 — Spletna trgovina",
    tocke: [
      "Vse iz paketa 1",
      "Košarica: izdelki s ceno se naročijo takoj, ostali gredo v isto povpraševanje",
      "Samodejno preverjanje minimuma 100 € in vrstica »še X € do brezplačne dostave«",
      "Količinski popusti pri vsakem izdelku — stranka vidi, koliko prihrani pri večji količini",
      "Naročilo vzorca z enim klikom",
      "Akcije in sezonske ponudbe (koledarji, rokovniki, novoletna darila)",
    ],
    zakaj: "Stranka si sama izračuna 600 plastenk vode in naroči ob 23h. Vi dobite urejeno naročilo z logotipom v prilogi — brez petih mailov za ponudbo.",
  },
  3: {
    naslov: "Paket 3 — Premium B2B portal",
    tocke: [
      "Vse iz paketa 2",
      "Prijava za stalne stranke z njihovimi cenami in popusti",
      "»Ponovi lansko naročilo« — rokovniki, koledarji, voda za dogodek",
      "Predogled etikete: stranka naloži logotip in vidi svojo plastenko",
      "AI pomočnik, ki iz stavka »600 plastenk vode z logotipom do petka« sestavi ponudbo",
      "Sledenje naročilu in samodejni opomnik pred sezono",
    ],
    zakaj: "Stalne stranke naročajo vsako leto isto — portal jih spomni sam in jim pusti, da ponovijo z enim klikom.",
  },
};
