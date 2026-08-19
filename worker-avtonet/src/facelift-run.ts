import "dotenv/config";
import { connect, type Db } from "./db.js";
import {
  izmeriMeje,
  kljucSkupine,
  uvrsti,
  type Meja,
  type MejaZaUporabo,
  type OglasZaFacelift,
} from "./facelift.js";

/**
 * Izmeri meje faceliftov iz naših oglasov in jih zapiše na oglase.
 *
 *   npx tsx src/facelift-run.ts            # izmeri + uporabi
 *   npx tsx src/facelift-run.ts --pokazi   # samo pokaži, kaj bi izmeril
 *
 * Poganja se po izračunu identitete (potrebuje druzina_modela in
 * oprema_kljucna) in pred izračunom poslov.
 */

const POLJA =
  "id, druzina_modela, generacija, letnik, registracija_mesec, cena_eur, naziv, opis, verzija, oprema_kljucna, facelift, facelift_vir, serija, serija_opis";

type Vrstica = {
  id: string;
  druzina_modela: string | null;
  generacija: string | null;
  letnik: number | null;
  registracija_mesec: number | null;
  cena_eur: number | null;
  naziv: string | null;
  opis: string | null;
  verzija: string | null;
  oprema_kljucna: Record<string, boolean> | null;
  facelift: boolean | null;
  facelift_vir: string | null;
  serija: number | null;
  serija_opis: string | null;
};

async function preberiVse(db: Db): Promise<Vrstica[]> {
  const vse: Vrstica[] = [];
  for (let od = 0; ; od += 1000) {
    const { data, error } = await db
      .from("avtonet_oglasi")
      .select(POLJA)
      .eq("status", "aktiven")
      .order("id")
      .range(od, od + 999);
    if (error) throw new Error(`Branje oglasov: ${error.message}`);
    vse.push(...((data ?? []) as unknown as Vrstica[]));
    if (!data || data.length < 1000) break;
  }
  return vse;
}

const vOglas = (r: Vrstica): OglasZaFacelift => ({
  id: r.id,
  druzinaModela: r.druzina_modela,
  generacija: r.generacija,
  letnik: r.letnik,
  registracijaMesec: r.registracija_mesec,
  cena: r.cena_eur === null ? null : Number(r.cena_eur),
  naziv: r.naziv,
  opis: r.opis,
  verzija: r.verzija,
  opremaKljucna: r.oprema_kljucna,
});

export async function izmeriInUporabi(db: Db, samoPokazi: boolean): Promise<void> {
  const vrstice = await preberiVse(db);
  const oglasi = vrstice.map(vOglas);
  console.log(`[facelift] aktivnih oglasov: ${oglasi.length}`);

  // Skupine: najprej po družini + generaciji (natančneje), nato po sami
  // družini — generacija je izračunana šele pri 1.301 oglasu.
  const skupine = new Map<string, { druzina: string; generacija: string | null; oglasi: OglasZaFacelift[] }>();
  const dodaj = (druzina: string, generacija: string | null, o: OglasZaFacelift) => {
    const k = kljucSkupine(druzina, generacija);
    const s = skupine.get(k) ?? { druzina, generacija, oglasi: [] };
    s.oglasi.push(o);
    skupine.set(k, s);
  };
  for (const o of oglasi) {
    if (!o.druzinaModela) continue;
    dodaj(o.druzinaModela, null, o); // meja za cel model
    if (o.generacija) dodaj(o.druzinaModela, o.generacija, o); // in natančneje po generaciji
  }

  const meje: Meja[] = [];
  for (const s of skupine.values()) meje.push(...izmeriMeje(s.oglasi, { druzina: s.druzina, generacija: s.generacija }));
  console.log(`[facelift] izmerjenih mej: ${meje.length} v ${new Set(meje.map((m) => m.druzinaModela)).size} modelih`);
  const zaIzpis = [...meje].sort((a, b) => a.druzinaModela.localeCompare(b.druzinaModela) || a.mejaLeto - b.mejaLeto);
  for (const m of zaIzpis.slice(0, 25)) {
    const d = m.dokazi.oprema.map((x) => `${x.oprema} ${x.predPct}→${x.poPct} %`).join(", ");
    console.log(
      `  ${m.druzinaModela}${m.generacija ? ` (${m.generacija})` : ""}: prelom ${m.mejaMesec}/${m.mejaLeto} ` +
        `[zaupanje ${m.zaupanje}, vzorec ${m.vzorecPred}/${m.vzorecPo}, cena ${m.dokazi.cenaSkokPct ?? "?"} %, ` +
        `izrecno FL po/pred ${m.dokazi.izrecnihPo}/${m.dokazi.izrecnihPred}] ${d}`
    );
  }
  if (samoPokazi) return;

  for (const m of meje) {
    const { error } = await db.from("avtonet_faceliftti").upsert(
      {
        druzina_modela: m.druzinaModela,
        generacija: m.generacija,
        meja_leto: m.mejaLeto,
        meja_mesec: m.mejaMesec,
        vir: "izmerjeno",
        zaupanje: m.zaupanje,
        dokazi: m.dokazi,
        vzorec_pred: m.vzorecPred,
        vzorec_po: m.vzorecPo,
      },
      { onConflict: "druzina_modela,generacija,meja_leto,meja_mesec" }
    );
    if (error) console.warn(`[facelift] zapis meje ${m.druzinaModela}: ${error.message}`);
  }

  // Potrjene ročne meje imajo prednost pred izmerjenimi.
  const { data: vseMeje } = await db
    .from("avtonet_faceliftti")
    .select("druzina_modela, generacija, meja_leto, meja_mesec, zaupanje, potrjeno")
    .order("potrjeno", { ascending: false })
    .order("zaupanje", { ascending: false });
  const zaUporabo = new Map<string, MejaZaUporabo[]>();
  for (const m of (vseMeje ?? []) as { druzina_modela: string; generacija: string | null; meja_leto: number; meja_mesec: number; zaupanje: number }[]) {
    const k = kljucSkupine(m.druzina_modela, m.generacija);
    const arr = zaUporabo.get(k) ?? [];
    arr.push({ mejaLeto: m.meja_leto, mejaMesec: m.meja_mesec, zaupanje: m.zaupanje });
    zaUporabo.set(k, arr);
  }

  let spremenjenih = 0;
  const stat = { trditev: 0, serija: 0, brezSerije: 0 };
  for (let i = 0; i < oglasi.length; i += 200) {
    const paket = oglasi.slice(i, i + 200);
    await Promise.all(
      paket.map(async (o, j) => {
        const prej = vrstice[i + j];
        const izid = uvrsti(o, zaUporabo);
        if (izid.faceliftTrditev !== null) stat.trditev += 1;
        if (izid.serija !== null) stat.serija += 1;
        else stat.brezSerije += 1;

        // Ročno postavljene vrednosti se ne povozijo.
        const facelift = prej.facelift_vir === "rocno" ? prej.facelift : izid.faceliftTrditev;
        const faceliftVir = prej.facelift_vir === "rocno" ? "rocno" : izid.faceliftTrditev !== null ? "oglas" : null;
        if (
          prej.facelift === facelift &&
          prej.facelift_vir === faceliftVir &&
          prej.serija === izid.serija &&
          prej.serija_opis === izid.mejaOpis
        ) {
          return;
        }
        const { error } = await db
          .from("avtonet_oglasi")
          .update({ facelift, facelift_vir: faceliftVir, serija: izid.serija, serija_opis: izid.mejaOpis })
          .eq("id", o.id);
        if (!error) spremenjenih += 1;
      })
    );
  }
  console.log(
    `[facelift] oglas sam trdi: ${stat.trditev}, uvrščenih v serijo: ${stat.serija}, brez serije: ${stat.brezSerije} (zapisov: ${spremenjenih})`
  );
}

if (process.argv[1]?.includes("facelift-run")) {
  const db = connect();
  izmeriInUporabi(db, process.argv.includes("--pokazi")).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
