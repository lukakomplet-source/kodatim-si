import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { opisHash } from "./parse.js";

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

/**
 * Zgornja meja verjetne cene. Vir zna objaviti nesmisel (izmerjeno:
 * "431210220.00 €" za 158 m² pisarne), ena taka vrstica pa popači €/m²
 * statistiko in lestvice. Cene ne popravljamo — označimo jo za neznano,
 * surova kartica v raw ostane nedotaknjena, da jo je mogoče kasneje presoditi.
 */
const NAJVECJA_VERJETNA_CENA = 50_000_000;

function verjetnaCena(cena: number | null): number | null {
  if (cena === null) return null;
  return cena > NAJVECJA_VERJETNA_CENA || cena <= 0 ? null : cena;
}

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
  // Nesmiselne cene vira postanejo "ni podatka" — takoj ob vhodu, da ne
  // pricurljajo ne v zgodovino cen ne v statistiko.
  oglasi = oglasi.map((o) => ({ ...o, cenaEur: verjetnaCena(o.cenaEur) }));

  const ids = oglasi.map((o) => o.virId);
  const { data: obstojeci, error } = await db
    .from("nep_oglasi")
    .select("id, vir_id, cena_eur, status, povrsina_m2, zemljisce_m2, opis, opis_hash")
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
    opis_hash: opisHash(o.opis),
    data_quality: kakovost(o),
    last_seen: now,
    status: "aktiven",
    manjka_od: null, // vsak vid pobriše prvi udarec (lekcija iz avtonet db.ts)
  });

  /**
   * Za POSODOBITEV: polja, ki jih ta pregled ni znal prebrati (null), ne smejo
   * pobrisati shranjenih vrednosti — "nič se ne prepiše v prazno" velja tudi
   * za spodletelo parsanje ("Cena po dogovoru", manjkajoč opis).
   */
  const vrsticaZaPosodobitev = (o: NormaliziranOglas) => {
    const cela = vrstica(o) as Record<string, unknown>;
    const vednoPisi = new Set(["vir", "vir_id", "url", "posel", "raw", "data_quality", "last_seen", "status", "manjka_od"]);
    for (const [polje, vrednost] of Object.entries(cela)) {
      if ((vrednost === null || vrednost === undefined) && !vednoPisi.has(polje)) delete cela[polje];
    }
    // Zastavice iz opisa so verodostojne le, če opis sploh obstaja.
    if (!o.opis) {
      for (const polje of ["vec_enot", "za_obnovo", "za_investicijo", "locene_kuhinje", "loceni_vhodi"]) delete cela[polje];
    }
    return cela;
  };

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

  // Dnevnik sprememb: vsak dogodek nosi staro in novo vrednost, ker se
  // vrstica oglasa prepiše — brez dnevnika bi bila stara vrednost izgubljena.
  const dogodki: { oglas_id: string; tip: string; staro: unknown; novo: unknown }[] = [];

  const zaPosodobitev = oglasi.filter((o) => znani.has(o.virId));
  const rezultati = await Promise.all(
    zaPosodobitev.map(async (o) => {
      const prej = znani.get(o.virId)!;
      const staraCena = prej.cena_eur === null ? null : Number(prej.cena_eur);
      // Sprememba tudi pri null -> vrednost: prva znana cena šteje (in postane
      // cena_prvotna_eur, da padec cene sploh kdaj lahko obstaja).
      const sprememba = o.cenaEur !== null && staraCena !== o.cenaEur;
      const zaVpis = vrsticaZaPosodobitev(o);
      if (sprememba && staraCena === null) zaVpis.cena_prvotna_eur = o.cenaEur;
      const { error: e } = await db.from("nep_oglasi").update(zaVpis).eq("id", prej.id);
      if (e) return { ok: false, sprememba: false };
      if (sprememba) {
        await db.from("nep_cene").insert({
          oglas_id: prej.id,
          cena_eur: o.cenaEur,
          cena_m2_eur: o.cenaEur && o.povrsinaM2 ? Math.round((o.cenaEur / o.povrsinaM2) * 100) / 100 : null,
        });
        dogodki.push({ oglas_id: prej.id, tip: "cena", staro: { cena_eur: staraCena }, novo: { cena_eur: o.cenaEur } });
      }
      if (prej.status === "izginil") {
        dogodki.push({ oglas_id: prej.id, tip: "status", staro: { status: "izginil" }, novo: { status: "aktiven", opomba: "oglas se je vrnil" } });
      }
      const novHash = opisHash(o.opis);
      if (prej.opis_hash && novHash && prej.opis_hash !== novHash) {
        dogodki.push({ oglas_id: prej.id, tip: "opis", staro: { opis: prej.opis }, novo: { opis: o.opis } });
      }
      const staraPovrsina = prej.povrsina_m2 === null ? null : Number(prej.povrsina_m2);
      if (staraPovrsina !== null && o.povrsinaM2 !== null && staraPovrsina !== o.povrsinaM2) {
        dogodki.push({ oglas_id: prej.id, tip: "povrsina", staro: { povrsina_m2: staraPovrsina }, novo: { povrsina_m2: o.povrsinaM2 } });
      }
      const staroZemljisce = prej.zemljisce_m2 === null ? null : Number(prej.zemljisce_m2);
      if (staroZemljisce !== null && o.zemljisceM2 !== null && staroZemljisce !== o.zemljisceM2) {
        dogodki.push({ oglas_id: prej.id, tip: "zemljisce", staro: { zemljisce_m2: staroZemljisce }, novo: { zemljisce_m2: o.zemljisceM2 } });
      }
      return { ok: true, sprememba };
    })
  );
  izid.posodobljenih = rezultati.filter((r) => r.ok).length;
  izid.spremembCen = rezultati.filter((r) => r.sprememba).length;

  for (let i = 0; i < dogodki.length; i += 100) {
    const { error: e } = await db.from("nep_spremembe").insert(dogodki.slice(i, i + 100));
    if (e) console.warn(`[spremembe] zapis ni uspel: ${e.message}`);
  }
  return izid;
}

/**
 * Izginotje: aktiven oglas TEGA VIRA, ki ga POPOLN pregled vira ni videl.
 * Vir je obvezen — brez njega bi pregled enega portala razglasil oglase
 * drugih portalov za izginule. Varovalka >40 % in dvo-udarčno pravilo kot
 * pri avtomobilih.
 */
export async function oznaciIzginule(db: Db, zacetekPregleda: string, vir: string): Promise<number> {
  const { count: aktivnih } = await db
    .from("nep_oglasi")
    .select("*", { count: "exact", head: true })
    .eq("vir", vir)
    .eq("status", "aktiven");
  const { count: neVidenih } = await db
    .from("nep_oglasi")
    .select("*", { count: "exact", head: true })
    .eq("vir", vir)
    .eq("status", "aktiven")
    .lt("last_seen", zacetekPregleda);
  // Kdor je spet viden, mu odsotnost pobrišemo — VEDNO, tudi če danes ni
  // nobenega ne videnega (zgodnji izhod spodaj tega ne sme preskočiti, sicer
  // se star manjka_od nekoč vrne kot lažni "drugi udarec").
  await db
    .from("nep_oglasi")
    .update({ manjka_od: null })
    .eq("vir", vir)
    .gte("last_seen", zacetekPregleda)
    .not("manjka_od", "is", null);

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
    .eq("vir", vir)
    .eq("status", "aktiven")
    .lt("last_seen", zacetekPregleda)
    .not("manjka_od", "is", null)
    .limit(5000);
  for (const p of potrjeni ?? []) {
    const { error: e } = await db
      .from("nep_oglasi")
      .update({ status: "izginil", status_spremenjen: p.manjka_od })
      .eq("id", p.id)
      .eq("status", "aktiven");
    if (!e) {
      await db.from("nep_spremembe").insert({
        oglas_id: p.id,
        tip: "status",
        staro: { status: "aktiven" },
        novo: { status: "izginil", manjka_od: p.manjka_od },
      });
    }
  }
  // Prvi udarec: samo zapomni. (Videni so bili počiščeni že zgoraj.)
  await db
    .from("nep_oglasi")
    .update({ manjka_od: now })
    .eq("vir", vir)
    .eq("status", "aktiven")
    .lt("last_seen", zacetekPregleda)
    .is("manjka_od", null);

  return (potrjeni ?? []).length;
}
