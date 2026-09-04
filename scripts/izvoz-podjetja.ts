import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

/**
 * Izvoz registra podjetij v Excel — na OneDrive in na disk D.
 *
 * Zakaj dve kopiji na dveh mestih: OneDrive je za dostop (odpreš z drugega
 * računalnika ali telefona), disk D je varnostna kopija za primer, ko oblak ni
 * dosegljiv ali se mapa razsinhronizira. Baza sama teče v Dockerju na tem
 * računalniku — če ta odpove, je Excel edino, kar ostane.
 *
 * Poleg dnevne datoteke se vsakič prepiše tudi "podjetja-zadnje.xlsx", da je
 * pot za odpiranje vedno ista in je ni treba iskati po datumu.
 *
 * Drugi list je pregled po SKD: koliko podjetij je pod katero kodo. To je
 * številka, po kateri se odloča, katero dejavnost sploh ima smisel obdelovati.
 */

const KOREN = join(import.meta.dirname, "..");
const LOG = process.env.PODJETJA_IZVOZ_LOG ?? "C:\\Users\\lukak\\avtonet-db\\podjetja-izvoz.log";

/** Mapa na priklopljenem OneDrive; ista pot kot PDF arhiv avtoneta. */
const ONEDRIVE = process.env.PODJETJA_IZVOZ_ONEDRIVE ?? "C:\\avtonet-arhiv\\podjetja";
/** Varnostna kopija na drugem disku, neodvisna od oblaka. */
const DISK_D = process.env.PODJETJA_IZVOZ_D ?? "D:\\kodatim-backup\\podjetja";
/** Koliko dnevnih datotek hranimo, preden začnemo brisati najstarejše. */
const HRANI_DATOTEK = 14;

function log(sporocilo: string): void {
  const vrstica = `${new Date().toISOString()} ${sporocilo}`;
  console.log(vrstica);
  try {
    appendFileSync(LOG, vrstica + "\n");
  } catch {
    // Dnevnik ni razlog za padec.
  }
}

function nastavitve(): Record<string, string> {
  const izhod: Record<string, string> = {};
  let vsebina = "";
  try {
    vsebina = readFileSync(join(KOREN, ".env.local"), "utf8");
  } catch {
    return izhod;
  }
  for (const vrstica of vsebina.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(vrstica.trim());
    if (m) izhod[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
  }
  return izhod;
}

const NAST = nastavitve();
const DB = NAST.AVTONET_DB_URL || "http://localhost:8000";
const KLJUC = NAST.AVTONET_DB_KEY || "";

type Podjetje = {
  maticna: string | null;
  davcna: string | null;
  naziv: string | null;
  kratki_naziv: string | null;
  naslov: string | null;
  posta: string | null;
  kraj: string | null;
  obcina: string | null;
  skd: string | null;
  skd_naziv: string | null;
  status: string | null;
  prvic_videno: string;
  zadnjic_videno: string;
  detail_url: string;
};

const POLJA = [
  "maticna",
  "davcna",
  "naziv",
  "kratki_naziv",
  "naslov",
  "posta",
  "kraj",
  "obcina",
  "skd",
  "skd_naziv",
  "status",
  "prvic_videno",
  "zadnjic_videno",
  "detail_url",
].join(",");

const GLAVA = [
  "Matična",
  "Davčna",
  "Naziv",
  "Kratki naziv",
  "Naslov",
  "Pošta",
  "Kraj",
  "Občina",
  "SKD",
  "SKD naziv",
  "Status",
  "Prvič videno",
  "Zadnjič videno",
  "AJPES povezava",
];

/** Bere po straneh: cel register naenkrat bi bil ena ogromna zahteva. */
async function preberiVse(): Promise<Podjetje[]> {
  const vse: Podjetje[] = [];
  const paket = 5_000;
  for (let odmik = 0; ; odmik += paket) {
    const r = await fetch(
      `${DB}/rest/v1/podjetja_register?select=${POLJA}&order=id.asc&limit=${paket}&offset=${odmik}`,
      { headers: { apikey: KLJUC, Authorization: `Bearer ${KLJUC}` } }
    );
    if (!r.ok) throw new Error(`baza ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const del = (await r.json()) as Podjetje[];
    vse.push(...del);
    if (del.length < paket) break;
  }
  return vse;
}

function datum(): string {
  return new Date().toISOString().slice(0, 10);
}

function zapisi(mapa: string, ime: string, vsebina: Buffer): boolean {
  try {
    if (!existsSync(mapa)) mkdirSync(mapa, { recursive: true });
    writeFileSync(join(mapa, ime), vsebina);
    return true;
  } catch (e) {
    // Ena nedosegljiva pot (odklopljen OneDrive, poln disk) ne sme pobrisati
    // druge kopije — zato vsaka pot svoj poskus.
    log(`NAPAKA pri pisanju v ${mapa}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** Starih dnevnih datotek ne kopičimo — register je vsak dan skoraj enak. */
function pospravi(mapa: string): void {
  try {
    const stare = readdirSync(mapa)
      .filter((v) => /^podjetja-\d{4}-\d{2}-\d{2}\.xlsx$/.test(v))
      .map((v) => ({ v, ob: statSync(join(mapa, v)).mtimeMs }))
      .sort((a, b) => b.ob - a.ob)
      .slice(HRANI_DATOTEK);
    for (const s of stare) unlinkSync(join(mapa, s.v));
    if (stare.length > 0) log(`${mapa}: pobrisanih ${stare.length} starih izvozov`);
  } catch {
    // Pospravljanje ni razlog za padec.
  }
}

async function main(): Promise<void> {
  if (!KLJUC) {
    log("USTAVLJENO: manjka AVTONET_DB_KEY v .env.local");
    process.exit(1);
  }

  const zacetek = Date.now();
  const podjetja = await preberiVse();
  if (podjetja.length === 0) {
    log("register je prazen — izvoza ni");
    return;
  }

  const vrstice: (string | null)[][] = [GLAVA];
  for (const p of podjetja) {
    vrstice.push([
      p.maticna,
      p.davcna,
      p.naziv,
      p.kratki_naziv,
      p.naslov,
      p.posta,
      p.kraj,
      p.obcina,
      p.skd,
      p.skd_naziv,
      p.status,
      p.prvic_videno?.slice(0, 19).replace("T", " ") ?? null,
      p.zadnjic_videno?.slice(0, 19).replace("T", " ") ?? null,
      p.detail_url,
    ]);
  }

  // Pregled po SKD: koda, naziv, koliko podjetij.
  const poSkd = new Map<string, { naziv: string; n: number }>();
  for (const p of podjetja) {
    const k = p.skd ?? "(brez)";
    const v = poSkd.get(k) ?? { naziv: p.skd_naziv ?? "", n: 0 };
    v.n += 1;
    if (!v.naziv && p.skd_naziv) v.naziv = p.skd_naziv;
    poSkd.set(k, v);
  }
  const povzetek: (string | number)[][] = [["SKD", "Dejavnost", "Podjetij"]];
  for (const [koda, v] of [...poSkd.entries()].sort((a, b) => b[1].n - a[1].n)) {
    povzetek.push([koda, v.naziv, v.n]);
  }

  const zvezek = XLSX.utils.book_new();
  const listPodjetja = XLSX.utils.aoa_to_sheet(vrstice);
  listPodjetja["!cols"] = [
    { wch: 12 }, { wch: 12 }, { wch: 46 }, { wch: 28 }, { wch: 30 },
    { wch: 8 }, { wch: 18 }, { wch: 16 }, { wch: 9 }, { wch: 38 },
    { wch: 7 }, { wch: 19 }, { wch: 19 }, { wch: 50 },
  ];
  // Zamrznjena glava in filtri: brez tega je 200.000 vrstic v Excelu neuporabnih.
  listPodjetja["!freeze"] = { xSplit: 0, ySplit: 1 };
  listPodjetja["!autofilter"] = { ref: `A1:N${vrstice.length}` };
  XLSX.utils.book_append_sheet(zvezek, listPodjetja, "Podjetja");

  const listSkd = XLSX.utils.aoa_to_sheet(povzetek);
  listSkd["!cols"] = [{ wch: 9 }, { wch: 48 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(zvezek, listSkd, "Po SKD");

  const vsebina = XLSX.write(zvezek, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const ime = `podjetja-${datum()}.xlsx`;
  const mb = (vsebina.length / 1024 / 1024).toFixed(1);

  const uspehi: string[] = [];
  for (const mapa of [ONEDRIVE, DISK_D]) {
    if (zapisi(mapa, ime, vsebina)) {
      zapisi(mapa, "podjetja-zadnje.xlsx", vsebina);
      pospravi(mapa);
      uspehi.push(mapa);
    }
  }

  log(
    `izvoz: ${podjetja.length.toLocaleString("sl-SI")} podjetij, ${poSkd.size} SKD kod, ${mb} MB, ` +
      `${Math.round((Date.now() - zacetek) / 1000)} s → ${uspehi.join(" + ") || "NIKAMOR"}`
  );
  if (uspehi.length === 0) process.exit(1);
}

main().catch((e) => {
  log(`PADEC: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
});
