import { razlozi, razlozVec } from "../src/lib/nepremicnine/poizvedba";

/**
 * Testi razčlenjevalnika naravnega jezika. Prvi primer je DOBESEDNI stavek
 * uporabnika (z zatipki vred), zaradi katerega investicijski cilj sploh
 * obstaja — če ta pade, je funkcionalnost pokvarjena, pa naj ostali prestanejo.
 */

type Primer = {
  ime: string;
  stavek: string;
  cilj: { enote: number; najemninaNaEnoto: number | null; proracun: number | null } | null;
  filtri?: Record<string, unknown>;
  brezRazumljeno?: string[];
};

const primeri: Primer[] = [
  {
    ime: "dobesedni stavek uporabnika (multi unit, 10enot po 650e, po prenovi 700k)",
    stavek:
      "daj najdi mi hišo ki bi bila primerna za multi unit pač da ima dosti kvadrature in vredi ceno pač da ni nora glede na osnovno ceno pa potem ko se bo prenovila da ima smisel za tisto rento v tistem kraju pač recimo najdeš mi hišo ali objekt ko se da naredit 10enot po 650e pa da je po prenovi pa to 700k recimo poglej ta kalkulator tut zram",
    cilj: { enote: 10, najemninaNaEnoto: 650, proracun: 700_000 },
    filtri: {
      posel: "prodaja",
      tipi: ["hisa", "poslovni_prostor"],
      cenaMax: 700_000,
      razvrsti: "cilj",
      vecEnot: undefined,
      zaInvesticijo: undefined,
    },
    brezRazumljeno: ["več enot", "investicijsko"],
  },
  {
    ime: "klasika ostane nespremenjena",
    stavek: "večstanovanjska hiša do 300k v Mariboru",
    cilj: null,
    filtri: { tipi: ["hisa"], vecEnot: true, cenaMax: 300_000, kraj: "maribor", regija: "podravska" },
  },
  {
    ime: "golo 'vsaj 3 enote' NI cilj",
    stavek: "vsaj 3 enote do 250k",
    cilj: null,
    filtri: { enotMin: 3, vecEnot: true, cenaMax: 250_000 },
  },
  {
    ime: "cilj z 'vse skupaj'",
    stavek: "hiša z 8 enot po 500e, vse skupaj 400k",
    cilj: { enote: 8, najemninaNaEnoto: 500, proracun: 400_000 },
    filtri: { tipi: ["hisa"], cenaMax: 400_000, razvrsti: "cilj" },
  },
  {
    ime: "proračun v evrih s tisočicami",
    stavek: "10 enot po 650 €, po prenovi 700.000 €",
    cilj: { enote: 10, najemninaNaEnoto: 650, proracun: 700_000 },
  },
  {
    ime: "brez cilja nič novega",
    stavek: "garsonjera v Ljubljani do 150k",
    cilj: null,
    filtri: { tipi: ["stanovanje"], cenaMax: 150_000, kraj: "ljubljana" },
  },
  {
    ime: "radij okoli kraja (sklon)",
    stavek: "večstanovanjske hiše do 300k, 15 km okoli Maribora",
    cilj: null,
    filtri: { tipi: ["hisa"], vecEnot: true, cenaMax: 300_000, radijKm: 15, radijKraj: "maribora", kraj: undefined, regija: undefined },
  },
  {
    ime: "blizu = privzeti radij",
    stavek: "hiša blizu Kopra",
    cilj: null,
    filtri: { tipi: ["hisa"], radijKm: 15, radijKraj: "kopra" },
  },
];

let napak = 0;
const preveri = (ime: string, ok: boolean, sporocilo: string) => {
  if (!ok) napak += 1;
  console.log(`  ${ok ? "OK    " : "NAPAKA"} ${ime}: ${sporocilo}`);
};

for (const p of primeri) {
  console.log(`\n${p.ime}`);
  const r = razlozi(p.stavek);

  preveri(
    "cilj",
    JSON.stringify(r.cilj) === JSON.stringify(p.cilj),
    `${JSON.stringify(r.cilj)} (pričakovano ${JSON.stringify(p.cilj)})`
  );

  for (const [k, v] of Object.entries(p.filtri ?? {})) {
    const dobil = (r.filtri as Record<string, unknown>)[k];
    preveri(`filtri.${k}`, JSON.stringify(dobil) === JSON.stringify(v), `${JSON.stringify(dobil)} (pričakovano ${JSON.stringify(v)})`);
  }

  for (const niz of p.brezRazumljeno ?? []) {
    preveri(`razumljeno brez „${niz}“`, !r.razumljeno.includes(niz), r.razumljeno.join(" · "));
  }
}

// Regresije iz adversarnega pregleda (vsaka je bila potrjena napaka).
console.log("\nregresije");
const r1 = razlozi("odstrani vse nad 250k");
preveri("odstrani nad: samo cenaMax", r1.filtri.cenaMax === 250_000 && r1.filtri.cenaMin === undefined, JSON.stringify(r1.filtri));
const r2 = razlozi("hiša z vsaj 800 m2 zemljišča");
preveri("m2 zemljišča ni bivalna površina", r2.filtri.zemljisceMin === 800 && r2.filtri.povrsinaMin === undefined, JSON.stringify(r2.filtri));
const r3 = razlozVec(["hiše v Mariboru", "15 km okoli Kopra"]);
preveri("nov radij pobriše prejšnji kraj", r3.filtri.kraj === undefined && r3.filtri.regija === undefined && r3.filtri.radijKraj === "kopra", JSON.stringify(r3.filtri));
const r4 = razlozVec(["15 km okoli Kopra", "v Mariboru"]);
preveri("nov kraj pobriše prejšnji radij", r4.filtri.radijKm === undefined && r4.filtri.kraj === "maribor", JSON.stringify(r4.filtri));

// Seja: zaporedna sporočila dopolnjujejo stanje, ne začenjajo znova.
console.log("\nseja: dopolnjevanje iskanja");
const seja = razlozVec(["hiše v Mariboru do 400k", "samo večstanovanjske", "odstrani vse nad 250k"]);
preveri("posel se podeduje", seja.filtri.posel === "prodaja", JSON.stringify(seja.filtri.posel));
preveri("kraj se podeduje", seja.filtri.kraj === "maribor", JSON.stringify(seja.filtri.kraj));
preveri("večenotnost iz 2. sporočila", seja.filtri.vecEnot === true, JSON.stringify(seja.filtri.vecEnot));
preveri("cena iz 3. sporočila povozi 1.", seja.filtri.cenaMax === 250_000, JSON.stringify(seja.filtri.cenaMax));

const seja2 = razlozVec(["hiše 15 km okoli Maribora", "razširi radij na 30 km"]);
preveri("radij se razširi", seja2.filtri.radijKm === 30, JSON.stringify(seja2.filtri.radijKm));
preveri("središče radija ostane", seja2.filtri.radijKraj === "maribora", JSON.stringify(seja2.filtri.radijKraj));

const seja3 = razlozVec(["stanovanja v Ljubljani", "sortiraj po padcu cene"]);
preveri("sortiraj po padcu", seja3.filtri.razvrsti === "padec", JSON.stringify(seja3.filtri.razvrsti));

console.log(napak === 0 ? "\nVSE OK" : `\n${napak} NAPAK`);
process.exitCode = napak === 0 ? 0 : 1;
