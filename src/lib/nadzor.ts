import "server-only";
import { open, readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { preberiSistem, type Sistem } from "@/lib/avtonet/sistem";
import { preberiNapredek } from "@/lib/registerPodjetij";

const izvedi = promisify(execFile);

/**
 * Eno mesto, ki pove, ali vsi zbiralniki delajo — in če ne, kateri stoji.
 *
 * Zakaj sploh: doslej je vsak modul poročal zase (avtonet svojo konzolo,
 * nepremičnine svojo, skrejp podjetij nikamor), zato je bilo treba odpreti tri
 * strani in vedeti, kaj je na vsaki normalno. 3. 9. je arhivar PDF-jev tri dni
 * padal pri vsakem oglasu, utrip pa je ves čas pisal svežo minuto — od zunaj
 * je bil videti živ. Zato tu ni dovolj vprašanje "ali teče", ampak tudi "ali
 * pri tem sploh kaj naredi".
 *
 * Vse se bere na strežniku istega računalnika, kjer delavci tečejo: utripi so
 * navadne datoteke, obremenitev pride iz sistema, števci iz lokalne baze.
 */

/** Kjer delavci puščajo utrip in dnevnike. */
const MAPA = process.env.NADZOR_MAPA ?? "C:\\Users\\lukak\\avtonet-db";

/**
 * Zbiralnika povprašamo neposredno, ne prek baze.
 *
 * Prvi izris te strani je 4. 9. pokazal „Avto.net — zbiralnik: stoji (pred 8 h)“,
 * medtem ko je pregled tekel in ravno zapisoval oglase. Vzrok: kot znak
 * življenja sem vzel `avtonet_statistika.zbiralnik`, ki pa se zapiše šele ob
 * koncu kroga — med dvanajsturnim premorom med termini je zato vedno videti
 * mrtev. Delavec ima svojo pot /zdravje z utripom v sekundah; to je edini
 * odgovor na vprašanje „ali je ta proces živ ZDAJ“.
 */
const ZDRAVJE_AVTONET = process.env.NADZOR_AVTONET ?? "http://127.0.0.1:8080/zdravje";
const ZDRAVJE_NEPREMICNINE = process.env.NADZOR_NEPREMICNINE ?? "http://127.0.0.1:8081/zdravje";

type Zdravje = {
  ok?: boolean;
  heartbeatAgeMs?: number;
  state?: string;
  lastError?: string | null;
  consecutiveFailures?: number;
  faza?: number;
  vir?: string | null;
};

async function zdravjeDelavca(naslov: string): Promise<Zdravje | null> {
  try {
    const r = await fetch(naslov, { signal: AbortSignal.timeout(2_500), cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as Zdravje;
  } catch {
    // Nedosegljiv delavec NI podatek, ki bi ga skrili — vrne se null in
    // kartica pove „stoji“, kar je takrat res.
    return null;
  }
}

export type Skrejper = {
  kljuc: string;
  ime: string;
  opis: string;
  /** null pomeni, da o stanju ne moremo trditi ničesar. */
  tece: boolean | null;
  /** Sekunde od zadnjega znaka življenja. */
  starostS: number | null;
  poce: string | null;
  odstotek: number | null;
  eta: string | null;
  stevilke: { oznaka: string; vrednost: string }[];
  opozorilo: string | null;
};

export type Disk = { crka: string; skupajGb: number; prostoGb: number };

export type Nadzor = {
  skrejperji: Skrejper[];
  sistem: Sistem;
  diski: Disk[];
  ob: string;
  /** Neskladje med razlicico, ki tece, in tisto na disku; null = vse v redu. */
  zastarelaGradnja: string | null;
};

/**
 * Oznaka gradnje, s katero je ta proces vstal.
 *
 * Prebrana ob prvem uvozu modula, torej ob zagonu strezhnika. Ce se pozneje
 * na disku pojavi druga oznaka, pomeni, da je bila mapa .next zamenjana POD
 * tekocim procesom — natanko to se je zgodilo 19. 9. 2026 ob 23:22: stran je
 * vracala 200 na naslovnici, vsaka se nenalozena podstran pa je padla na
 * manjkajocem kosu, in tako je bilo 34 ur, ker tega ni nihce meril.
 */
const GRADNJA_OB_ZAGONU = preberiOznakoGradnje();

function preberiOznakoGradnje(): string | null {
  try {
    // Sinhrono in namenoma: vrednost mora biti ujeta ob zagonu procesa, ne
    // sele ob prvem vprasanju — do takrat je mapa lahko ze zamenjana.
    return readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

/** Kaj pokazati v nadzoru: null, kadar tekoca in zgrajena razlicica sovpadata. */
async function preveriGradnjo(): Promise<string | null> {
  if (!GRADNJA_OB_ZAGONU) return null;
  let naDisku: string | null = null;
  try {
    naDisku = (await readFile(join(process.cwd(), ".next", "BUILD_ID"), "utf8")).trim();
  } catch {
    return null;
  }
  if (!naDisku || naDisku === GRADNJA_OB_ZAGONU) return null;
  return (
    `Stran tece na STARI gradnji (${GRADNJA_OB_ZAGONU}), na disku je ${naDisku}. ` +
    "Podstrani, ki jih proces se ni nalozil, bodo padle na manjkajocem kosu — potreben je ponoven zagon strani."
  );
}

// --- pomožno ---------------------------------------------------------------

/** Zadnjih nekaj kilobajtov dnevnika; cel dnevnik je lahko 30 MB. */
async function rep(pot: string, bajtov = 8_192): Promise<string> {
  try {
    const podatki = await stat(pot);
    const dolzina = Math.min(bajtov, podatki.size);
    const f = await open(pot, "r");
    try {
      const medpomnilnik = Buffer.alloc(dolzina);
      await f.read(medpomnilnik, 0, dolzina, podatki.size - dolzina);
      return medpomnilnik.toString("utf8");
    } finally {
      await f.close();
    }
  } catch {
    return "";
  }
}

type Utrip = { ob: Date | null; sporocilo: string | null };

async function utrip(ime: string): Promise<Utrip> {
  const vsebina = (await rep(join(MAPA, ime), 512)).trim();
  if (!vsebina) return { ob: null, sporocilo: null };
  const presledek = vsebina.indexOf(" ");
  const casDel = presledek > 0 ? vsebina.slice(0, presledek) : vsebina;
  const ob = new Date(casDel);
  return {
    ob: Number.isNaN(ob.getTime()) ? null : ob,
    sporocilo: presledek > 0 ? vsebina.slice(presledek + 1).trim() : null,
  };
}

function starost(ob: Date | null | undefined): number | null {
  if (!ob) return null;
  return Math.max(0, Math.round((Date.now() - ob.getTime()) / 1000));
}

function ura(ur: number | null): string | null {
  if (ur === null || !Number.isFinite(ur) || ur <= 0) return null;
  if (ur < 1) return `${Math.round(ur * 60)} min`;
  if (ur < 48) return `${Math.round(ur)} h`;
  return `${Math.round(ur / 24)} dni`;
}

function stevilo(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("sl-SI") : "—";
}

/**
 * Delež zadnjih vrstic dnevnika, ki so napake.
 *
 * Proces, ki teče in pri vsakem poskusu pade, je z vidika utripa videti zdrav.
 * Prav to se je zgodilo arhivarju: 200 od 200 zadnjih vrstic je bilo
 * „Napaka pri …“, utrip pa svež.
 */
async function delezNapak(dnevnik: string): Promise<{ napak: number; vseh: number }> {
  const vrstice = (await rep(join(MAPA, dnevnik), 16_384))
    .split(/\r?\n/)
    .filter((v) => v.trim().length > 0)
    .slice(-40);
  const napak = vrstice.filter((v) => /napaka|error|padec/i.test(v)).length;
  return { napak, vseh: vrstice.length };
}

// --- diski in arhiv --------------------------------------------------------

/**
 * Prostor na diskih se spreminja po megabajtih na minuto, PowerShell za
 * meritev pa stane pol sekunde procesorja, ki ga ta stroj nima odveč
 * (ob prvem izrisu: 100 %). Minuta starosti ni laž.
 */
let zadnjiDiski: { ob: number; vrednost: Disk[] } | null = null;

async function diski(): Promise<Disk[]> {
  if (zadnjiDiski && Date.now() - zadnjiDiski.ob < 60_000) return zadnjiDiski.vrednost;
  const vrednost = await izmeriDiske();
  zadnjiDiski = { ob: Date.now(), vrednost };
  return vrednost;
}

async function izmeriDiske(): Promise<Disk[]> {
  try {
    const { stdout } = await izvedi(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | " +
          "ForEach-Object { $_.DeviceID + ';' + $_.Size + ';' + $_.FreeSpace }",
      ],
      { timeout: 12_000 }
    );
    return stdout
      .trim()
      .split(/\r?\n/)
      .map((v) => v.split(";"))
      .filter((d) => d.length === 3 && Number(d[1]) > 0)
      .map((d) => ({
        crka: d[0].trim(),
        skupajGb: Number(d[1]) / 1024 ** 3,
        prostoGb: Number(d[2]) / 1024 ** 3,
      }));
  } catch {
    return [];
  }
}

// --- posamezni skrejperji --------------------------------------------------

type Podatki = Record<string, unknown>;

type Raziskava = {
  status: string;
  faza: number;
  zacetek: string | null;
  strani_pregledanih: number;
  oglasov_najdenih: number;
  novih: number;
  napak: number;
  trenutna_rezina: string | null;
  poizvedb_skupaj: number;
  poizvedb_koncanih: number;
  detajlov_obdelanih: number;
  detajlov_skupaj: number;
  zadnja_napaka: string | null;
};

/** Naslednji termin iz urnika ("6,18"), da „čaka“ pove tudi na kaj. */
function naslednjiTermin(ure: string | undefined): string | null {
  const seznam = (ure ?? "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v >= 0 && v < 24)
    .sort((a, b) => a - b);
  if (seznam.length === 0) return null;
  const zdaj = new Date();
  const naslednja = seznam.find((u) => u > zdaj.getHours()) ?? seznam[0];
  return `${String(naslednja).padStart(2, "0")}:00`;
}

function statZa(vrstice: { kljuc: string; podatki: Podatki; izracunano: string }[], kljuc: string) {
  return vrstice.find((v) => v.kljuc === kljuc);
}

export async function preberiNadzor(): Promise<Nadzor> {
  const db = createAvtonetClient();

  // Samo ključi, ki jih ta stran res kaže: v obeh tabelah živijo tudi zapisi
  // s po nekaj megabajti (seznam poslov, seznam modelov), ki bi jih sicer
  // vlekli ob vsakem izrisu za nič.
  const [avtonetStat, nepStat, sistem, seznamDiskov] = await Promise.all([
    db
      .from("avtonet_statistika")
      .select("kljuc, podatki, izracunano")
      .in("kljuc", ["zbiralnik", "pdf_arhiv", "vid", "podjetja"]),
    db
      .from("nep_statistika")
      .select("kljuc, podatki, izracunano")
      .or("kljuc.eq.pdf_arhiv,kljuc.like.zdravje:*"),
    preberiSistem(),
    diski(),
  ]);

  const a = (avtonetStat.data ?? []) as { kljuc: string; podatki: Podatki; izracunano: string }[];
  const n = (nepStat.data ?? []) as { kljuc: string; podatki: Podatki; izracunano: string }[];

  // Tekoči pregled: brez njega kartica ne more povedati, kje v krogu smo.
  const { data: raziskaveData } = await db
    .from("avtonet_raziskave")
    .select(
      "status, faza, zacetek, strani_pregledanih, oglasov_najdenih, novih, napak, trenutna_rezina, " +
        "poizvedb_skupaj, poizvedb_koncanih, detajlov_obdelanih, detajlov_skupaj, zadnja_napaka"
    )
    .order("zahtevano_ob", { ascending: false })
    .limit(1);
  const raziskava = (raziskaveData?.[0] ?? null) as Raziskava | null;

  const { data: urnikData } = await db.from("avtonet_urnik").select("omogocen, ure").limit(1);
  const urnik = (urnikData?.[0] ?? null) as { omogocen: boolean; ure: string } | null;

  const [zdAvtonet, zdNepremicnine, napredekKontaktov] = await Promise.all([
    zdravjeDelavca(ZDRAVJE_AVTONET),
    zdravjeDelavca(ZDRAVJE_NEPREMICNINE),
    preberiNapredek().catch(() => null),
  ]);

  const [uPdf, uVid, uPodjetja, uNepPdf] = await Promise.all([
    utrip("pdf-arhiv.utrip"),
    utrip("vid.utrip"),
    utrip("podjetja.utrip"),
    utrip("nep-pdf-arhiv.utrip"),
  ]);
  const [napakePdf, napakePodjetja] = await Promise.all([
    delezNapak("pdf-arhiv.log"),
    delezNapak("podjetja.log"),
  ]);

  const skrejperji: Skrejper[] = [];

  // 1. Avtonet — zbiralnik oglasov
  {
    const s = statZa(a, "zbiralnik");
    const p = (s?.podatki ?? {}) as Podatki;
    const tece = raziskava?.status === "tece";
    const termin = urnik?.omogocen ? naslednjiTermin(urnik.ure) : null;

    // Napredek znotraj kroga: faza 1 hodi po rezinah iskanja, faza 2 pobira
    // podrobnosti. Vsaka ima svoj imenovalec, zato se merita ločeno.
    const [narejeno, vseh] =
      raziskava?.faza === 2
        ? [raziskava.detajlov_obdelanih, raziskava.detajlov_skupaj]
        : [raziskava?.poizvedb_koncanih ?? 0, raziskava?.poizvedb_skupaj ?? 0];

    let poce: string | null = null;
    if (tece && raziskava) {
      const del = raziskava.faza === 2 ? "podrobnosti" : "seznami";
      poce = `${del}${raziskava.trenutna_rezina ? ` · ${raziskava.trenutna_rezina}` : ""} · ${raziskava.strani_pregledanih} strani, ${raziskava.novih} novih`;
    } else if (zdAvtonet?.ok) {
      poce = termin ? `čaka na naslednji termin ob ${termin}` : "čaka na zahtevo";
    }

    skrejperji.push({
      kljuc: "avtonet",
      ime: "Avto.net — zbiralnik oglasov",
      opis: "Bere sezname in podrobnosti vozil, dvakrat dnevno po urniku.",
      // Merilo je delavčev utrip, ne statistika: ta se zapiše šele ob koncu
      // kroga in bi vsak premor med termini kazala kot okvaro.
      tece: zdAvtonet ? zdAvtonet.ok !== false : false,
      starostS:
        typeof zdAvtonet?.heartbeatAgeMs === "number"
          ? Math.round(zdAvtonet.heartbeatAgeMs / 1000)
          : null,
      poce,
      odstotek: tece && vseh > 0 ? Math.round((narejeno / vseh) * 100) : null,
      eta: null,
      stevilke: tece
        ? [
            { oznaka: "Strani", vrednost: stevilo(raziskava?.strani_pregledanih) },
            { oznaka: "Oglasov", vrednost: stevilo(raziskava?.oglasov_najdenih) },
            { oznaka: "Novih", vrednost: stevilo(raziskava?.novih) },
            { oznaka: "Napak", vrednost: stevilo(raziskava?.napak) },
          ]
        : [
            { oznaka: "Zadnji krog", vrednost: raziskava?.status ?? "—" },
            { oznaka: "Strani", vrednost: stevilo(raziskava?.strani_pregledanih) },
            { oznaka: "Novih", vrednost: stevilo(raziskava?.novih) },
            { oznaka: "Premor", vrednost: p.delayMs ? `${Math.round(Number(p.delayMs) / 1000)} s` : "—" },
          ],
      opozorilo: !zdAvtonet
        ? "delavec se ne javlja na vratih 8080"
        : p.ustavi === true
          ? `zbiralnik je ustavljen${typeof p.razlog === "string" ? `: ${p.razlog}` : ""}`
          : !tece && raziskava?.status === "napaka"
            ? `zadnji krog je padel: ${(raziskava.zadnja_napaka ?? "").slice(0, 120)}`
            : null,
    });
  }

  // 2. Avtonet — arhiv PDF
  {
    const s = statZa(a, "pdf_arhiv");
    const p = (s?.podatki ?? {}) as Podatki;
    const cakajocih = Number(p.cakajocih ?? 0);
    const v24h = Number(p.v24h ?? 0);
    const datotek = Number(p.datotek ?? 0);
    const starostS = starost(uPdf.ob);
    const odstotek =
      datotek + cakajocih > 0 ? Math.round((datotek / (datotek + cakajocih)) * 100) : null;
    const vsePada = napakePdf.vseh >= 10 && napakePdf.napak / napakePdf.vseh > 0.8;
    skrejperji.push({
      kljuc: "pdf",
      ime: "Avto.net — arhiv PDF in slik",
      opis: "Shrani oglas kot PDF s slikami, preden izgine.",
      tece: starostS === null ? null : starostS < 10 * 60,
      starostS,
      poce: uPdf.sporocilo,
      odstotek,
      eta: ura(v24h > 0 ? (cakajocih / v24h) * 24 : null),
      stevilke: [
        { oznaka: "Arhiviranih", vrednost: stevilo(datotek) },
        { oznaka: "Čaka", vrednost: stevilo(cakajocih) },
        { oznaka: "Zadnjih 24 h", vrednost: stevilo(v24h) },
        {
          oznaka: "Prostor",
          vrednost: p.bajtov ? `${(Number(p.bajtov) / 1024 ** 3).toFixed(1)} GB` : "—",
        },
      ],
      opozorilo: vsePada
        ? `teče, a pada: ${napakePdf.napak} od zadnjih ${napakePdf.vseh} vrstic dnevnika je napaka`
        : null,
    });
  }

  // 3. Avtonet — lokalni model na slikah
  {
    const s = statZa(a, "vid");
    const p = (s?.podatki ?? {}) as Podatki;
    const obdelanih = Number(p.obdelanih ?? 0);
    const cakajocih = Number(p.cakajocih ?? 0);
    const v24h = Number(p.v24h ?? 0);
    const starostS = starost(uVid.ob);
    skrejperji.push({
      kljuc: "vid",
      ime: "Lokalni model — pregled slik",
      opis: "Z grafične kartice bere opremo in facelift s slik.",
      tece: starostS === null ? null : starostS < 30 * 60,
      starostS,
      poce: uVid.sporocilo,
      odstotek:
        obdelanih + cakajocih > 0 ? Math.round((obdelanih / (obdelanih + cakajocih)) * 100) : null,
      eta: ura(v24h > 0 && cakajocih > 0 ? (cakajocih / v24h) * 24 : null),
      stevilke: [
        { oznaka: "Pregledanih", vrednost: stevilo(obdelanih) },
        { oznaka: "Čaka", vrednost: stevilo(cakajocih) },
        { oznaka: "Zadnjih 24 h", vrednost: stevilo(v24h) },
        { oznaka: "Model", vrednost: typeof p.model === "string" ? p.model : "—" },
      ],
      opozorilo: null,
    });
  }

  // 4. Podjetja — AJPES po SKD kodah
  {
    const s = statZa(a, "podjetja");
    const p = (s?.podatki ?? {}) as Podatki;
    const starostS = starost(uPodjetja.ob);
    const vsePada = napakePodjetja.vseh >= 10 && napakePodjetja.napak / napakePodjetja.vseh > 0.8;
    skrejperji.push({
      kljuc: "podjetja",
      ime: "AJPES — register podjetij",
      opis: "Hodi po vseh 678 SKD kodah in polni register.",
      tece: starostS === null ? null : starostS < 10 * 60,
      starostS,
      poce: (() => {
        // Krog: kateri, koliko dni že teče, ali čaka na naslednjega.
        const k = (p.krog ?? null) as
          | { st?: number; tece?: boolean; dni_tece?: number | null; naslednji_ob?: string | null; krog_dni?: number }
          | null;
        if (!k) return uPodjetja.sporocilo;
        if (k.tece) {
          return `krog ${k.st} · teče ${k.dni_tece ?? 0} dni · ${uPodjetja.sporocilo ?? ""}`.trim();
        }
        const naslednji = k.naslednji_ob
          ? new Date(k.naslednji_ob).toLocaleString("sl-SI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })
          : "—";
        return `krog ${k.st} končan · naslednji ob ${naslednji} (vsakih ${k.krog_dni ?? 3} dni)`;
      })(),
      odstotek: typeof p.odstotek === "number" ? p.odstotek : null,
      eta: ura(typeof p.ur_do_konca === "number" ? p.ur_do_konca : null),
      stevilke: [
        { oznaka: "Aktivnih podjetij", vrednost: stevilo(p.aktivnih ?? p.podjetij) },
        { oznaka: "Ni več v registru", vrednost: stevilo(p.izginulih_skupaj ?? 0) },
        { oznaka: "Novih v tem krogu", vrednost: stevilo((p.krog as { novih?: number } | null)?.novih ?? 0) },
        { oznaka: "Zadnjih 24 h", vrednost: stevilo(p.v24h) },
        { oznaka: "Poizvedb končanih", vrednost: stevilo(p.rezin_koncanih) },
        { oznaka: "Poizvedb v vrsti", vrednost: stevilo(p.rezin_caka) },
        ...(napredekKontaktov
          ? [
              // Ista številka in isto pravilo kot na strani Register podjetij:
              // ocena se pokaže samo, kadar se obogatitev res premika.
              {
                oznaka: "Obdelanih (splet + kartice)",
                vrednost: `${stevilo(napredekKontaktov.prebranih)} · ${napredekKontaktov.odstotek} %`,
              },
              { oznaka: "Spletnih strani najdenih", vrednost: stevilo(napredekKontaktov.spletNajdenih) },
              { oznaka: "Z e-pošto", vrednost: stevilo(napredekKontaktov.zEposto) },
              {
                oznaka: "AJPES kartice",
                vrednost:
                  napredekKontaktov.stanje === "vir_zahteva_captcha"
                    ? `reCAPTCHA · ${stevilo(napredekKontaktov.ajpesKartic)} prebranih`
                    : `${stevilo(napredekKontaktov.ajpesKartic)} prebranih`,
              },
              {
                oznaka: "Kontakti",
                vrednost: napredekKontaktov.teceZdaj
                  ? napredekKontaktov.dniDoKonca
                    ? `še ~${napredekKontaktov.dniDoKonca} dni`
                    : "tempa še ni mogoče izmeriti"
                  : "stojijo",
              },
            ]
          : []),
      ],
      opozorilo: vsePada
        ? `teče, a pada: ${napakePodjetja.napak} od zadnjih ${napakePodjetja.vseh} vrstic dnevnika je napaka`
        : napredekKontaktov && napredekKontaktov.prebranih > 0 && !napredekKontaktov.teceZdaj
          ? `kontakti stojijo — zadnja prebrana kartica pred ${Math.round((napredekKontaktov.mirujeS ?? 0) / 60)} min (seznami tečejo naprej)`
          : null,
    });
  }

  // 5. Nepremičnine — zbiralnik po virih
  {
    const zdravja = n.filter((v) => v.kljuc.startsWith("zdravje:"));
    // Isto pravilo kot pri vozilih: živost pove delavec, ocene virov pa baza.
    const starostS =
      typeof zdNepremicnine?.heartbeatAgeMs === "number"
        ? Math.round(zdNepremicnine.heartbeatAgeMs / 1000)
        : null;
    const ustavljeni = zdravja.filter((v) => {
      const p = v.podatki as Podatki;
      return p.stanje === "blokada" || p.stanje === "hlajenje";
    });
    skrejperji.push({
      kljuc: "nepremicnine",
      ime: "Nepremičnine — zbiralnik",
      opis: "Štirje viri, vsak s svojim proračunom zahtevkov.",
      tece: zdNepremicnine ? zdNepremicnine.ok !== false : false,
      starostS,
      poce: zdravja
        .map((v) => `${(v.podatki as Podatki).vir}: ${(v.podatki as Podatki).stanje}`)
        .join(" · "),
      odstotek: null,
      eta: null,
      stevilke: zdravja.map((v) => ({
        oznaka: String((v.podatki as Podatki).vir ?? "vir"),
        vrednost: `ocena ${stevilo((v.podatki as Podatki).ocena)}`,
      })),
      opozorilo: !zdNepremicnine
        ? "delavec se ne javlja na vratih 8081"
        : ustavljeni.length > 0
          ? `${ustavljeni.length} vir(ov) v hlajenju ali blokadi`
          : null,
    });
  }

  // 6. Nepremičnine — arhiv PDF
  {
    const s = statZa(n, "pdf_arhiv");
    const p = (s?.podatki ?? {}) as Podatki;
    const starostS = starost(uNepPdf.ob);
    const cakajocih = Number(p.cakajocih ?? 0);
    const v24h = Number(p.v24h ?? 0);
    const datotek = Number(p.datotek ?? p.arhiviranih ?? 0);
    skrejperji.push({
      kljuc: "nep-pdf",
      ime: "Nepremičnine — arhiv PDF",
      opis: "Isto kot pri vozilih: oglas se shrani, preden izgine.",
      tece: starostS === null ? null : starostS < 3 * 3600,
      starostS,
      poce: uNepPdf.sporocilo,
      odstotek:
        datotek + cakajocih > 0 ? Math.round((datotek / (datotek + cakajocih)) * 100) : null,
      eta: ura(v24h > 0 && cakajocih > 0 ? (cakajocih / v24h) * 24 : null),
      stevilke: [
        { oznaka: "Arhiviranih", vrednost: stevilo(datotek) },
        { oznaka: "Čaka", vrednost: stevilo(cakajocih) },
        { oznaka: "Zadnjih 24 h", vrednost: stevilo(v24h) },
      ],
      opozorilo: null,
    });
  }

  // 7. Obogatitev podjetij (Lead Intelligence)
  //
  // Register AJPES pove, KDO podjetje je; kontaktov (telefon, e-posta,
  // kontaktna oseba) pa ne objavlja - ti nastanejo sele z obogatitvijo. Zato
  // je to locena kartica in ne stevilka znotraj registra: register je lahko
  // 100 % prehojen, obogatitev pa hkrati stoji, in prav to se je skrivalo.
  //
  // POZOR NA DVE BAZI: register (`podjetja_register`) je v LOKALNEM Postgresu,
  // CRM in vrsta (`intel_leads`, `enrichment_jobs`) pa v Supabase oblaku. Zato
  // tu `createAdminClient()`, ne `createAvtonetClient()` - poizvedba po napacni
  // bazi je 15. 9. 2026 pokazala prazno vrsto, ki prazna ni bila.
  {
    try {
      const leadi = createAdminClient();

      // Steje ze zgrajeno poizvedbo. Helper, ki bi poizvedbo gradil sam, se v
      // tipe supabase-js ne da spraviti brez `any`: `.from()` in `.select()`
      // vrneta razlicna gradnika.
      const prestej = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
      const glava = (tabela: string) =>
        leadi.from(tabela).select("id", { count: "exact", head: true });

      const preduro = new Date(Date.now() - 3_600_000).toISOString();
      const [vseh, zEposto, sTelefonom, sStranjo, caka, tece, koncanih, padlih, vUri] =
        await Promise.all([
          prestej(glava("intel_leads")),
          prestej(glava("intel_leads").not("email", "is", null)),
          prestej(glava("intel_leads").not("phone", "is", null)),
          prestej(glava("intel_leads").not("website", "is", null)),
          prestej(glava("enrichment_jobs").eq("status", "pending")),
          prestej(glava("enrichment_jobs").eq("status", "running")),
          prestej(glava("enrichment_jobs").eq("status", "done")),
          prestej(glava("enrichment_jobs").eq("status", "failed")),
          // Merilo hitrosti: koliko poslov se je KONCALO v zadnji uri. ETA iz
          // te stevilke je edini posten - vsaka vnaprejsnja ocena je ugibanje,
          // ker je tempo odvisen od tega, kako hitro odgovarjajo tuji viri.
          prestej(glava("enrichment_jobs").eq("status", "done").gte("updated_at", preduro)),
        ]);

      const vVrsti = caka + tece;
      const obdelanih = koncanih + padlih;
      const skupajPoslov = vVrsti + obdelanih;
      const odstotek = skupajPoslov > 0 ? Math.round((obdelanih / skupajPoslov) * 100) : null;

      // ETA samo, kadar je kaj izmerjenega. Brez tega raje nic kot stevilka,
      // ki bi jo nekdo vzel resno.
      const urDoKonca = vUri > 0 && vVrsti > 0 ? vVrsti / vUri : null;

      skrejperji.push({
        kljuc: "obogatitev",
        ime: "Obogatitev podjetij — kontakti",
        opis: "Poišče e-pošto, telefon in kontaktne osebe; AJPES jih ne objavlja.",
        // „Dela“ pomeni: v zadnji uri se je kaj koncalo ali kaj ravno tece.
        tece: vUri > 0 || tece > 0,
        starostS: null,
        poce:
          tece > 0
            ? `${stevilo(tece)} v obdelavi · ${stevilo(caka)} čaka · ${stevilo(vUri)} končanih v zadnji uri`
            : vVrsti > 0
              ? `${stevilo(vVrsti)} v vrsti, nič se ne obdeluje`
              : "vrsta je prazna",
        odstotek,
        eta: ura(urDoKonca),
        stevilke: [
          { oznaka: "V vrsti", vrednost: stevilo(vVrsti) },
          { oznaka: "Obdelanih", vrednost: stevilo(obdelanih) },
          { oznaka: "Na uro", vrednost: stevilo(vUri) },
          { oznaka: "Z e-pošto", vrednost: `${stevilo(zEposto)} / ${stevilo(vseh)}` },
          { oznaka: "S telefonom", vrednost: stevilo(sTelefonom) },
          { oznaka: "S spletno stranjo", vrednost: stevilo(sStranjo) },
        ],
        opozorilo:
          vVrsti > 0 && vUri === 0 && tece === 0
            ? `obogatitev stoji: ${stevilo(vVrsti)} čaka, v zadnji uri nič — delavec (npm run worker) ne teče`
            : padlih > 0
              ? `${stevilo(padlih)} poslov je padlo`
              : null,
      });
    } catch (e) {
      // Nedosegljiva baza leadov NE sme podreti cele nadzorne strani: ostalih
      // sest kartic je takrat se vedno edini vir resnice o zbiralnikih.
      skrejperji.push({
        kljuc: "obogatitev",
        ime: "Obogatitev podjetij — kontakti",
        opis: "Poišče e-pošto, telefon in kontaktne osebe; AJPES jih ne objavlja.",
        tece: null,
        starostS: null,
        poce: null,
        odstotek: null,
        eta: null,
        stevilke: [],
        opozorilo: `baze leadov ni bilo mogoče prebrati: ${e instanceof Error ? e.message : e}`,
      });
    }
  }

  return {
    skrejperji,
    sistem,
    zastarelaGradnja: await preveriGradnjo(),
    diski: seznamDiskov,
    ob: new Date().toISOString(),
  };
}

// --- podrobnosti enega delavca ---------------------------------------------

/** Dnevnik vsakega delavca, kot ga piše sam. Vsi so v isti mapi (MAPA). */
const DNEVNIKI: Record<string, string> = {
  avtonet: "worker.log",
  pdf: "pdf-arhiv.log",
  vid: "vid.log",
  podjetja: "podjetja.log",
  nepremicnine: "nepremicnine.log",
  "nep-pdf": "nep-pdf-arhiv.log",
};

export type VrsticaDnevnika = { ob: string | null; besedilo: string; napaka: boolean };

/**
 * Zadnje vrstice dnevnika, berljive kot v ukazni vrstici.
 *
 * Dva zapisa: zbiralnika pišeta JSON po vrsticah ({"t","lvl","msg",...}),
 * ostali navadno besedilo z ISO časom spredaj. Oboje se prevede v „ura ·
 * sporočilo · ključ=vrednost“, ker JSON v celoti na zaslonu ni za branje.
 */
export async function preberiDnevnik(kljuc: string, vrstic = 200): Promise<VrsticaDnevnika[]> {
  const ime = DNEVNIKI[kljuc];
  if (!ime) return [];
  const surovo = await rep(join(MAPA, ime), 96_000);
  const vrstice = surovo.split(/\r?\n/).filter((v) => v.trim().length > 0);
  // Prva vrstica je lahko odrezana sredi zapisa (bralo se je od zadaj).
  if (vrstice.length > 0 && surovo.length >= 96_000) vrstice.shift();
  return vrstice.slice(-vrstic).map(prevediVrstico);
}

function prevediVrstico(vrstica: string): VrsticaDnevnika {
  if (vrstica.startsWith("{")) {
    try {
      const z = JSON.parse(vrstica) as Record<string, unknown>;
      const { t, lvl, msg, ...ostalo } = z;
      const dodatki = Object.entries(ostalo)
        .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join("  ");
      return {
        ob: typeof t === "string" ? uraIz(t) : null,
        besedilo: `${typeof msg === "string" ? msg : ""}${dodatki ? "  " + dodatki : ""}`,
        napaka: lvl === "error" || lvl === "warn",
      };
    } catch {
      // Ni bil JSON — obravnavamo kot navadno vrstico.
    }
  }
  const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(.*)$/.exec(vrstica);
  const besedilo = m ? m[2] : vrstica;
  return {
    ob: m ? uraIz(m[1]) : null,
    besedilo,
    napaka: /napaka|error|padec|ustavljeno/i.test(besedilo),
  };
}

function uraIz(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export type Tabela = { naslov: string; glava: string[]; vrstice: string[][] };

function kdaj(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("sl-SI", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * Kar dnevnik ne pove na en pogled: pri zbiralniku zadnji krogi, pri
 * registru zadnje poizvedbe. Drugi delavci zaenkrat govorijo samo z dnevnikom.
 */
export async function preberiTabele(kljuc: string): Promise<Tabela[]> {
  const db = createAvtonetClient();

  if (kljuc === "avtonet") {
    const { data } = await db
      .from("avtonet_raziskave")
      .select("zacetek, konec, status, faza, strani_pregledanih, oglasov_najdenih, novih, izginulih, napak, zadnja_napaka")
      .not("zacetek", "is", null)
      .order("zacetek", { ascending: false })
      .limit(10);
    const vrstice = ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const z = r.zacetek ? new Date(String(r.zacetek)).getTime() : 0;
      const k = r.konec ? new Date(String(r.konec)).getTime() : Date.now();
      const min = z ? Math.round((k - z) / 60000) : 0;
      return [
        kdaj(r.zacetek as string),
        String(r.status),
        `${r.faza}`,
        min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`,
        stevilo(r.strani_pregledanih),
        stevilo(r.oglasov_najdenih),
        stevilo(r.novih),
        stevilo(r.izginulih),
        stevilo(r.napak),
        String(r.zadnja_napaka ?? "").slice(0, 90),
      ];
    });
    return [
      {
        naslov: "Zadnji krogi",
        glava: ["Začetek", "Status", "Faza", "Trajanje", "Strani", "Oglasov", "Novih", "Izginulih", "Napak", "Zadnja napaka"],
        vrstice,
      },
    ];
  }

  if (kljuc === "podjetja") {
    const { data: krogi } = await db
      .from("podjetja_krogi")
      .select("id, zacetek, konec, poizvedb, podjetij, novih, izginulih, premor_ms")
      .order("id", { ascending: false })
      .limit(20);
    const tabelaKrogov: Tabela = {
      naslov: "Krogi zajema (en krog = vseh 678 SKD kod)",
      glava: ["Krog", "Začetek", "Konec", "Trajanje", "Poizvedb", "Aktivnih podjetij", "Novih", "Ni več v registru", "Premor"],
      vrstice: ((krogi ?? []) as Record<string, unknown>[]).map((k) => {
        const z = k.zacetek ? new Date(String(k.zacetek)).getTime() : 0;
        const kon = k.konec ? new Date(String(k.konec)).getTime() : Date.now();
        const dni = z ? Math.round(((kon - z) / 86_400_000) * 10) / 10 : 0;
        return [
          String(k.id),
          kdaj(k.zacetek as string),
          k.konec ? kdaj(k.konec as string) : "teče",
          `${dni} dni`,
          stevilo(k.poizvedb),
          stevilo(k.podjetij),
          stevilo(k.novih),
          stevilo(k.izginulih),
          k.premor_ms ? `${Number(k.premor_ms) / 1000} s` : "—",
        ];
      }),
    };
    // Stanja preštejemo s štirimi štetji namesto tako, da bi 68.000 vrstic
    // prenesli po HTTP in jih prešteli v pomnilniku (1,4 MB na vsak izris te
    // strani, ki se osvežuje vsakih 15 s).
    const prestej = async (stanje: string): Promise<number> => {
      const { count } = await db
        .from("podjetja_rezine")
        .select("id", { count: "exact", head: true })
        .eq("stanje", stanje);
      return count ?? 0;
    };
    const [{ data: zadnje }, stanjaStevila] = await Promise.all([
      db
        .from("podjetja_rezine")
        .select("koncan, skd, obcina, ulica, stanje, zadetkov, skupaj, napaka")
        .not("koncan", "is", null)
        .order("koncan", { ascending: false })
        .limit(30),
      Promise.all(
        ["caka", "koncano", "razbito", "napaka"].map(async (v) => [v, await prestej(v)] as const)
      ),
    ]);
    const stetje = new Map<string, number>(stanjaStevila.filter(([, n]) => n > 0));
    return [
      tabelaKrogov,
      {
        naslov: "Vrsta poizvedb",
        glava: ["Stanje", "Poizvedb"],
        vrstice: [...stetje.entries()].map(([k, v]) => [k, stevilo(v)]),
      },
      {
        naslov: "Zadnje poizvedbe",
        glava: ["Kdaj", "SKD", "Občina", "Ulica", "Stanje", "Podjetij", "Zadetkov pri AJPES", "Opomba"],
        vrstice: ((zadnje ?? []) as Record<string, unknown>[]).map((r) => [
          kdaj(r.koncan as string),
          String(r.skd ?? ""),
          String(r.obcina ?? ""),
          String(r.ulica ?? ""),
          String(r.stanje ?? ""),
          stevilo(r.zadetkov),
          stevilo(r.skupaj),
          String(r.napaka ?? "").slice(0, 80),
        ]),
      },
    ];
  }

  return [];
}
