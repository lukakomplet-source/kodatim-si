import "dotenv/config";
import { connect } from "./db.js";

/**
 * UVOZ TURISTIČNIH PRENOČITEV PO OBČINAH (SURS).
 *
 * Vir: SURS, tabela 2164525S — "Prihodi in prenočitve domačih in tujih
 * turistov, občine, Slovenija, letno", prek javnega PxWeb API. To so odprti
 * podatki državne statistike; jemljemo eno leto in 212 vrstic, torej en sam
 * zahtevek.
 *
 * Zakaj sploh: "blizu atrakcije" pove mikrolokacijo, ne pove pa, ali tja kdo
 * res hodi spat. Hiša petsto metrov od lepega jezera, kamor pride tisoč ljudi
 * na leto, ni booking. Prenočitve so edina številka, ki to loči, in je ne
 * ugibamo — preštel jo je SURS.
 *
 * Koordinate: SURS pove ime občine, ne njene lege. Sedež razrešimo iz
 * nep_kraji (GeoNames) po imenu. Kar se ne razreši, ostane brez koordinat in
 * se v izračunu ne uporabi — raje manjka, kot da bi bilo na napačnem mestu.
 *
 *   npm run uvoz:turizem
 */

const API = "https://pxweb.stat.si/SiStatData/api/v1/sl/Data/2164525S.px";
const UA = "KodaTimBot/1.0 (+https://kodatim.si; uvoz odprtih podatkov SURS)";

type Meta = {
  variables: { code: string; values: string[]; valueTexts: string[] }[];
};

/** json-stat2: vrednosti so v enem polju, dimenzije pa povedo, kako ga brati. */
type JsonStat = {
  value: (number | null)[];
  size: number[];
  id: string[];
  dimension: Record<string, { category: { index: Record<string, number>; label: Record<string, string> } }>;
};

async function main(): Promise<void> {
  const db = connect();

  console.log("Berem opis tabele SURS 2164525S …");
  const metaOdziv = await fetch(API, { headers: { "user-agent": UA } });
  if (!metaOdziv.ok) throw new Error(`SURS opis tabele: HTTP ${metaOdziv.status}`);
  const meta = (await metaOdziv.json()) as Meta;

  const najdi = (delZnaka: string) => {
    const v = meta.variables.find((x) => x.code.toUpperCase().includes(delZnaka));
    if (!v) throw new Error(`V opisu tabele ni spremenljivke "${delZnaka}" — SURS je spremenil strukturo.`);
    return v;
  };
  const obcine = najdi("OBČIN");
  const drzava = najdi("DRŽAVA");
  const meritve = najdi("MERITVE");
  const leta = najdi("LETO");

  // Zadnje leto, ki ga tabela premore. Ne vpisujemo letnice v kodo: podatki
  // za novo leto pridejo enkrat letno in uvoz jih mora pobrati sam.
  const zadnjeLeto = leta.values[leta.values.length - 1];
  // "Država - SKUPAJ" je vsota domačih in tujih; je vedno prva vrednost.
  const drzavaSkupaj = drzava.values[0];

  console.log(`Jemljem leto ${zadnjeLeto}, ${obcine.values.length} občin …`);
  const poizvedba = {
    query: [
      { code: obcine.code, selection: { filter: "all", values: ["*"] } },
      { code: drzava.code, selection: { filter: "item", values: [drzavaSkupaj] } },
      { code: meritve.code, selection: { filter: "all", values: ["*"] } },
      { code: leta.code, selection: { filter: "item", values: [zadnjeLeto] } },
    ],
    response: { format: "json-stat2" },
  };

  const odziv = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify(poizvedba),
  });
  if (!odziv.ok) throw new Error(`SURS podatki: HTTP ${odziv.status} — ${(await odziv.text()).slice(0, 200)}`);
  const js = (await odziv.json()) as JsonStat;

  // Kje v `value` leži posamezna kombinacija: json-stat2 hrani ravno polje,
  // vrstni red dimenzij pa je v `id`, velikosti v `size`.
  const kazalo = (izbira: Record<string, number>): number => {
    let idx = 0;
    for (let i = 0; i < js.id.length; i++) {
      idx = idx * js.size[i] + (izbira[js.id[i]] ?? 0);
    }
    return idx;
  };

  const obcineDim = js.dimension[obcine.code];
  const meritveDim = js.dimension[meritve.code];
  const meritveKljuci = Object.keys(meritveDim.category.index);
  // Katera meritev je katera, ugotovimo iz oznake, ne iz vrstnega reda.
  const kljucPrihodov = meritveKljuci.find((k) => /prihod/i.test(meritveDim.category.label[k])) ?? meritveKljuci[0];
  const kljucPrenocitev = meritveKljuci.find((k) => /prenoč|prenoc/i.test(meritveDim.category.label[k])) ?? meritveKljuci[1];

  const vrstice: { obcina: string; leto: number; prihodi: number | null; prenocitve: number | null }[] = [];
  for (const [kljuc, i] of Object.entries(obcineDim.category.index)) {
    const ime = obcineDim.category.label[kljuc];
    // "SLOVENIJA" je vsota vseh — kot občina bi pokvarila vsako primerjavo.
    if (/^slovenija$/i.test(ime)) continue;
    const beri = (meritevKljuc: string) =>
      js.value[
        kazalo({
          [obcine.code]: i,
          [drzava.code]: 0,
          [meritve.code]: meritveDim.category.index[meritevKljuc],
          [leta.code]: 0,
        })
      ] ?? null;
    vrstice.push({
      obcina: ime,
      leto: Number(zadnjeLeto),
      prihodi: beri(kljucPrihodov),
      prenocitve: beri(kljucPrenocitev),
    });
  }

  console.log(`Prebranih ${vrstice.length} občin. Razrešujem koordinate sedežev …`);

  // Sedeži iz šifranta krajev. Ime občine se pri veliki večini ujema z imenom
  // sedeža; kjer se ne, občina ostane brez koordinat in je izračun ne uporabi.
  const { data: kraji } = await db.from("nep_kraji").select("ime, lat, lng, prebivalcev").limit(20000);
  const poImenu = new Map<string, { lat: number; lng: number; prebivalcev: number }>();
  for (const k of (kraji ?? []) as { ime: string; lat: number; lng: number; prebivalcev: number | null }[]) {
    const kljuc = k.ime.toLowerCase();
    const prej = poImenu.get(kljuc);
    // Ob istem imenu obvelja večji kraj — sedež občine je praviloma največji.
    if (!prej || (k.prebivalcev ?? 0) > prej.prebivalcev) {
      poImenu.set(kljuc, { lat: k.lat, lng: k.lng, prebivalcev: k.prebivalcev ?? 0 });
    }
  }

  let zKoordinatami = 0;
  const zaVpis = vrstice.map((v) => {
    /**
     * Ime občine ni vedno ime kraja. Trije vzorci, ki jih SURS uporablja:
     *   "Ankaran/Ancarano"        — dvojezična obalna občina
     *   "Hoče - Slivnica"         — občina iz dveh krajev, sedež je prvi
     *   "Sveti Andraž v Slov. goricah" — okrajšava, ki je šifrant nima
     * Poskusimo po vrsti od najbolj natančnega proti najbolj ohlapnemu; prvo
     * ujemanje obvelja. Kar se ne razreši, ostane brez koordinat — raje
     * manjka, kot da bi bilo na napačnem mestu.
     */
    /**
     * Občine, kjer se sedež imenuje drugače in ga noben splošni vzorec ne
     * ujame. Seznam je namenoma kratek in samo za primere, ki jih znam
     * preveriti; Bohinj je med petimi najbolj turističnimi občinami v državi,
     * zato bi njegova odsotnost pokvarila prav tiste zadetke, ki nas zanimajo.
     */
    const ROCNO: Record<string, string> = {
      bohinj: "Bohinjska Bistrica",
      jezersko: "Zgornje Jezersko",
      bloke: "Nova vas",
    };
    const razlicice = [
      ROCNO[v.obcina.trim().toLowerCase()] ?? v.obcina,
      v.obcina,
      v.obcina.split("/")[0],
      v.obcina.split(" - ")[0],
      v.obcina.split("-")[0],
      v.obcina.replace(/Slov\./gi, "Slovenskih"),
      v.obcina.replace(/\s*-\s*/g, "-"),
    ];
    const imena = razlicice.map((x) => x.trim().toLowerCase()).filter((x) => x.length > 2);
    let najden = imena.map((i) => poImenu.get(i)).find(Boolean);

    /**
     * Zadnja pot: kraj, katerega ime se ZAČNE z imenom občine.
     * "Šentilj" -> "Šentilj v Slovenskih goricah", "Hajdina" -> "Zgornja
     * Hajdina" (temu ne ustreza, zato tudi vsebovanje). Zahtevamo mejo besede,
     * da "Bled" ne pobere "Bledoše"; med kandidati obvelja največji kraj, ker
     * je sedež občine praviloma največji.
     */
    if (!najden) {
      const osnova = imena[0];
      let najboljsi: { lat: number; lng: number; prebivalcev: number } | undefined;
      for (const [ime, k] of poImenu) {
        const ujema = ime.startsWith(osnova + " ") || ime.endsWith(" " + osnova);
        if (!ujema) continue;
        if (!najboljsi || k.prebivalcev > najboljsi.prebivalcev) najboljsi = k;
      }
      najden = najboljsi;
    }
    if (najden) zKoordinatami++;
    return {
      obcina: v.obcina,
      leto: v.leto,
      prihodi: v.prihodi,
      prenocitve: v.prenocitve,
      lat: najden?.lat ?? null,
      lng: najden?.lng ?? null,
      vir: `SURS 2164525S, leto ${v.leto}`,
      osvezeno: new Date().toISOString(),
    };
  });

  const { error } = await db.from("nep_turizem_obcine").upsert(zaVpis, { onConflict: "obcina" });
  if (error) throw new Error(`Vpis v nep_turizem_obcine ni uspel: ${error.message}`);

  const brez = zaVpis.filter((v) => v.lat === null).map((v) => v.obcina);
  const najvec = [...zaVpis].sort((a, b) => (b.prenocitve ?? 0) - (a.prenocitve ?? 0)).slice(0, 8);

  console.log(`\nVpisanih ${zaVpis.length} občin za leto ${zadnjeLeto}; ${zKoordinatami} s koordinatami sedeža.`);
  if (brez.length > 0) {
    console.log(`Brez koordinat (${brez.length}) — v izračunu se ne uporabijo: ${brez.slice(0, 12).join(", ")}${brez.length > 12 ? " …" : ""}`);
  }
  console.log("\nNajveč prenočitev:");
  for (const v of najvec) {
    console.log(`  ${String(v.prenocitve ?? 0).padStart(9)} — ${v.obcina}`);
  }

  // Predah pred izhodom: odjemalec baze ima še odprte vtičnice in takojšen
  // konec procesa na Windowsu sproži trditev v libuv po že izpisanem izidu.
  await new Promise((r) => setTimeout(r, 300));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
