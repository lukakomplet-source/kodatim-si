import "server-only";
import { createAvtonetClient } from "@/lib/avtonet/db";

/**
 * Branje registra podjetij — ena sama definicija za stran in za API.
 *
 * Stran naloži prvi paket na strežniku, nadaljnje pa odjemalec dobiva ob
 * drsenju prek API poti. Če bi bila filtra dva (enkrat v strani, enkrat v
 * poti), bi se prej ali slej razšla in seznam bi se ob drsenju tiho spremenil.
 */

/** Koliko vrstic na paket. 200 je meja, kjer se prenos še ne pozna. */
export const PAKET = 200;

export const STOLPCI =
  "id, naziv, maticna, davcna, naslov, posta, kraj, obcina, skd, skd_naziv, eposta, telefon, " +
  "spletna_stran, direktor, detajli_ob, detajli_status, detajli_poskusi, prvic_videno, ni_vec_od, detail_url";

export type VrsticaRegistra = {
  id: number;
  naziv: string | null;
  maticna: string | null;
  davcna: string | null;
  naslov: string | null;
  posta: string | null;
  kraj: string | null;
  obcina: string | null;
  skd: string | null;
  skd_naziv: string | null;
  eposta: string | null;
  telefon: string | null;
  spletna_stran: string | null;
  direktor: string | null;
  detajli_ob: string | null;
  detajli_status: string | null;
  detajli_poskusi: number | null;
  prvic_videno: string;
  ni_vec_od: string | null;
  detail_url: string;
};

export type Filtri = {
  q: string;
  skd: string;
  kraj: string;
  samoEposta: boolean;
  samoBrezDetajlov: boolean;
  vkljuciIzginule: boolean;
};

export function filtriIz(preberi: (kljuc: string) => string): Filtri {
  return {
    q: preberi("q").trim(),
    skd: preberi("skd").trim(),
    kraj: preberi("kraj").trim(),
    samoEposta: preberi("eposta") === "1",
    samoBrezDetajlov: preberi("brez") === "1",
    vkljuciIzginule: preberi("izginuli") === "1",
  };
}

/**
 * Iskalni niz za filter `or=(…)`.
 *
 * Ta filter je slovnica z vejicami in oklepaji, zato surov niz ni varen. Ni pa
 * rešitev brisanje pik: „d.o.o.“ je najbolj naraven iskalni niz na svetu in
 * 77.134 nazivov ga vsebuje — če piko pobrišemo, iskanje vrne nič. PostgREST
 * dovoli vrednost v dvojnih narekovajih, znotraj katerih vejica in pika ne
 * pomenita ničesar; ubežemo le narekovaj in poševnico, ki bi narekovaje
 * zaprla.
 */
export function ocistiIskanje(q: string): string {
  const brezKrmilnih = Array.from(q)
    .map((z) => (z.codePointAt(0)! < 0x20 ? " " : z))
    .join("");
  return brezKrmilnih
    .split('"')
    .join("")
    .split("\\")
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/**
 * Vrednost za `ilike` — tu pika SME ostati.
 *
 * SKD koda je „62.010“ in točno tako piše tudi v namigu polja. Ko sem to
 * vrednost gnal skozi ocistiIskanje(), je postala „62 010“ in filter je vrnil
 * nič zadetkov — iskanje po kodi, kakršno vsak človek najprej poskusi, ni
 * delovalo. Ta polja gredo v poizvedbo kot PARAMETER (ne v `or=(…)` niz), zato
 * slovnice ni mogoče razbiti; odstranimo le nadomestne znake, da uporabnik po
 * nesreči ne poišče vsega.
 */
export function ocistiVrednost(v: string): string {
  return v.replace(/[%*,()\\]/g, "").trim().slice(0, 60);
}

export type Paket = {
  vrstice: VrsticaRegistra[];
  /** Zadnji id v paketu — kazalec za naslednjega. */
  zadnjiId: number | null;
  /** Ali obstaja še kaj za naložiti. */
  se: boolean;
  /** Skupno število zadetkov; samo pri prvem paketu (šteto je drago). */
  skupaj: number | null;
};

/**
 * En paket vrstic, po kazalcu in ne po odmiku.
 *
 * `range(200000, 200199)` mora baza prešteti dvesto tisoč vrstic, preden vrne
 * zadnjih dvesto — pri drsenju skozi cel register bi vsak naslednji paket bil
 * počasnejši od prejšnjega. Kazalec po `id` je vedno enako hiter, ker gre
 * naravnost po primarnem ključu.
 *
 * Razvrstitev je po `id` (vrstni red zajema) in ne po nazivu: `naziv` ni
 * enoličen, zato bi se pri enakih nazivih vrstice med paketi podvajale ali
 * izgubljale — po ključu se to ne more zgoditi.
 */
export async function preberiPaket(
  f: Filtri,
  poId: number | null,
  zeliSkupaj: boolean
): Promise<Paket> {
  const db = createAvtonetClient();
  let p = db
    .from("podjetja_register")
    .select(STOLPCI, zeliSkupaj ? { count: "exact" } : undefined);

  const q = ocistiIskanje(f.q);
  if (q) p = p.or(`naziv.ilike."%${q}%",maticna.ilike."%${q}%",davcna.ilike."%${q}%"`);
  // Vrednost, od katere po čiščenju ne ostane nič (sam ločilni znak), ne sme
  // postati filter „prazen niz“ — ta bi tiho izločil vrstice z NULL.
  const skd = ocistiVrednost(f.skd);
  if (skd) p = p.ilike("skd", `${skd}%`);
  const kraj = ocistiVrednost(f.kraj);
  if (kraj) p = p.ilike("kraj", `%${kraj}%`);
  if (f.samoEposta) p = p.not("eposta", "is", null);
  if (f.samoBrezDetajlov) p = p.is("detajli_ob", null);
  // Privzeto samo podjetja, ki so še v registru — izginula so zgodovina.
  if (!f.vkljuciIzginule) p = p.is("ni_vec_od", null);
  if (poId !== null) p = p.gt("id", poId);

  const { data, count, error } = await p.order("id", { ascending: true }).limit(PAKET);
  if (error) throw new Error(error.message);

  const vrstice = (data ?? []) as unknown as VrsticaRegistra[];
  return {
    vrstice,
    zadnjiId: vrstice.length > 0 ? vrstice[vrstice.length - 1].id : null,
    se: vrstice.length === PAKET,
    skupaj: zeliSkupaj ? (count ?? null) : null,
  };
}

export type Napredek = {
  prebranih: number;
  odVseh: number;
  odstotek: number;
  /** Koliko kartic je bilo prebranih v zadnjih 24 h — drseče okno, ne trenutni tempo. */
  v24h: number;
  dniDoKonca: number | null;
  zEposto: number;
  sTelefonom: number;
  sSpletno: number;
  obupanih: number;
  /** "caka" | "tece" | "vir_ne_da_kartic" | "vir_zahteva_captcha" | "koncano" — stanje AJPES kartic, kot ga pove delavec. */
  stanje: string;
  /** Obdelanih vrstic v zadnji uri (splet + kartice) — iz tega je ocena. */
  naUro: number;
  /** Koliko vrstic je prebrala AJPES kartica (uradni podatki). */
  ajpesKartic: number;
  /** Kdaj bo delavec AJPES kartico spet poskusil; null, če ne čaka. */
  ajpesNaslednjiOb: string | null;
  /** Spletne strani: najdenih / podjetij brez strani. */
  spletNajdenih: number;
  spletBrezStrani: number;
  /** Ugibanje domene ni uspelo, iskalnik ni bil na voljo — čakajo na iskalni API. */
  spletBrezIskanja: number;
  /** "caka" | "tece" | "koncano" | "ustavljeno" | "stran_ne_odgovarja" */
  spletStanje: string;
  /** Kdaj je delavec te številke nazadnje zapisal. */
  izracunano: string | null;
  /** Kdaj je bila nazadnje prebrana KAKŠNA kartica — edini dokaz napredka. */
  zadnjaKarticaOb: string | null;
  /** Sekunde od zadnje prebrane kartice; null, če še nobene ni bilo. */
  mirujeS: number | null;
  /** Ali se obogatitev ta hip res premika. */
  teceZdaj: boolean;
};

/**
 * Koliko tišine že pomeni, da obogatitev stoji.
 *
 * Med karticami je 1,5 s, po zavrnitvi vira pa 10 minut hlajenja. Petnajst
 * minut brez ene same prebrane kartice torej ni premor, ampak vzorec.
 */
const PRAG_MIRUJE_S = 15 * 60;

/**
 * Napredek obogatitve — številke od delavca, VPRAŠANJE „ali se premika“ pa iz baze.
 *
 * Od 16. 9. 2026 obogatitev tečeta dve: spletne strani podjetij (glavnina,
 * ~6 vzporednih) in AJPES kartice (~20 na dan zaradi reCAPTCHE). `detajli_ob`
 * postavi katerakoli, zato je ena časovna oznaka merilo za obe.
 *
 * Delavčevo stanje je spremenljivka v pomnilniku in se ob vsakem ponovnem
 * zagonu vrne na „čaka“. 15. 9. ob 12:11 je zato v statistiki pisalo
 * „teče, 63.266 dni do konca“, zadnja resnično prebrana kartica pa je bila
 * stara 25 minut. Edino, kar preživi ponovni zagon, je čas zadnje kartice v
 * tabeli — zato je merilo napredka on in ne poročilo delavca.
 */
export async function preberiNapredek(): Promise<Napredek | null> {
  const db = createAvtonetClient();
  const [statRes, zadnjaRes] = await Promise.all([
    db.from("avtonet_statistika").select("podatki, izracunano").eq("kljuc", "podjetja").maybeSingle(),
    db
      .from("podjetja_register")
      .select("detajli_ob")
      .not("detajli_ob", "is", null)
      .order("detajli_ob", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const zapis = statRes.data as { podatki?: Record<string, unknown>; izracunano?: string } | null;
  const d = (zapis?.podatki?.detajli ?? null) as Record<string, unknown> | null;
  if (!d) return null;

  const st = (k: string) => Number(d[k] ?? 0) || 0;
  const zadnjaKarticaOb = (zadnjaRes.data as { detajli_ob?: string } | null)?.detajli_ob ?? null;
  const mirujeS = zadnjaKarticaOb
    ? Math.max(0, Math.round((Date.now() - new Date(zadnjaKarticaOb).getTime()) / 1000))
    : null;
  const teceZdaj = mirujeS !== null && mirujeS < PRAG_MIRUJE_S;
  const dni = d.dni_do_konca === null || d.dni_do_konca === undefined ? null : Number(d.dni_do_konca);

  return {
    prebranih: st("prebranih"),
    odVseh: st("od_vseh"),
    odstotek: Number(d.odstotek ?? 0) || 0,
    v24h: st("na_dan"),
    // Ocena se pokaže samo, kadar se delo RES premika in je številka smiselna.
    // Brez prvega pogoja bi stran med blokado obljubljala napredek, brez
    // drugega pa bi kazala „63.266 dni“.
    dniDoKonca: teceZdaj && dni !== null && Number.isFinite(dni) && dni > 0 && dni < 3650 ? dni : null,
    zEposto: st("z_eposto"),
    sTelefonom: st("s_telefonom"),
    sSpletno: st("s_spletno"),
    obupanih: st("obupanih"),
    stanje: typeof d.stanje === "string" ? d.stanje : "caka",
    naUro: st("na_uro"),
    ajpesKartic: st("ajpes_kartic"),
    ajpesNaslednjiOb: typeof d.ajpes_naslednji_ob === "string" ? d.ajpes_naslednji_ob : null,
    spletNajdenih: st("splet_najdenih"),
    spletBrezStrani: st("splet_brez_strani"),
    spletBrezIskanja: st("splet_brez_iskanja"),
    spletStanje: typeof d.splet_stanje === "string" ? d.splet_stanje : "caka",
    izracunano: zapis?.izracunano ?? null,
    zadnjaKarticaOb,
    mirujeS,
    teceZdaj,
  };
}
