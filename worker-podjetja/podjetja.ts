import { readFileSync, writeFileSync, appendFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

/**
 * Neprekinjen zajem slovenskega poslovnega registra (AJPES PRS) po SKD kodah.
 *
 * Zakaj v ozadju in ne iz brskalnika: doslej je celoten zajem gnala odprta
 * stran — kdor jo je zaprl, je ustavil delo. Cel register je nekaj deset tisoč
 * poizvedb po približno pet sekund, kar je več dni; to ne sme biti odvisno od
 * odprtega zavihka.
 *
 * Vrsta poizvedb ("rezin") živi v bazi in ne v pomnilniku, ker se bo ta proces
 * vmes zagotovo ustavil. Ob zagonu preprosto pobere prvo čakajočo rezino in
 * nadaljuje tam, kjer je ostal.
 *
 * Rezanje samo je že napisano in preverjeno v aplikaciji (ajpesExhaustive), zato
 * ga ta delavec NE ponavlja: eno rezino odda tekoči strani na interno pot in
 * dobi nazaj vrstice ter morebitne pod-rezine. Dve različici istega rezanja, ki
 * se sčasoma razideta, bi bili slabši od enega klica čez localhost.
 *
 * Do AJPES-a se vede vljudno: ena poizvedba na nekaj sekund, ob zavrnitvi pa
 * daljši premor namesto hitrejših poskusov.
 */

const KOREN = join(import.meta.dirname, "..");
const MAPA_STANJA = process.env.PODJETJA_MAPA ?? "C:\\Users\\lukak\\avtonet-db";
const LOG = join(MAPA_STANJA, "podjetja.log");
const UTRIP = join(MAPA_STANJA, "podjetja.utrip");
const ZAKLEP = join(MAPA_STANJA, "podjetja.lock");

/** Premor med poizvedbami. Vljudnost do tujega strežnika, ne pohitritev naše. */
const PREMOR_MS = Number(process.env.PODJETJA_PREMOR_MS ?? 1_500);
/**
 * Koliko dni po koncu kroga se začne naslednji.
 *
 * Krog je ~68.000 poizvedb (pri 1,5 s premora dober dan). Register se
 * spreminja za ~100 podjetij na dan, zato je prehod vsake tri dni dovolj
 * svež, hkrati pa AJPES med krogi dobi premor. Datoteka podjetja.nov-krog
 * v mapi stanja krog sproži takoj.
 */
const KROG_DNI = Number(process.env.PODJETJA_KROG_DNI ?? 3);
const NOV_KROG_ZNAK = join(MAPA_STANJA, "podjetja.nov-krog");
/** Po zavrnitvi (403/429) se umaknemo za dlje, namesto da vztrajamo. */
const HLAJENJE_MS = Number(process.env.PODJETJA_HLAJENJE_MS ?? 10 * 60_000);
/** Koliko zaporednih neuspehov rezine, preden jo pustimo pri miru. */
const NAJVEC_POSKUSOV = 5;
/**
 * Hlajenje po zavrnitvi KARTIC raste: 30 min, 1 h, 2 h, 4 h, nato 8 h.
 *
 * 16. 9. 2026, izmerjeno v dnevniku: AJPES da ~10 kartic (10 v 75 s ob 00:08),
 * nato ~10 ur reCAPTCHE. Dreganje vsakih 10 minut tega ni skrajšalo — 54
 * neuspešnih poskusov v eni noči, prva uspešna kartica šele po devetih urah.
 * Ob uspehu se hlajenje vrne na začetek.
 */
const HLAJENJE_DETAJLOV_MIN_MS = Number(process.env.PODJETJA_HLAJENJE_DETAJLOV_MIN_MS ?? 30 * 60_000);
const HLAJENJE_DETAJLOV_MAX_MS = 8 * 3600_000;
function hlajenjeDetajlov(zaporednih: number): number {
  return Math.min(HLAJENJE_DETAJLOV_MAX_MS, HLAJENJE_DETAJLOV_MIN_MS * 2 ** Math.max(0, zaporednih - 1));
}
/**
 * Koliko podjetij hkrati bere s spletnih strani.
 *
 * Vsako podjetje je svoja domena, torej svoj strežnik — vzporednost tu ne
 * pomeni več prometa na nikogar posebej. Skupno ozko grlo je iskalnik, ki ga
 * omejevalnik hitrosti na strani že serializira (ena zahteva naenkrat).
 */
const SPLET_VZPOREDNO = Number(process.env.PODJETJA_SPLET_VZPOREDNO ?? 8);
/** Koliko počakamo, ko stran javi, da je zasedena (503). */
const SPLET_ZASEDENO_MS = 1_000;
/** Datoteka, ki zanko „splet“ ustavi brez ustavljanja delavca. */
const SPLET_STOP = join(MAPA_STANJA, "podjetja.splet-stop");
/** Statistika je nekaj štetij čez veliko tabelo — ne ob vsaki rezini. */
const STATISTIKA_NA = 25;

function beri(pot: string): string {
  try {
    return readFileSync(pot, "utf8");
  } catch {
    return "";
  }
}

/** Nastavitve iz .env.local; svoje knjižnice za to ne potrebujemo. */
function nastavitve(): Record<string, string> {
  const izhod: Record<string, string> = {};
  for (const vrstica of beri(join(KOREN, ".env.local")).split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(vrstica.trim());
    if (m) izhod[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
  }
  return izhod;
}

const NAST = nastavitve();
const DB = NAST.AVTONET_DB_URL || "http://localhost:8000";
const DB_KLJUC = NAST.AVTONET_DB_KEY || "";
const STRAN = process.env.PODJETJA_STRAN ?? "http://127.0.0.1:3001";
const INTERNI_KLJUC = NAST.INTERNI_KLJUC || "";

function log(sporocilo: string): void {
  const vrstica = `${new Date().toISOString()} ${sporocilo}`;
  console.log(vrstica);
  try {
    appendFileSync(LOG, vrstica + "\n");
  } catch {
    // Dnevnik ni razlog za padec.
  }
}

function utrip(stanje: string): void {
  try {
    writeFileSync(UTRIP, `${new Date().toISOString()} ${stanje}`);
  } catch {
    // Utrip ni razlog za padec.
  }
}

function zivProces(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Dva procesa bi ista podjetja iskala dvakrat in AJPES bi to upravičeno vzel za nadlego. */
function prevzemiZaklep(): boolean {
  try {
    writeFileSync(ZAKLEP, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    const stari = Number(beri(ZAKLEP).trim());
    if (stari && stari !== process.pid && zivProces(stari)) return false;
    try {
      writeFileSync(ZAKLEP, String(process.pid));
      return true;
    } catch {
      return false;
    }
  }
}

function spanec(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Dolgo cakanje, ki vsako minuto zapise utrip.
 *
 * 14. 9. 2026: po koncanem krogu je delavec zapisal utrip in nato spal 30 min -
 * natanko toliko, kot je nadzornikov prag. Nadzornik ga je zato ob vsakem
 * cakanju imel za zamrznjenega in ga ubil, delavec pa je ob zagonu naletel na
 * zaklep in koncal brez utripa. Utrip mora dokazovati, da proces ZIVI, tudi ko
 * namenoma caka.
 */
async function cakajZUtripom(ms: number, stanje: string): Promise<void> {
  const konec = Date.now() + ms;
  while (Date.now() < konec) {
    utrip(stanje);
    await spanec(Math.min(60_000, konec - Date.now()));
  }
}

/**
 * Casovna oznaka, varna za naslov poizvedbe.
 *
 * 14. 9. 2026 je register podjetij tri dni stal: zacetek kroga pride iz baze
 * kot "2026-09-09T05:34:07.848939+00:00", v naslovu pa se "+" prebere kot
 * presledek -> PostgREST vrne 400 (22007 invalid input syntax for timestamp),
 * delavec pade ob zagonu in nikoli ne zapise utripa. Nadzornik ga je zato
 * zaganjal znova in znova: 123 oken, CPU 100 %, stroj videti zamrznjen.
 */
function zaUrl(cas: string): string {
  return encodeURIComponent(cas);
}

// --- baza (PostgREST) ------------------------------------------------------

async function bazaGet<T>(pot: string): Promise<T> {
  const r = await fetch(`${DB}/rest/v1/${pot}`, {
    headers: { apikey: DB_KLJUC, Authorization: `Bearer ${DB_KLJUC}` },
  });
  if (!r.ok) throw new Error(`baza ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

async function bazaPisi(pot: string, telo: unknown, prefer: string, metoda = "POST"): Promise<void> {
  const r = await fetch(`${DB}/rest/v1/${pot}`, {
    method: metoda,
    headers: {
      apikey: DB_KLJUC,
      Authorization: `Bearer ${DB_KLJUC}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: telo === undefined ? undefined : JSON.stringify(telo),
  });
  if (!r.ok) throw new Error(`baza ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

// --- SKD -------------------------------------------------------------------

type SkdVnos = { code: string; label: string };

function skdKode(): SkdVnos[] {
  const pot = join(KOREN, "src", "lib", "publicEnrichment", "skdCodes.json");
  return JSON.parse(readFileSync(pot, "utf8")) as SkdVnos[];
}

const SKD_NAZIV = new Map(skdKode().map((v) => [v.code, v.label]));

// --- vrsta rezin -----------------------------------------------------------

type Rezina = {
  id: number;
  skd: string;
  obcina: string;
  ulica: string;
  status: string;
  koren: boolean;
  poskusi: number;
};

/**
 * Začetne rezine: ena na SKD kodo, po celi državi.
 *
 * Večina jih bo prevelikih in se bo razbila na občine — a to naredi šele
 * odgovor AJPES-a, ne ugibanje vnaprej. 678 poizvedb je majhna cena za to, da
 * se manjše kode končajo z eno samo.
 */
async function zasej(znova = false): Promise<void> {
  if (znova) {
    // Nov krog: stara vrsta gre stran (vsa je bila obdelana), koreni znova.
    await bazaPisi("podjetja_rezine?id=gt.0", undefined, "return=minimal", "DELETE");
  } else {
    const obstojece = await bazaGet<{ id: number }[]>("podjetja_rezine?select=id&limit=1");
    if (obstojece.length > 0) return;
  }
  const vrstice = skdKode().map((v) => ({ skd: v.code, obcina: "", ulica: "", status: "1", koren: true }));
  for (let i = 0; i < vrstice.length; i += 200) {
    await bazaPisi(
      "podjetja_rezine?on_conflict=skd,obcina,ulica,status",
      vrstice.slice(i, i + 200),
      "resolution=ignore-duplicates,return=minimal"
    );
  }
  log(`vrsta zasejana: ${vrstice.length} SKD kod`);
}

async function naslednja(): Promise<Rezina | null> {
  const v = await bazaGet<Rezina[]>(
    "podjetja_rezine?select=id,skd,obcina,ulica,status,koren,poskusi&stanje=eq.caka&order=koren.desc,id.asc&limit=1"
  );
  return v[0] ?? null;
}

async function oznaci(id: number, polja: Record<string, unknown>): Promise<void> {
  await bazaPisi(`podjetja_rezine?id=eq.${id}`, polja, "return=minimal", "PATCH");
}

// --- podjetja --------------------------------------------------------------

type VrsticaAjpes = {
  name: string;
  shortName: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  registrationNumber: string | null;
  vatId: string | null;
  detailUrl: string;
  foundUnderCode?: string | null;
};

async function shrani(vrstice: VrsticaAjpes[], rezina: Rezina): Promise<number> {
  // Znotraj enega paketa se isto podjetje ne sme pojaviti dvakrat: Postgres pri
  // ON CONFLICT DO UPDATE iste vrstice ne sme posodobiti dvakrat in bi zavrnil
  // cel paket.
  const poUrl = new Map<string, VrsticaAjpes>();
  for (const v of vrstice) if (v.detailUrl) poUrl.set(v.detailUrl, v);
  if (poUrl.size === 0) return 0;

  const zdaj = new Date().toISOString();
  const paket = [...poUrl.values()].map((v) => {
    const skd = (v.foundUnderCode || rezina.skd || "").trim();
    return {
      detail_url: v.detailUrl,
      maticna: v.registrationNumber,
      davcna: v.vatId,
      naziv: v.name,
      kratki_naziv: v.shortName,
      naslov: v.address,
      posta: v.postalCode,
      kraj: v.city,
      obcina: rezina.obcina || null,
      skd: skd || null,
      skd_naziv: SKD_NAZIV.get(skd) ?? null,
      status: rezina.status,
      zadnjic_videno: zdaj,
    };
  });

  for (let i = 0; i < paket.length; i += 100) {
    await bazaPisi(
      "podjetja_register?on_conflict=detail_url",
      paket.slice(i, i + 100),
      "resolution=merge-duplicates,return=minimal"
    );
  }
  return paket.length;
}

// --- ena rezina ------------------------------------------------------------

type OdgovorRezine = {
  oznaka?: string;
  vrstice?: VrsticaAjpes[];
  skupaj?: number | null;
  otroci?: { skd: string; status: string; obcina: string | null; ulica: string | null }[];
  vrzel?: string | null;
  napaka_rezine?: string;
};

async function vprasajStran(rezina: Rezina): Promise<OdgovorRezine> {
  const r = await fetch(`${STRAN}/api/interno/podjetja/rezina`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-interni-kljuc": INTERNI_KLJUC },
    body: JSON.stringify({
      skd: rezina.skd,
      status: rezina.status,
      obcina: rezina.obcina || undefined,
      ulica: rezina.ulica || undefined,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!r.ok) throw new Error(`stran ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as OdgovorRezine;
}

function oznakaRezine(r: Rezina): string {
  const deli = [r.skd || "vse"];
  if (r.obcina) deli.push(r.obcina);
  if (r.ulica) deli.push(`ulice na ${r.ulica.toUpperCase()}`);
  return deli.join(" · ");
}

/** Vrne true, če je šlo za zavrnitev in se je treba umakniti. */
async function obdelaj(rezina: Rezina): Promise<boolean> {
  const oznaka = oznakaRezine(rezina);
  utrip(`obdelujem ${oznaka}`);

  let odgovor: OdgovorRezine;
  try {
    odgovor = await vprasajStran(rezina);
  } catch (e) {
    const sporocilo = e instanceof Error ? e.message : String(e);
    const poskusi = rezina.poskusi + 1;
    await oznaci(rezina.id, {
      poskusi,
      napaka: sporocilo.slice(0, 300),
      stanje: poskusi >= NAJVEC_POSKUSOV ? "napaka" : "caka",
    });
    log(`NAPAKA ${oznaka}: ${sporocilo.slice(0, 200)}`);
    return /403|429|blok/i.test(sporocilo);
  }

  if (odgovor.napaka_rezine) {
    const poskusi = rezina.poskusi + 1;
    await oznaci(rezina.id, {
      poskusi,
      napaka: odgovor.napaka_rezine.slice(0, 300),
      stanje: poskusi >= NAJVEC_POSKUSOV ? "napaka" : "caka",
    });
    log(`NAPAKA ${oznaka}: ${odgovor.napaka_rezine.slice(0, 200)}`);
    return /403|429|blok/i.test(odgovor.napaka_rezine);
  }

  const shranjenih = await shrani(odgovor.vrstice ?? [], rezina);
  const otroci = odgovor.otroci ?? [];

  if (otroci.length > 0) {
    // Rezina je bila prevelika: AJPES je vrnil samo prvih sto. Teh sto smo
    // obdržali (so resnična podjetja), ostalo pa najdejo pod-rezine.
    for (let i = 0; i < otroci.length; i += 200) {
      await bazaPisi(
        "podjetja_rezine?on_conflict=skd,obcina,ulica,status",
        otroci.slice(i, i + 200).map((o) => ({
          skd: o.skd,
          obcina: o.obcina ?? "",
          ulica: o.ulica ?? "",
          status: o.status,
          koren: false,
        })),
        "resolution=ignore-duplicates,return=minimal"
      );
    }
    await oznaci(rezina.id, {
      stanje: "razbito",
      zadetkov: shranjenih,
      skupaj: odgovor.skupaj ?? null,
      koncan: new Date().toISOString(),
    });
    log(`${oznaka}: ${odgovor.skupaj ?? "?"} zadetkov -> razbito na ${otroci.length} delov`);
    return false;
  }

  await oznaci(rezina.id, {
    stanje: "koncano",
    zadetkov: shranjenih,
    skupaj: odgovor.skupaj ?? null,
    napaka: odgovor.vrzel ?? null,
    koncan: new Date().toISOString(),
  });
  log(`${oznaka}: ${shranjenih} podjetij`);
  return false;
}

// --- statistika ------------------------------------------------------------

async function stevilo(pot: string): Promise<number> {
  const r = await fetch(`${DB}/rest/v1/${pot}`, {
    headers: {
      apikey: DB_KLJUC,
      Authorization: `Bearer ${DB_KLJUC}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  const obseg = r.headers.get("content-range") ?? "";
  const n = Number(obseg.split("/")[1]);
  return Number.isFinite(n) ? n : 0;
}

// --- druga faza: podrobnosti s kartice podjetja -----------------------------

/**
 * Kontaktov (e-pošta, telefon, spletna stran) v seznamu zadetkov NI.
 *
 * AJPES jih pokaže šele na kartici posameznega podjetja, do katere sta
 * potrebni dve zahtevi (izbira podjetja v seji in branje PRS pogleda). Za
 * 253.000 podjetij je to pol milijona zahtev — zato se ta faza izvaja med
 * krogi, ko je vrsta rezin prazna in bi delavec sicer samo čakal. Tempo
 * ostane isti (PREMOR_MS), tako da AJPES ne dobi nič več prometa kot doslej,
 * le premori gredo v koristno delo.
 *
 * Vrstica, ki trikrat ne uspe, se pusti pri miru (detajli_poskusi), sicer bi
 * se ena pokvarjena kartica vrtela v nedogled pred vsemi ostalimi.
 */
type ZaDetajle = { id: number; detail_url: string; naziv: string | null; detajli_poskusi: number };

/**
 * Stanje druge faze, kot ga vidi nadzorna plošča.
 *
 * Brez tega bi stran kazala „0,0 % obogatenih“ enako takrat, ko delo teče
 * počasi, in takrat, ko vir sploh ne da kartic — to sta dve zelo različni
 * stvari in uporabnik mora ločiti med njima. Vrednost postavlja glavna zanka,
 * bere pa jo osveziStatistiko().
 */
let stanjeDetajlov: "caka" | "tece" | "vir_ne_da_kartic" | "vir_zahteva_captcha" | "koncano" = "caka";
/** Kdaj bo delavec kartico spet poskusil (med hlajenjem), za nadzor. */
let naslednjiPoskusDetajlovOb: string | null = null;

/**
 * Vrsta za AJPES kartice: kar kartica še ni prebrala (tudi če je spletna
 * stran že), najprej podjetja BREZ e-pošte. Kartic je ~20 na dan, zato gredo
 * tja, kjer splet ni dal ničesar — tam so vredne največ.
 */
async function naslednjiZaDetajle(koliko: number): Promise<ZaDetajle[]> {
  return bazaGet<ZaDetajle[]>(
    "podjetja_register?select=id,detail_url,naziv,detajli_poskusi" +
      "&or=(detajli_status.is.null,detajli_status.like.splet*)&detajli_poskusi=lt.3&ni_vec_od=is.null" +
      "&order=eposta.asc.nullsfirst,id.asc&limit=" +
      koliko
  );
}

/** Polja s kartice -> stolpci registra. Kar vira ne da, ostane prazno. */
function vStolpce(polja: Record<string, string>): Record<string, unknown> {
  const p = (k: string) => (typeof polja[k] === "string" && polja[k].trim() ? polja[k].trim() : null);
  return {
    eposta: p("email"),
    telefon: p("phone"),
    spletna_stran: p("website"),
    direktor: p("director"),
    zastopniki: p("authorized_representatives"),
    pravna_oblika: p("legal_form"),
    velikost: p("company_size"),
    ustanovljeno: p("founded_date"),
    trr: p("bank_account"),
    regija: p("address_region"),
    // Kartica pove glavno dejavnost natančneje kot iskanje, po katerem smo
    // podjetje našli — a le, če jo res vsebuje.
    skd: p("skd_code") ?? undefined,
    skd_naziv: p("skd_name") ?? undefined,
    davcna: p("vat_id") ?? undefined,
  };
}

type ZavrnitevKartice = false | "zavrnitev" | "captcha";

/** Vrne vrsto zavrnitve vira (takrat se umaknemo za dlje) ali false. */
async function obdelajDetajl(v: ZaDetajle): Promise<ZavrnitevKartice> {
  utrip(`podrobnosti ${v.naziv ?? v.id}`);
  let odgovor: { polja?: Record<string, string>; napaka_branja?: string | null };
  try {
    const r = await fetch(`${STRAN}/api/interno/podjetja/detajl`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-interni-kljuc": INTERNI_KLJUC },
      body: JSON.stringify({ url: v.detail_url, ime: v.naziv ?? "" }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!r.ok) throw new Error(`stran ${r.status}: ${(await r.text()).slice(0, 160)}`);
    odgovor = (await r.json()) as typeof odgovor;
  } catch (e) {
    const sporocilo = e instanceof Error ? e.message : String(e);
    await bazaPisi(
      `podjetja_register?id=eq.${v.id}`,
      // Števec se poveča, ne postavi: PostgREST ne zna "stolpec + 1", zato
      // ga preštejemo iz vrstice, ki smo jo ravnokar prebrali.
      { detajli_poskusi: v.detajli_poskusi + 1, detajli_napaka: sporocilo.slice(0, 300) },
      "return=minimal",
      "PATCH"
    );
    log(`NAPAKA podrobnosti ${v.id}: ${sporocilo.slice(0, 160)}`);
    return /403|429|blok/i.test(sporocilo) ? "zavrnitev" : false;
  }

  const polja = odgovor.polja ?? {};
  const naslo = Object.keys(polja).length > 0;

  /**
   * „Okrnjena stran“ NI napaka tega podjetja.
   *
   * 15. 9. so se kartice dopoldne odpirale, popoldne pa nobena več — tudi po
   * iskanju v isti seji, ki ga AJPES sicer zahteva. To je vedenje vira, ne
   * vrstice: če bi šteli poskuse, bi v pol ure vseh 253.000 podjetij dobilo
   * tri križce in oznako „prebrano, brez podatkov“, kar bi bilo neresnično.
   * Zato se ob tem umaknemo (hlajenje) in vrstice pustimo nedotaknjene.
   */
  if (!naslo && /okrnjen|ni bilo mogo[čc]e odpreti|reCAPTCHA/i.test(odgovor.napaka_branja ?? "")) {
    return /reCAPTCHA/i.test(odgovor.napaka_branja ?? "") ? "captcha" : "zavrnitev";
  }
  const zdaj = new Date().toISOString();
  const posodobitev: Record<string, unknown> = naslo
    ? { ...vStolpce(polja), detajli_ob: zdaj, detajli_status: "ok", detajli_napaka: null }
    : {
        // Kartica se je odprla, a podatkov ni: to ni napaka, ki bi jo bilo
        // vredno ponavljati — zabeležimo in gremo naprej.
        detajli_ob: zdaj,
        detajli_status: "ni_podatkov",
        detajli_napaka: (odgovor.napaka_branja ?? "").slice(0, 300) || null,
      };
  // Polja, ki jih kartica ni imela, ne smejo povoziti tistega, kar že imamo.
  for (const k of Object.keys(posodobitev)) if (posodobitev[k] === undefined) delete posodobitev[k];

  if (!naslo && odgovor.napaka_branja) {
    // Vir se je zataknil (okrnjena stran): poskusimo še dvakrat, ne trikrat.
    await bazaPisi(
      `podjetja_register?id=eq.${v.id}`,
      { detajli_poskusi: v.detajli_poskusi + 1, detajli_napaka: odgovor.napaka_branja.slice(0, 300) },
      "return=minimal",
      "PATCH"
    );
    return /403|429|blok/i.test(odgovor.napaka_branja) ? "zavrnitev" : false;
  }

  await bazaPisi(`podjetja_register?id=eq.${v.id}`, posodobitev, "return=minimal", "PATCH");
  return false;
}

// --- tretja faza: kontakti s spletnih strani podjetij -------------------------

/**
 * Zakaj še ta pot: AJPES kartic od 15. 9. 2026 ne daje več kot ~10 na ~10 ur
 * (reCAPTCHA). Spletna stran podjetja je edini vir kontaktov brez tuje kvote.
 * Branje živi na strani (`/api/interno/podjetja/splet`), tu je le vrsta,
 * vzporednost in zapis v register.
 *
 * Stolpce `eposta`/`telefon`/`spletna_stran` splet zapolni samo, kadar so
 * prazni: kar je dala AJPES kartica, je uradno in ostane.
 */
type ZaSplet = {
  id: number;
  naziv: string | null;
  kratki_naziv: string | null;
  kraj: string | null;
  davcna: string | null;
  eposta: string | null;
  telefon: string | null;
  spletna_stran: string | null;
  detajli_ob: string | null;
};

type OdgovorSpleta = {
  stanje?: "najdena" | "ni_strani" | "brez_iskanja";
  spletnaStran?: string | null;
  eposta?: string | null;
  telefon?: string | null;
  opomba?: string;
  zahtev?: number;
  napaka_branja?: string;
};

let stanjeSpleta: "caka" | "tece" | "koncano" | "ustavljeno" | "stran_ne_odgovarja" = "caka";
let spletObdelanihOdZagona = 0;
/** Kdaj je zanka splet začela — za tempo v prvi uri, ko urno okno še ni polno. */
const spletZagonOb = Date.now();
let spletNajdenihOdZagona = 0;
let spletZEpostoOdZagona = 0;

/** Vrstice, ki so ta hip v delu — da jih drugi vzporedni bralec ne vzame še enkrat. */
const spletVDelu = new Set<number>();
let spletVrsta: ZaSplet[] = [];
let spletVrstaZaklep: Promise<unknown> = Promise.resolve();

async function vzemiZaSplet(): Promise<ZaSplet | null> {
  const prevzem = spletVrstaZaklep.then(async () => {
    if (spletVrsta.length === 0) {
      const izkljuci = spletVDelu.size > 0 ? `&id=not.in.(${[...spletVDelu].join(",")})` : "";
      spletVrsta = await bazaGet<ZaSplet[]>(
        "podjetja_register?select=id,naziv,kratki_naziv,kraj,davcna,eposta,telefon,spletna_stran,detajli_ob" +
          "&splet_ob=is.null&ni_vec_od=is.null" +
          izkljuci +
          `&order=splet_prioriteta.asc,id.asc&limit=${SPLET_VZPOREDNO * 5}`
      );
    }
    const v = spletVrsta.shift() ?? null;
    if (v) spletVDelu.add(v.id);
    return v;
  });
  spletVrstaZaklep = prevzem.then(
    () => undefined,
    () => undefined
  );
  return prevzem;
}

async function obdelajSplet(v: ZaSplet): Promise<"obdelano" | "zasedeno"> {
  utrip(`splet ${v.naziv ?? v.id}`);
  const r = await fetch(`${STRAN}/api/interno/podjetja/splet`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-interni-kljuc": INTERNI_KLJUC },
    body: JSON.stringify({ naziv: v.naziv ?? "", kratki_naziv: v.kratki_naziv, kraj: v.kraj, davcna: v.davcna }),
    // Pot ima svoj rok 60 s; 90 s je le varovalka za primer, da stran obtiči.
    signal: AbortSignal.timeout(90_000),
  });
  // 503 pomeni „stran je zasedena“, ne napake te vrstice: obogatitev naj se
  // ne označi, samo malo počakamo. Brez tega bi podjetje dobilo splet_status
  // „napaka“ zato, ker je bila stran tisti hip polna.
  if (r.status === 503) {
    await r.text().catch(() => "");
    return "zasedeno";
  }
  if (!r.ok) throw new Error(`stran ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const o = (await r.json()) as OdgovorSpleta;
  const zdaj = new Date().toISOString();

  if (!o.stanje) {
    // Napaka pri tej strani (ne pri poti): zabeležimo in gremo naprej — ena
    // pokvarjena stran ne sme ustaviti vrste.
    await bazaPisi(
      `podjetja_register?id=eq.${v.id}`,
      { splet_ob: zdaj, splet_status: "napaka", splet_opomba: (o.napaka_branja ?? "neznana napaka").slice(0, 400) },
      "return=minimal",
      "PATCH"
    );
    return "obdelano";
  }

  const posodobitev: Record<string, unknown> = {
    splet_ob: zdaj,
    splet_status: o.stanje,
    splet_opomba: (o.opomba ?? "").slice(0, 400) || null,
  };
  if (o.stanje === "najdena") {
    if (!v.spletna_stran && o.spletnaStran) posodobitev.spletna_stran = o.spletnaStran;
    if (!v.eposta && o.eposta) posodobitev.eposta = o.eposta;
    if (!v.telefon && o.telefon) posodobitev.telefon = o.telefon;
  }
  // „Obdelano“ za napredek: če kartica AJPES vrstice še ni prebrala, jo kot
  // obdelano označi splet. Kartica jo lahko pozneje še dopolni.
  if (!v.detajli_ob) {
    posodobitev.detajli_ob = zdaj;
    posodobitev.detajli_status = o.stanje === "najdena" ? "splet" : "splet_ni";
  }
  await bazaPisi(`podjetja_register?id=eq.${v.id}`, posodobitev, "return=minimal", "PATCH");
  spletObdelanihOdZagona += 1;
  if (o.stanje === "najdena") spletNajdenihOdZagona += 1;
  if (o.eposta && !v.eposta) spletZEpostoOdZagona += 1;
  return "obdelano";
}

/** En vzporedni bralec: vzame vrstico, jo obdela, vzame naslednjo. */
async function spletBralec(st: number): Promise<void> {
  for (;;) {
    if (existsSync(SPLET_STOP)) {
      stanjeSpleta = "ustavljeno";
      await spanec(60_000);
      continue;
    }
    let v: ZaSplet | null;
    try {
      v = await vzemiZaSplet();
    } catch (e) {
      log(`splet ${st}: baza ni dosegljiva: ${e instanceof Error ? e.message : e}`);
      await spanec(60_000);
      continue;
    }
    if (!v) {
      stanjeSpleta = "koncano";
      await spanec(30 * 60_000);
      continue;
    }
    stanjeSpleta = "tece";
    try {
      const izid = await obdelajSplet(v);
      if (izid === "zasedeno") {
        // Vrstico vrnemo v vrsto in počakamo: stran streže tudi obiskovalce.
        spletVrsta.unshift(v);
        await spanec(SPLET_ZASEDENO_MS);
      }
    } catch (e) {
      // Stran (localhost) ne odgovarja ali baza ne piše: vrstica ostane v
      // vrsti, mi pa počakamo — bombardiranje ne pomaga nikomur.
      stanjeSpleta = "stran_ne_odgovarja";
      log(`splet ${st}: ${e instanceof Error ? e.message.slice(0, 200) : e}`);
      await spanec(60_000);
    } finally {
      spletVDelu.delete(v.id);
    }
  }
}

/** Zažene vzporedne bralce in vsakih 90 s osveži statistiko. */
async function spletZanka(): Promise<void> {
  log(`splet: zagon, ${SPLET_VZPOREDNO} vzporednih bralcev`);
  for (let i = 1; i <= SPLET_VZPOREDNO; i += 1) {
    void spletBralec(i).catch((e) => log(`splet ${i} PADEC: ${e instanceof Error ? (e.stack ?? e.message) : e}`));
    await spanec(1_500);
  }
  for (;;) {
    await spanec(90_000);
    if (stanjeSpleta === "tece" || stanjeSpleta === "koncano") {
      await osveziStatistiko().catch((e) => log(`splet statistika: ${e instanceof Error ? e.message : e}`));
    }
  }
}

// --- krogi -----------------------------------------------------------------

type Krog = { id: number; zacetek: string; konec: string | null; podjetij: number | null; poizvedb: number | null; novih: number | null; izginulih: number | null };

async function zadnjiKrog(): Promise<Krog | null> {
  const v = await bazaGet<Krog[]>("podjetja_krogi?select=id,zacetek,konec,podjetij,poizvedb,novih,izginulih&order=id.desc&limit=1");
  return v[0] ?? null;
}

/**
 * Konec kroga: kar zadnji cel prehod ni več našel, dobi datum „ni več v
 * registru“. Vrstica ostane — izbris ni podatek, datum je. Kar je krog spet
 * našel, datum izgubi (podjetje se je vrnilo ali je bil spregled).
 */
async function zakljuciKrog(krog: Krog): Promise<void> {
  const zdaj = new Date().toISOString();
  await bazaPisi(
    `podjetja_register?zadnjic_videno=lt.${zaUrl(krog.zacetek)}&ni_vec_od=is.null`,
    { ni_vec_od: zdaj },
    "return=minimal",
    "PATCH"
  );
  await bazaPisi(
    `podjetja_register?zadnjic_videno=gte.${zaUrl(krog.zacetek)}&ni_vec_od=not.is.null`,
    { ni_vec_od: null },
    "return=minimal",
    "PATCH"
  );
  const [podjetij, novih, izginulih, poizvedb] = await Promise.all([
    stevilo("podjetja_register?select=id&ni_vec_od=is.null"),
    stevilo(`podjetja_register?select=id&prvic_videno=gte.${zaUrl(krog.zacetek)}`),
    stevilo(`podjetja_register?select=id&ni_vec_od=gte.${zaUrl(krog.zacetek)}`),
    stevilo("podjetja_rezine?select=id&stanje=in.(koncano,razbito)"),
  ]);
  await bazaPisi(`podjetja_krogi?id=eq.${krog.id}`, { konec: zdaj, podjetij, novih, izginulih, poizvedb }, "return=minimal", "PATCH");
  log(`krog ${krog.id} končan: ${podjetij} aktivnih, ${novih} novih, ${izginulih} ni več v registru, ${poizvedb} poizvedb`);
}

async function zacniKrog(): Promise<Krog> {
  await bazaPisi("podjetja_krogi", [{ premor_ms: PREMOR_MS }], "return=minimal");
  await zasej(true);
  const k = (await zadnjiKrog()) as Krog;
  log(`krog ${k.id} začet`);
  return k;
}

/** Ali je čas za nov krog: zadnji je končan in dovolj star, ali pa ga zahteva znak. */
function casZaNovKrog(zadnji: Krog | null): boolean {
  if (existsSync(NOV_KROG_ZNAK)) return true;
  if (!zadnji) return true;
  if (!zadnji.konec) return false;
  return Date.now() - new Date(zadnji.konec).getTime() >= KROG_DNI * 86_400_000;
}

/**
 * Kaj pokazati na nadzorni plošči.
 *
 * ETA je namerno groba: rezin je ob vsakem razbitju več, zato "koliko je še"
 * ni število, ki bi ga vedeli vnaprej. Ocena iz trenutnega tempa je poštenejša
 * od navidez natančne številke, ki bi se vsak dan podvojila.
 */
async function osveziStatistiko(): Promise<void> {
  const vceraj = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [podjetij, danes, koncanih, caka, napak] = await Promise.all([
    stevilo("podjetja_register?select=id"),
    stevilo(`podjetja_register?select=id&prvic_videno=gte.${zaUrl(vceraj)}`),
    stevilo("podjetja_rezine?select=id&stanje=in.(koncano,razbito)"),
    stevilo("podjetja_rezine?select=id&stanje=eq.caka"),
    stevilo("podjetja_rezine?select=id&stanje=eq.napaka"),
  ]);

  const krog = await zadnjiKrog();
  const krogTece = Boolean(krog && !krog.konec);
  const krogZacetekMs = krog ? new Date(krog.zacetek).getTime() : null;
  const dniTece = krogTece && krogZacetekMs ? (Date.now() - krogZacetekMs) / 86_400_000 : null;
  // Tempo iz TEGA kroga: koliko poizvedb na uro je res naredil, ne kolikor
  // bi jih po premoru moral. Prvi krog je bil 4,6 dneva pri 4 s.
  const naUroIzmerjeno = dniTece && dniTece > 0.02 ? koncanih / (dniTece * 24) : null;
  const naUro = naUroIzmerjeno ?? 3_600_000 / Math.max(PREMOR_MS + 1_500, 1);
  const urDoKonca = krogTece ? caka / Math.max(naUro, 0.001) : 0;
  // Druga faza: koliko kartic je že prebranih in kaj so dale.
  const predDnevom = zaUrl(new Date(Date.now() - 24 * 3600_000).toISOString());
  const predUro = zaUrl(new Date(Date.now() - 3600_000).toISOString());
  const [detajlovOk, detajlovVcerajDanes, detajlovVUri, zEposto, sTelefonom, sSpletno, detajliObupani, seZaObdelat] =
    await Promise.all([
      stevilo("podjetja_register?select=id&detajli_ob=not.is.null"),
      stevilo(`podjetja_register?select=id&detajli_ob=gte.${predDnevom}`),
      stevilo(`podjetja_register?select=id&detajli_ob=gte.${predUro}`),
      stevilo("podjetja_register?select=id&eposta=not.is.null"),
      stevilo("podjetja_register?select=id&telefon=not.is.null"),
      stevilo("podjetja_register?select=id&spletna_stran=not.is.null"),
      stevilo("podjetja_register?select=id&detajli_ob=is.null&detajli_poskusi=gte.3"),
      // Kar je še v vrsti: aktivno podjetje, ki ga ni prebrala ne kartica ne
      // splet. Izginula podjetja niso v imenovalcu, sicer odstotek nikoli ne
      // doseže sto; obupane AJPES kartice PA so, ker jih splet še lahko obdela.
      stevilo("podjetja_register?select=id&detajli_ob=is.null&ni_vec_od=is.null"),
    ]);
  const zaNapredek = detajlovOk + seZaObdelat;
  // V prvi uri po zagonu urno okno še ni polno: 27 vrstic v prvih 40 s bi se
  // preračunalo v „27 na uro“ in oceno devet tisoč dni. Dokler zanka teče
  // manj kot uro, je tempo obdelano-od-zagona deljeno s pretečenim časom.
  const urOdZagona = (Date.now() - spletZagonOb) / 3600_000;
  const naUroObogatitve =
    urOdZagona < 1 && urOdZagona > 0.03 ? Math.round(spletObdelanihOdZagona / urOdZagona) : detajlovVUri;
  const [ajpesKartic, spletNajdenih, spletBrezStrani, spletBrezIskanja, spletNapak] = await Promise.all([
    stevilo("podjetja_register?select=id&detajli_status=in.(ok,ni_podatkov)"),
    stevilo("podjetja_register?select=id&splet_status=eq.najdena"),
    stevilo("podjetja_register?select=id&splet_status=eq.ni_strani"),
    stevilo("podjetja_register?select=id&splet_status=eq.brez_iskanja"),
    stevilo("podjetja_register?select=id&splet_status=eq.napaka"),
  ]);

  const [aktivnih, izginulihSkupaj, novihVKrogu] = await Promise.all([
    stevilo("podjetja_register?select=id&ni_vec_od=is.null"),
    stevilo("podjetja_register?select=id&ni_vec_od=not.is.null"),
    krog ? stevilo(`podjetja_register?select=id&prvic_videno=gte.${zaUrl(krog.zacetek)}`) : Promise.resolve(0),
  ]);
  const naslednjiKrogOb =
    !krogTece && krog?.konec ? new Date(new Date(krog.konec).getTime() + KROG_DNI * 86_400_000).toISOString() : null;

  await bazaPisi(
    "avtonet_statistika?on_conflict=kljuc",
    [
      {
        kljuc: "podjetja",
        podatki: {
          podjetij,
          aktivnih,
          izginulih_skupaj: izginulihSkupaj,
          v24h: danes,
          rezin_koncanih: koncanih,
          rezin_caka: caka,
          rezin_napak: napak,
          odstotek: krogTece ? (koncanih + caka > 0 ? Math.round((koncanih / (koncanih + caka)) * 100) : 0) : 100,
          ur_do_konca: Math.round(urDoKonca * 10) / 10,
          premor_ms: PREMOR_MS,
          // Podrobnosti: odstotek od vseh podjetij, deleži pa od PREBRANIH
          // kartic — "20 % ima e-pošto" mora pomeniti med tistimi, ki smo jih
          // že vprašali, ne med vsemi, sicer številka raste sama od sebe.
          detajli: {
            prebranih: detajlovOk,
            od_vseh: zaNapredek,
            se_za_obdelat: seZaObdelat,
            odstotek: zaNapredek > 0 ? Math.round((detajlovOk / zaNapredek) * 1000) / 10 : 0,
            na_dan: detajlovVcerajDanes,
            na_uro: naUroObogatitve,
            // Ocena iz tempa ZADNJE URE, ne zadnjega dneva: splet je zagnan
            // 16. 9. in dnevno okno bi prvih 24 ur kazalo pol prepočasen tempo.
            // Ocena obstaja samo, dokler se v zadnji uri kaj obdela — stran
            // jo pokaže le, če je zadnja obdelana vrstica mlajša od 15 min.
            dni_do_konca: naUroObogatitve > 0 ? Math.round((seZaObdelat / (naUroObogatitve * 24)) * 10) / 10 : null,
            stanje: stanjeDetajlov,
            ajpes_naslednji_ob: naslednjiPoskusDetajlovOb,
            ajpes_kartic: ajpesKartic,
            splet_stanje: stanjeSpleta,
            splet_najdenih: spletNajdenih,
            splet_brez_strani: spletBrezStrani,
            // Ugibanje domene ni uspelo, iskalnik pa ni bil na voljo: te vrstice
            // čakajo na prehod z iskalnim API-jem, niso „brez strani“.
            splet_brez_iskanja: spletBrezIskanja,
            splet_napak: spletNapak,
            splet_od_zagona: {
              obdelanih: spletObdelanihOdZagona,
              najdenih: spletNajdenihOdZagona,
              z_eposto: spletZEpostoOdZagona,
            },
            z_eposto: zEposto,
            s_telefonom: sTelefonom,
            s_spletno: sSpletno,
            obupanih: detajliObupani,
          },
          krog: krog
            ? {
                st: krog.id,
                zacetek: krog.zacetek,
                konec: krog.konec,
                tece: krogTece,
                dni_tece: dniTece === null ? null : Math.round(dniTece * 10) / 10,
                novih: novihVKrogu,
                naslednji_ob: naslednjiKrogOb,
                krog_dni: KROG_DNI,
              }
            : null,
        },
        izracunano: new Date().toISOString(),
      },
    ],
    "resolution=merge-duplicates,return=minimal"
  );
}

// --- glavna zanka ----------------------------------------------------------

async function main(): Promise<void> {
  if (!DB_KLJUC || !INTERNI_KLJUC) {
    log("USTAVLJENO: manjka AVTONET_DB_KEY ali INTERNI_KLJUC v .env.local");
    process.exit(1);
  }
  if (!prevzemiZaklep()) {
    log("Že teče drug primerek — končujem.");
    process.exit(0);
  }
  log(`zagon (premor ${PREMOR_MS} ms, stran ${STRAN})`);

  await zasej();
  // Krog brez zapisa (prvi zagon te različice sredi dela) dobi vrstico, da
  // imajo dnevi in tempo od česa šteti.
  try {
    const zadnji = await zadnjiKrog();
    const cakajocih = await stevilo("podjetja_rezine?select=id&stanje=eq.caka");
    if (cakajocih > 0 && (!zadnji || zadnji.konec)) await bazaPisi("podjetja_krogi", [{ premor_ms: PREMOR_MS }], "return=minimal");
  } catch (e) {
    log(`krog ob zagonu: ${e instanceof Error ? e.message : e}`);
  }

  // Kontakti s spletnih strani tečejo vzporedno z rezinami in karticami: ne
  // delijo si ne vira ne kvote, samo bazo in proces.
  void spletZanka().catch((e) => log(`splet PADEC: ${e instanceof Error ? (e.stack ?? e.message) : e}`));

  let odRezine = 0;
  let odDetajla = 0;
  let zaporednihOkrnjenih = 0;
  for (;;) {
    let rezina: Rezina | null = null;
    try {
      rezina = await naslednja();
    } catch (e) {
      log(`baza ni dosegljiva: ${e instanceof Error ? e.message : e}`);
      utrip("cakam na bazo");
      await spanec(60_000);
      continue;
    }

    if (!rezina) {
      // Vrsta je prazna: krog je prehojen. Zaključimo ga (oznake „ni več v
      // registru“), nato čakamo na naslednjega — vsakih KROG_DNI ali na znak.
      try {
        // Osvežitev statistike je šest štetij čez 253.000 vrstic. Prej je
        // stala TU brezpogojno, torej pred vsako prebrano kartico — kar je
        // pomenilo nekaj polnih preštevanj na sekundo in je obogatitev samo
        // upočasnjevalo. Zdaj se osveži le, kadar se je kaj res spremenilo
        // (krog se je zaključil ali začel), sicer pa na vsakih STATISTIKA_NA
        // kartic oziroma ob zavrnitvi vira.
        let krog = await zadnjiKrog();
        if (krog && !krog.konec) {
          await zakljuciKrog(krog);
          krog = await zadnjiKrog();
          await osveziStatistiko();
        }
        if (casZaNovKrog(krog)) {
          if (existsSync(NOV_KROG_ZNAK)) unlinkSync(NOV_KROG_ZNAK);
          await zacniKrog();
          await osveziStatistiko();
          continue;
        }
      } catch (e) {
        log(`krog: ${e instanceof Error ? e.message : e}`);
      }

      // Med krogi: podrobnosti podjetij (e-pošta, telefon, spletna stran).
      try {
        const zaDetajle = await naslednjiZaDetajle(1);
        if (zaDetajle.length > 0) {
          const zavrnjen = await obdelajDetajl(zaDetajle[0]);
          odDetajla += 1;
          zaporednihOkrnjenih = zavrnjen ? zaporednihOkrnjenih + 1 : 0;
          // reCAPTCHA je jasen odgovor že prvič; „okrnjena stran“ šele po treh
          // zapored (ena kartica se lahko ne odpre, tri pomenijo vir).
          stanjeDetajlov =
            zavrnjen === "captcha" ? "vir_zahteva_captcha" : zaporednihOkrnjenih >= 3 ? "vir_ne_da_kartic" : "tece";
          if (zavrnjen) {
            const hlajenje = hlajenjeDetajlov(zaporednihOkrnjenih);
            naslednjiPoskusDetajlovOb = new Date(Date.now() + hlajenje).toISOString();
            log(
              `${zavrnjen === "captcha" ? "AJPES zahteva reCAPTCHA za kartice" : "zavrnitev pri podrobnostih"} ` +
                `(${zaporednihOkrnjenih}. zapored) — hlajenje ${Math.round(hlajenje / 60000)} min, ` +
                `naslednji poskus ob ${new Date(Date.now() + hlajenje).toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" })}`
            );
            // Osvežitev takoj, da stran med hlajenjem ne kaže starega stanja.
            await osveziStatistiko().catch(() => {});
            await cakajZUtripom(hlajenje, "hlajenje po zavrnitvi kartic");
            naslednjiPoskusDetajlovOb = null;
          } else {
            naslednjiPoskusDetajlovOb = null;
            if (odDetajla % STATISTIKA_NA === 0) await osveziStatistiko().catch(() => {});
            await spanec(PREMOR_MS);
          }
          continue;
        }
        stanjeDetajlov = "koncano";
      } catch (e) {
        log(`podrobnosti: ${e instanceof Error ? e.message : e}`);
      }

      await cakajZUtripom(30 * 60_000, "krog koncan, cakam naslednjega");
      continue;
    }

    const zavrnjeno = await obdelaj(rezina);

    odRezine += 1;
    if (odRezine % STATISTIKA_NA === 0) {
      try {
        await osveziStatistiko();
      } catch (e) {
        log(`statistika ni uspela: ${e instanceof Error ? e.message : e}`);
      }
    }

    if (zavrnjeno) {
      log(`zavrnitev — hlajenje ${Math.round(HLAJENJE_MS / 60000)} min`);
      await cakajZUtripom(HLAJENJE_MS, "hlajenje po zavrnitvi");
    } else {
      await spanec(PREMOR_MS);
    }
  }
}

main().catch((e) => {
  log(`PADEC: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
});
