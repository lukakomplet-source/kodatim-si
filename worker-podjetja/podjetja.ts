import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
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
const PREMOR_MS = Number(process.env.PODJETJA_PREMOR_MS ?? 4_000);
/** Po zavrnitvi (403/429) se umaknemo za dlje, namesto da vztrajamo. */
const HLAJENJE_MS = Number(process.env.PODJETJA_HLAJENJE_MS ?? 10 * 60_000);
/** Koliko zaporednih neuspehov rezine, preden jo pustimo pri miru. */
const NAJVEC_POSKUSOV = 5;
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
    body: JSON.stringify(telo),
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
async function zasej(): Promise<void> {
  const obstojece = await bazaGet<{ id: number }[]>("podjetja_rezine?select=id&limit=1");
  if (obstojece.length > 0) return;
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
    stevilo(`podjetja_register?select=id&prvic_videno=gte.${vceraj}`),
    stevilo("podjetja_rezine?select=id&stanje=in.(koncano,razbito)"),
    stevilo("podjetja_rezine?select=id&stanje=eq.caka"),
    stevilo("podjetja_rezine?select=id&stanje=eq.napaka"),
  ]);

  const naUro = 3_600_000 / Math.max(PREMOR_MS + 5_000, 1);
  const urDoKonca = caka / Math.max(naUro, 0.001);

  await bazaPisi(
    "avtonet_statistika?on_conflict=kljuc",
    [
      {
        kljuc: "podjetja",
        podatki: {
          podjetij,
          v24h: danes,
          rezin_koncanih: koncanih,
          rezin_caka: caka,
          rezin_napak: napak,
          odstotek: koncanih + caka > 0 ? Math.round((koncanih / (koncanih + caka)) * 100) : 0,
          ur_do_konca: Math.round(urDoKonca * 10) / 10,
          premor_ms: PREMOR_MS,
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

  let odRezine = 0;
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
      // Vrsta je prazna: register je prehojen. Čez čas pogledamo znova, ker
      // podjetja nastajajo in ugašajo — a brez hitenja.
      utrip("vse rezine koncane");
      try {
        await osveziStatistiko();
      } catch {
        // Statistika ni razlog za padec.
      }
      await spanec(6 * 3600_000);
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
      utrip("hlajenje po zavrnitvi");
      await spanec(HLAJENJE_MS);
    } else {
      await spanec(PREMOR_MS);
    }
  }
}

main().catch((e) => {
  log(`PADEC: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
});
