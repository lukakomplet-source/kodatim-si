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
    ime: "zemljišče: superlativ + podvrsta + €/m² (dobesedno, brez šumnikov)",
    stavek: "najbolsa cena zemlje bliznji mesta na m2 zazidljivo pa tak",
    cilj: null,
    filtri: { tipi: ["posest"], podtip: "zazidljiv", razvrsti: "m2_nizja" },
  },
  {
    ime: "stanovanje v centru + najcenejše (dobesedno, brez šumnikov)",
    stavek: "najdi mi stanovanje v centru mesta ljubljane pa daj mi prvo najcenejse",
    cilj: null,
    filtri: { tipi: ["stanovanje"], kraj: "ljubljana", center: true, razvrsti: "cena_nizja" },
  },
  {
    ime: "isti stavek S šumniki da enak izid",
    stavek: "najdi mi stanovanje v centru Ljubljane, prvo najcenejše",
    cilj: null,
    filtri: { tipi: ["stanovanje"], kraj: "ljubljana", center: true, razvrsti: "cena_nizja" },
  },
  {
    ime: "zazidljiva parcela: cena, kraj, razvrstitev na kvadrat",
    stavek: "zazidljiva parcela pri Kranju do 80k najugodnejsa na kvadrat",
    cilj: null,
    filtri: { tipi: ["posest"], podtip: "zazidljiv", cenaMax: 80_000, kraj: "kranj", razvrsti: "m2_nizja" },
  },
  {
    ime: "kmetijsko se loči od zazidljivega",
    stavek: "kmetijsko zemljisce v prekmurju najcenejse",
    cilj: null,
    filtri: { tipi: ["posest"], podtip: "kmetijsko", razvrsti: "cena_nizja" },
  },
  {
    ime: "obrobje NI center",
    stavek: "stanovanje na obrobju Celja",
    cilj: null,
    filtri: { tipi: ["stanovanje"], kraj: "celje", center: undefined },
  },
  {
    ime: "blizu centra NI v centru",
    stavek: "hisa blizu centra Maribora",
    cilj: null,
    filtri: { tipi: ["hisa"], center: undefined },
  },
  {
    ime: "hiša z veliko zemljo ostane hiša, ne zemljišče",
    stavek: "hisa z veliko zemljo do 250k",
    cilj: null,
    filtri: { tipi: ["hisa"], cenaMax: 250_000 },
  },

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
  // ── Iz korpusa 287 vrzeli: vsak primer spodaj je bil potrjena napaka. ──
  {
    ime: "„do 1000 m2“ NI cena (prej: do 1.000.000.000 €)",
    stavek: "zazidljiva parcela do 1000 m2 pri Kranju",
    cilj: null,
    filtri: { tipi: ["posest"], podtip: "zazidljiv", povrsinaMax: 1000, cenaMax: undefined, kraj: "kranj" },
  },
  {
    ime: "namen ni vrsta: „za gradnjo hiše“ ostane zemljišče",
    stavek: "zemljisce za gradnjo hise v okolici Ptuja",
    cilj: null,
    filtri: { tipi: ["posest"], podtip: "zazidljiv", radijKraj: "ptuja" },
  },
  {
    ime: "spodnja meja brez znaka €",
    stavek: "premium stanovanja ljubljana center nad 500k",
    cilj: null,
    filtri: { tipi: ["stanovanje"], cenaMin: 500_000, center: true, razvrsti: "cena_visja" },
  },
  {
    ime: "„nad 20 km“ ni cena, ampak radij",
    stavek: "parcela nad 20 km od ljubljane",
    cilj: null,
    filtri: { tipi: ["posest"], radijKm: 20, radijKraj: "ljubljane", cenaMin: undefined },
  },
  {
    ime: "vila je hiša, obala je regija",
    stavek: "pokazi mi najdrazje vile na obali",
    cilj: null,
    filtri: { tipi: ["hisa"], regija: "obalno-kraska", razvrsti: "cena_visja" },
  },
  {
    ime: "obrnjeni radij: „okoli Maribora 20 km“",
    stavek: "hisa za obnovo okoli maribora 20km",
    cilj: null,
    filtri: { tipi: ["hisa"], radijKm: 20, radijKraj: "maribora", zaObnovo: true },
  },
  {
    ime: "„blizu smučišča“ ni ime kraja",
    stavek: "hisa blizu smucisca da bi delal apartmaje",
    cilj: null,
    filtri: { tipi: ["hisa"], turizem: true, radijKraj: undefined },
  },
  {
    ime: "krajšava lj",
    stavek: "stanovanje v lj do 200k",
    cilj: null,
    filtri: { tipi: ["stanovanje"], kraj: "ljubljana", cenaMax: 200_000 },
  },
  {
    ime: "sklon z izpadnim samoglasnikom: v Kopru",
    stavek: "cim ceneje stanovanje v kopru",
    cilj: null,
    filtri: { kraj: "koper", regija: "obalno-kraska", razvrsti: "cena_nizja" },
  },
  {
    ime: "dvobesedno ime v sklonu: v novem mestu",
    stavek: "dvojcek v novem mestu",
    cilj: null,
    filtri: { tipi: ["hisa"], kraj: "novo mesto", regija: "dolenjska" },
  },
  {
    ime: "prislov „najceneje“ + goli kvadrat",
    stavek: "kje je najceneje kvadrat stanovanja v mariboru",
    cilj: null,
    filtri: { tipi: ["stanovanje"], kraj: "maribor", razvrsti: "m2_nizja" },
  },
  {
    ime: "pokrajina brez kraja: Prekmurje",
    stavek: "hisa z veliko zemljo v prekmurju",
    cilj: null,
    filtri: { tipi: ["hisa"], regija: "pomurska", zemljisceMin: 800 },
  },
  {
    ime: "cena s tisočico brez pripone",
    stavek: "hisa do 250.000 eur v zasavju",
    cilj: null,
    filtri: { tipi: ["hisa"], cenaMax: 250_000, regija: "zasavska" },
  },
  {
    ime: "milijon je še vedno milijon (jeMera ga ne pobere)",
    stavek: "hisa do 1,2m v ljubljani",
    cilj: null,
    filtri: { tipi: ["hisa"], cenaMax: 1_200_000, kraj: "ljubljana" },
  },
  {
    ime: "rodilnik množine: „gradnja stanovanj“",
    stavek: "nova gradnja stanovanj v ljubljani",
    cilj: null,
    filtri: { tipi: ["stanovanje"], kraj: "ljubljana" },
  },
  {
    ime: "„za oddajanje“ je namen kupca, ne iskanje najema",
    stavek: "hiša na Obali za oddajanje turistom",
    cilj: null,
    filtri: { posel: "prodaja", tipi: ["hisa"], regija: "obalno-kraska", zaInvesticijo: true, turizem: true },
  },
  {
    ime: "„da bi jo oddajal“ je prav tako namen",
    stavek: "hiša za obnovo, da bi jo oddajal",
    cilj: null,
    filtri: { posel: "prodaja", tipi: ["hisa"], zaObnovo: true },
  },
  {
    ime: "pravi najem ostane najem",
    stavek: "stanovanje v najem v ljubljani",
    cilj: null,
    filtri: { posel: "oddaja", tipi: ["stanovanje"], kraj: "ljubljana" },
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
