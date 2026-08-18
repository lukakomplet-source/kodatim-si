import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Zapisovanje v lokalno bazo — ista načela kot pri avtomobilih, ker so tam
 * preživela vse okvare: nič se ne prepiše v prazno, zgodovina cen je svoja
 * tabela, izginotje se meri z dvo-udarčnim pravilom in varovalko, surova
 * kartica se hrani za poznejši boljši parser.
 */

export type Db = SupabaseClient;

export function connect(): Db {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Manjkata SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export type NormaliziranOglas = {
  vir: string;
  virId: string;
  url: string;
  naslov: string | null;
  tip: string | null;
  podtip: string | null;
  posel: string;
  regija: string | null;
  kraj: string | null;
  cenaEur: number | null;
  povrsinaM2: number | null;
  zemljisceM2: number | null;
  letoIzgradnje: number | null;
  letoAdaptacije: number | null;
  nadstropje: string | null;
  vecEnot: boolean;
  stEnot: number | null;
  stEnotOcena: number | null;
  loceneKuhinje: boolean | null;
  looceniVhodi: boolean | null;
  zaObnovo: boolean;
  zaInvesticijo: boolean;
  opis: string | null;
  prodajalec: string | null;
  agencija: string | null;
  telefon: string | null;
  slikaUrl: string | null;
  stSlik: number | null;
  raw: Record<string, unknown>;
};

/** Koliko od ključnih polj je res napolnjenih — za data_quality. */
function kakovost(o: NormaliziranOglas): number {
  const polja = [o.cenaEur, o.povrsinaM2, o.kraj, o.opis, o.slikaUrl, o.tip, o.telefon || o.agencija, o.letoIzgradnje];
  return Math.round((polja.filter((v) => v !== null && v !== undefined && v !== "").length / polja.length) * 100);
}

export type IzidShranjevanja = { novih: number; posodobljenih: number; spremembCen: number };

export async function shraniOglase(db: Db, oglasi: NormaliziranOglas[]): Promise<IzidShranjevanja> {
  const izid: IzidShranjevanja = { novih: 0, posodobljenih: 0, spremembCen: 0 };
  if (oglasi.length === 0) return izid;
  const now = new Date().toISOString();

  const ids = oglasi.map((o) => o.virId);
  const { data: obstojeci, error } = await db
    .from("nep_oglasi")
    .select("id, vir_id, cena_eur, status")
    .eq("vir", oglasi[0].vir)
    .in("vir_id", ids);
  if (error) throw new Error(`Branje obstoječih ni uspelo: ${error.message}`);
  const znani = new Map((obstojeci ?? []).map((o) => [o.vir_id as string, o]));

  const vrstica = (o: NormaliziranOglas) => ({
    vir: o.vir,
    vir_id: o.virId,
    url: o.url,
    naslov: o.naslov,
    tip: o.tip,
    podtip: o.podtip,
    posel: o.posel,
    regija: o.regija,
    kraj: o.kraj,
    cena_eur: o.cenaEur,
    cena_m2_eur: o.cenaEur && o.povrsinaM2 ? Math.round((o.cenaEur / o.povrsinaM2) * 100) / 100 : null,
    povrsina_m2: o.povrsinaM2,
    zemljisce_m2: o.zemljisceM2,
    leto_izgradnje: o.letoIzgradnje,
    leto_adaptacije: o.letoAdaptacije,
    nadstropje: o.nadstropje,
    vec_enot: o.vecEnot,
    st_enot: o.stEnot,
    st_enot_ocena: o.stEnotOcena,
    locene_kuhinje: o.loceneKuhinje,
    loceni_vhodi: o.looceniVhodi,
    za_obnovo: o.zaObnovo,
    za_investicijo: o.zaInvesticijo,
    opis: o.opis,
    prodajalec: o.prodajalec,
    agencija: o.agencija,
    telefon: o.telefon,
    slika_url: o.slikaUrl,
    st_slik: o.stSlik,
    raw: o.raw,
    data_quality: kakovost(o),
    last_seen: now,
    status: "aktiven",
  });

  const novi = oglasi.filter((o) => !znani.has(o.virId));
  if (novi.length > 0) {
    const { data, error: e } = await db
      .from("nep_oglasi")
      .upsert(novi.map((o) => ({ ...vrstica(o), cena_prvotna_eur: o.cenaEur, first_seen: now })), {
        onConflict: "vir,vir_id",
        ignoreDuplicates: true,
      })
      .select("id, cena_eur");
    if (e) throw new Error(`Vstavljanje ni uspelo: ${e.message}`);
    izid.novih = novi.length;
    // Prva cena gre tudi v zgodovino, da graf ni nikoli prazen.
    const cene = (data ?? [])
      .filter((v) => v.cena_eur !== null)
      .map((v) => ({ oglas_id: v.id, cena_eur: v.cena_eur }));
    if (cene.length > 0) await db.from("nep_cene").insert(cene);
  }

  const zaPosodobitev = oglasi.filter((o) => znani.has(o.virId));
  const rezultati = await Promise.all(
    zaPosodobitev.map(async (o) => {
      const prej = znani.get(o.virId)!;
      const staraCena = prej.cena_eur === null ? null : Number(prej.cena_eur);
      const sprememba = staraCena !== null && o.cenaEur !== null && staraCena !== o.cenaEur;
      const { error: e } = await db.from("nep_oglasi").update(vrstica(o)).eq("id", prej.id);
      if (e) return { ok: false, sprememba: false };
      if (sprememba) {
        await db.from("nep_cene").insert({
          oglas_id: prej.id,
          cena_eur: o.cenaEur,
          cena_m2_eur: o.cenaEur && o.povrsinaM2 ? Math.round((o.cenaEur / o.povrsinaM2) * 100) / 100 : null,
        });
      }
      return { ok: true, sprememba };
    })
  );
  izid.posodobljenih = rezultati.filter((r) => r.ok).length;
  izid.spremembCen = rezultati.filter((r) => r.sprememba).length;
  return izid;
}

/**
 * Izginotje: aktiven oglas, ki ga POPOLN pregled ni videl. Enaka varovalka kot
 * pri avtomobilih (>40 % "izginulih" pomeni pokvarjen pregled, ne izginotje) in
 * enako dvo-udarčno pravilo — prva odsotnost se zabeleži, druga potrdi.
 */
export async function oznaciIzginule(db: Db, zacetekPregleda: string): Promise<number> {
  const { count: aktivnih } = await db
    .from("nep_oglasi")
    .select("*", { count: "exact", head: true })
    .eq("status", "aktiven");
  const { count: neVidenih } = await db
    .from("nep_oglasi")
    .select("*", { count: "exact", head: true })
    .eq("status", "aktiven")
    .lt("last_seen", zacetekPregleda);
  if (!aktivnih || !neVidenih) return 0;
  if (neVidenih > aktivnih * 0.4) {
    console.warn(`[izginuli] VAROVALKA: ${neVidenih}/${aktivnih} ne videnih — označevanje preskočeno.`);
    return 0;
  }

  const now = new Date().toISOString();
  // Drugi udarec: že zabeležena odsotnost + spet ni viden -> izginil.
  const { data: potrjeni } = await db
    .from("nep_oglasi")
    .select("id, manjka_od")
    .eq("status", "aktiven")
    .lt("last_seen", zacetekPregleda)
    .not("manjka_od", "is", null)
    .limit(5000);
  for (const p of potrjeni ?? []) {
    await db
      .from("nep_oglasi")
      .update({ status: "izginil", status_spremenjen: p.manjka_od })
      .eq("id", p.id)
      .eq("status", "aktiven");
  }
  // Prvi udarec: samo zapomni.
  await db
    .from("nep_oglasi")
    .update({ manjka_od: now })
    .eq("status", "aktiven")
    .lt("last_seen", zacetekPregleda)
    .is("manjka_od", null);
  // Kdor je spet viden, mu odsotnost pobrišemo.
  await db.from("nep_oglasi").update({ manjka_od: null }).gte("last_seen", zacetekPregleda).not("manjka_od", "is", null);

  return (potrjeni ?? []).length;
}
