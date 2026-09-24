import { spawn, execFile, type ChildProcess } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  unlinkSync,
  mkdirSync,
  renameSync,
  rmSync,
  openSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, basename } from "node:path";

/**
 * Lokalni render za kodatim.si/render: obnova starih fotografij, nekoč/danes,
 * 2,5D gibanje. Vse teče na tem računalniku (RTX 3060, 12 GB) — nič ne gre v
 * oblak.
 *
 * Stran naloge samo vpiše v `render_naloge`; ta delavec jih jemlje eno po eno.
 * Nikoli dveh hkrati: grafično si delimo z vizualnim AI (Ollama, ~5,5 GB) in s
 * CLIP strežnikom, dva modela za render pa v 12 GB ne gresta varno.
 *
 * Pred vsako nalogo:
 *   1. zapišemo zastavico gpu-zaseden.flag — vid.ts pred vsakim oglasom
 *      pogleda vanjo in počaka (med čakanjem piše utrip),
 *   2. Ollami rečemo, naj model sprosti (keep_alive: 0),
 *   3. preverimo rezervo OBVEZE pomnilnika (ne prostega RAM-a — glej spomin
 *      „obveza pomnilnika in padci AI“: llama-server je 20. 9. padal 60× na dan
 *      prav zato, ker je model ob nalaganju zadel mejo obveze),
 *   4. šele nato naložimo svoj model.
 *
 * ComfyUI (izvajalec modelov) se zažene šele, ko pride naloga, in ugasne po
 * nekaj minutah brez dela. Proces, ki miruje, drži CUDA kontekst in VRAM, ki ga
 * vizualni AI potrebuje ves dan.
 */

const MAPA = process.env.RENDER_MAPA ?? "D:\\kodatim-render";
const MAPA_STANJA = process.env.RENDER_MAPA_STANJA ?? "C:\\Users\\lukak\\avtonet-db";
const KOREN_REPO = join(import.meta.dirname, "..");

const COMFY_KOREN = join(MAPA, "ComfyUI_windows_portable");
const PYTHON = join(COMFY_KOREN, "python_embeded", "python.exe");
const COMFY_MAIN = join(COMFY_KOREN, "ComfyUI", "main.py");
const FFMPEG = join(MAPA, "orodja", "ffmpeg", "bin", "ffmpeg.exe");
const ORODJA_PY = join(import.meta.dirname, "py", "orodja.py");

const ZASTAVICA = join(MAPA, "gpu-zaseden.flag");
const LOG = join(MAPA_STANJA, "render.log");
const UTRIP = join(MAPA_STANJA, "render.utrip");
const ZAKLEP = join(MAPA_STANJA, "render.lock");
const COMFY_LOG = join(MAPA, "comfyui.log");

/**
 * Predpomnilniki modelov na D:, ne na C: (42 GB prostora). Brez tega torch in
 * huggingface prenašata v C:\Users\lukak\.cache. SSL_CERT_FILE: vgrajeni
 * Python ne pozna korenskih certifikatov Windows — 24. 9. 2026 je prenos uteži
 * LoFTR padel s CERTIFICATE_VERIFY_FAILED.
 */
const OKOLJE_MODELOV = {
  TORCH_HOME: join(MAPA, "modeli", "torch"),
  HF_HOME: join(MAPA, "modeli", "hf"),
  SSL_CERT_FILE: join(COMFY_KOREN, "python_embeded", "Lib", "site-packages", "certifi", "cacert.pem"),
};

const COMFY = "http://127.0.0.1:8188";
const OLLAMA = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";

/** Koliko ComfyUI sme mirovati, preden ga ugasnemo in sprostimo VRAM. */
const COMFY_MIRUJE_MS = 5 * 60_000;
/** Hladen zagon ComfyUI z diska D: (HDD) — torch in vozlišča se berejo dolgo. */
const COMFY_ZAGON_MS = 5 * 60_000;
/** Najdaljši en korak v ComfyUI; faza 1 je v sekundah, to je samo varovalka. */
const COMFY_KORAK_MS = 30 * 60_000;
/**
 * Najmanjša rezerva obveze pomnilnika (GB) za nalogo.
 *
 * ComfyUI s torch in modeli faze 1 obvezo zviša za ~4–5 GB. Pod 6 GB rezerve
 * tvegamo, da ob nalaganju pade kdo drug (najverjetneje llama-server).
 */
const NAJMANJ_OBVEZE_GB = Number(process.env.RENDER_NAJMANJ_OBVEZE_GB ?? 6);
/** Kolikokrat poskusimo nalogo, ki jo je prekinil padec delavca. */
const NAJVEC_POSKUSOV = 3;

// --- pomožno ---------------------------------------------------------------

function beri(pot: string): string {
  try {
    return readFileSync(pot, "utf8");
  } catch {
    return "";
  }
}

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

function spanec(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function zivProces(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Dva delavca bi naložila dva modela hkrati — natanko to, česar 12 GB ne prenese. */
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

/** Nastavitve iz .env.local; svoje knjižnice za to ne potrebujemo. */
function nastavitve(): Record<string, string> {
  const izhod: Record<string, string> = {};
  for (const vrstica of beri(join(KOREN_REPO, ".env.local")).split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(vrstica.trim());
    if (m) izhod[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
  }
  return izhod;
}

const NAST = nastavitve();
const DB = NAST.AVTONET_DB_URL || "http://localhost:8000";
const DB_KLJUC = NAST.AVTONET_DB_KEY || "";

/** Pot relativno na MAPA, s poševnicami naprej — tako jo hrani baza in bere stran. */
function relativno(pot: string): string {
  return pot.slice(MAPA.length + 1).replace(/\\/g, "/");
}

function absolutno(rel: string): string {
  return join(MAPA, ...rel.split("/"));
}

// --- baza (PostgREST) ------------------------------------------------------

type Vhod = { pot: string; ime?: string; vloga?: string; velikost?: number };

type Naloga = {
  id: number;
  vrsta: "obnova" | "nekoc_danes" | "paralaksa";
  status: string;
  naziv: string | null;
  vhod: Vhod[];
  parametri: Record<string, unknown>;
  rezultat: Record<string, unknown> | null;
  poskusi: number;
};

async function bazaGet<T>(pot: string): Promise<T> {
  const r = await fetch(`${DB}/rest/v1/${pot}`, {
    headers: { apikey: DB_KLJUC, Authorization: `Bearer ${DB_KLJUC}` },
  });
  if (!r.ok) throw new Error(`baza ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

async function posodobi(id: number, polja: Record<string, unknown>, pogoj = ""): Promise<number> {
  const r = await fetch(`${DB}/rest/v1/render_naloge?id=eq.${id}${pogoj}`, {
    method: "PATCH",
    headers: {
      apikey: DB_KLJUC,
      Authorization: `Bearer ${DB_KLJUC}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ ...polja, posodobljeno: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`baza ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return ((await r.json()) as unknown[]).length;
}

/** Napredek piše v bazo največ vsake 2 s — stran ga osvežuje na 3 s. */
function napredekZa(id: number, od: number, do_: number): (p: number, faza?: string) => void {
  let zadnji = 0;
  return (p, faza) => {
    utrip(`naloga ${id}: ${faza ?? ""} ${Math.round(p)} %`);
    const zdaj = Date.now();
    if (zdaj - zadnji < 2_000 && p < 100) return;
    zadnji = zdaj;
    const skupaj = Math.round(od + ((do_ - od) * Math.max(0, Math.min(100, p))) / 100);
    posodobi(id, faza ? { napredek: skupaj, faza } : { napredek: skupaj }).catch(() => {});
  };
}

class Preklicano extends Error {}

async function preveriPreklic(id: number): Promise<void> {
  const [v] = await bazaGet<{ status: string }[]>(`render_naloge?select=status&id=eq.${id}`).catch(() => []);
  if (v?.status === "preklicano") throw new Preklicano("preklicano");
}

// --- grafična: zastavica, Ollama, meritve -----------------------------------

/**
 * Zastavica vsebuje PID in čas, da je zapuščena ne more ustaviti vizualnega AI
 * za vedno: vid.ts jo upošteva samo, če proces še živi in ni starejša od 3 h.
 * Zapišemo jo z zamenjavo datoteke, da je bralec nikoli ne ujame napol.
 */
function zapisiZastavico(naloga: number): void {
  const zacasna = ZASTAVICA + ".nova";
  writeFileSync(zacasna, JSON.stringify({ pid: process.pid, naloga, zacetek: new Date().toISOString() }));
  renameSync(zacasna, ZASTAVICA);
}

function pobrisiZastavico(): void {
  try {
    unlinkSync(ZASTAVICA);
  } catch {
    // Že pobrisana.
  }
}

const VID_UTRIP = process.env.RENDER_VID_UTRIP ?? join(MAPA_STANJA, "vid.utrip");

/**
 * Počaka, da vizualni AI konča oglas, sredi katerega je.
 *
 * vid.ts zastavico pogleda samo PRED oglasom. Oglas, ki že teče, Ollami pošlje
 * še več vprašanj (po eno na sliko) in vsako model naloži nazaj s keep_alive
 * 10 min. 24. 9. 2026 (naloga 2) je zato render tekel ob 5,5 GB tujega modela:
 * Ollamo smo sprostili, oglas pa jo je v naslednji sekundi napolnil znova.
 * Med oglasom vid v utrip piše „berem <id>“; pred naslednjim že „cakam na
 * graficno“.
 */
async function pocakajDaVidMiruje(): Promise<void> {
  const konec = Date.now() + 4 * 60_000;
  while (Date.now() < konec) {
    const vsebina = beri(VID_UTRIP).trim();
    const presledek = vsebina.indexOf(" ");
    const cas = Date.parse(vsebina.slice(0, presledek));
    const svez = Number.isFinite(cas) && Date.now() - cas < 3 * 60_000;
    if (!svez || !vsebina.slice(presledek + 1).startsWith("berem")) return;
    utrip("cakam, da vizualni AI konca oglas");
    await spanec(2_000);
  }
  log("  OPOZORILO: vizualni AI v 4 min ni koncal oglasa - nadaljujem.");
}

/**
 * Sprosti modele v Ollami in počaka, da so res dol — dvakrat zapored prazno,
 * ker je en sam prazen odgovor lahko samo trenutek med dvema zahtevkoma.
 */
async function sprostiOllamo(): Promise<string[]> {
  const sproscenih = new Set<string>();
  const konec = Date.now() + 150_000;
  let praznih = 0;
  while (Date.now() < konec) {
    const ps = (await fetch(`${OLLAMA}/api/ps`, { signal: AbortSignal.timeout(5_000) })
      .then((r) => r.json())
      .catch(() => null)) as { models?: { name: string }[] } | null;
    const modeli = ps?.models?.map((m) => m.name) ?? [];
    if (modeli.length === 0) {
      if (++praznih >= 2) return [...sproscenih];
      await spanec(3_000);
      continue;
    }
    praznih = 0;
    for (const m of modeli) {
      sproscenih.add(m);
      await fetch(`${OLLAMA}/api/generate`, {
        method: "POST",
        body: JSON.stringify({ model: m, keep_alive: 0 }),
        signal: AbortSignal.timeout(90_000),
      }).catch(() => {});
    }
    utrip(`sproscam Ollamo (${modeli.join(", ")})`);
    await spanec(3_000);
  }
  log("  OPOZORILO: Ollama modela ni sprostila v 150 s - nadaljujem, faza 1 gre v preostanek.");
  return [...sproscenih];
}

function ukaz(program: string, args: string[], rokMs = 20_000): Promise<string> {
  return new Promise((resolve) => {
    execFile(program, args, { timeout: rokMs, windowsHide: true }, (napaka, stdout) => {
      resolve(napaka ? "" : String(stdout));
    });
  });
}

/** Prosta OBVEZA pomnilnika v GB; null, če je ne moremo izmeriti. */
async function prostaObvezaGB(): Promise<number | null> {
  const izpis = await ukaz("powershell", [
    "-NoProfile",
    "-Command",
    "(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory",
  ]);
  const kb = Number(izpis.trim());
  return Number.isFinite(kb) && kb > 0 ? kb / 1024 / 1024 : null;
}

async function vramMB(): Promise<number | null> {
  const izpis = await ukaz("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"], 10_000);
  const mb = Number(izpis.trim().split(/\r?\n/)[0]);
  return Number.isFinite(mb) && mb > 0 ? mb : null;
}

/** Meri največjo porabo VRAM med nalogo (vse procese skupaj, vključno z namizjem). */
function merilecVram(): { ustavi: () => number | null } {
  let najvec: number | null = null;
  let tece = true;
  (async () => {
    while (tece) {
      const mb = await vramMB();
      if (mb !== null) najvec = Math.max(najvec ?? 0, mb);
      await spanec(2_000);
    }
  })();
  return {
    ustavi: () => {
      tece = false;
      return najvec;
    },
  };
}

// --- ComfyUI ---------------------------------------------------------------

let comfyProces: ChildProcess | null = null;
let zadnjeDelo = Date.now();

async function comfyZiv(): Promise<boolean> {
  try {
    const r = await fetch(`${COMFY}/system_stats`, { signal: AbortSignal.timeout(3_000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function zagotoviComfy(): Promise<void> {
  if (await comfyZiv()) return;
  if (!existsSync(COMFY_MAIN)) throw new Error(`ComfyUI ni namescen (${COMFY_MAIN})`);
  log("  zaganjam ComfyUI ...");
  mkdirSync(join(MAPA, "delo", "comfy-vhod"), { recursive: true });
  mkdirSync(join(MAPA, "delo", "comfy-izhod"), { recursive: true });
  const izhod = openSync(COMFY_LOG, "a");
  comfyProces = spawn(
    PYTHON,
    [
      "-s",
      COMFY_MAIN,
      "--listen",
      "127.0.0.1",
      "--port",
      "8188",
      "--disable-auto-launch",
      "--input-directory",
      join(MAPA, "delo", "comfy-vhod"),
      "--output-directory",
      join(MAPA, "delo", "comfy-izhod"),
    ],
    {
      cwd: join(COMFY_KOREN, "ComfyUI"),
      windowsHide: true,
      stdio: ["ignore", izhod, izhod],
      env: { ...process.env, ...OKOLJE_MODELOV },
    }
  );
  comfyProces.on("exit", (koda) => {
    log(`  ComfyUI se je ustavil (koda ${koda}).`);
    comfyProces = null;
  });
  const zacetek = Date.now();
  while (Date.now() - zacetek < COMFY_ZAGON_MS) {
    utrip("zaganjam ComfyUI");
    if (await comfyZiv()) {
      log(`  ComfyUI tece po ${Math.round((Date.now() - zacetek) / 1000)} s.`);
      return;
    }
    if (!comfyProces) throw new Error(`ComfyUI se ni zagnal - glej ${COMFY_LOG}`);
    await spanec(2_000);
  }
  throw new Error(`ComfyUI se v ${COMFY_ZAGON_MS / 60_000} min ni odzval - glej ${COMFY_LOG}`);
}

/**
 * Ugasni ComfyUI. Ubijemo po ukazni vrstici in ne samo svojega otroka: po
 * ponovnem zagonu delavca je ComfyUI lahko sirota prejšnjega procesa in bi
 * sicer VRAM držal v nedogled.
 */
async function ustaviComfy(): Promise<void> {
  comfyProces?.kill();
  await ukaz("powershell", [
    "-NoProfile",
    "-Command",
    "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | " +
      "Where-Object { $_.CommandLine -match 'kodatim-render' -and $_.CommandLine -match 'main.py' } | " +
      "ForEach-Object { Stop-Process -Id $_.ProcessId -Force }",
  ]);
  comfyProces = null;
}

async function comfyFree(): Promise<void> {
  await fetch(`${COMFY}/free`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ unload_models: true, free_memory: true }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}

/** Naloži sliko v ComfyUI; vrne ime, kot ga pričakuje LoadImage. */
async function comfyNalozi(pot: string, podmapa: string): Promise<string> {
  const telo = new FormData();
  telo.append("image", new Blob([readFileSync(pot)]), basename(pot));
  telo.append("subfolder", podmapa);
  telo.append("overwrite", "true");
  const r = await fetch(`${COMFY}/upload/image`, { method: "POST", body: telo });
  if (!r.ok) throw new Error(`ComfyUI nalaganje ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { name: string; subfolder?: string };
  return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
}

type ComfySlika = { filename: string; subfolder: string; type: string };

/** Požene graf in počaka nanj. Vrne slike iz vseh izhodnih vozlišč. */
async function comfyPozeni(id: number, graf: Record<string, unknown>): Promise<ComfySlika[]> {
  const r = await fetch(`${COMFY}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: graf, client_id: `render-${id}` }),
  });
  const telo = await r.text();
  if (!r.ok) throw new Error(`ComfyUI zavrnil graf: ${telo.slice(0, 500)}`);
  const promptId = (JSON.parse(telo) as { prompt_id: string }).prompt_id;

  const zacetek = Date.now();
  let krog = 0;
  while (Date.now() - zacetek < COMFY_KORAK_MS) {
    await spanec(1_500);
    utrip(`naloga ${id}: ComfyUI racuna (${Math.round((Date.now() - zacetek) / 1000)} s)`);
    if (++krog % 7 === 0) {
      try {
        await preveriPreklic(id);
      } catch (e) {
        await fetch(`${COMFY}/interrupt`, { method: "POST" }).catch(() => {});
        throw e;
      }
    }
    const h = (await fetch(`${COMFY}/history/${promptId}`)
      .then((x) => x.json())
      .catch(() => ({}))) as Record<
      string,
      {
        status?: { status_str?: string; completed?: boolean; messages?: [string, Record<string, unknown>][] };
        outputs?: Record<string, { images?: ComfySlika[] }>;
      }
    >;
    const zapis = h[promptId];
    if (!zapis) continue;
    if (zapis.status?.status_str === "error") {
      const napaka = zapis.status.messages?.find((m) => m[0] === "execution_error")?.[1];
      throw new Error(
        `ComfyUI napaka: ${String(napaka?.exception_message ?? "neznana").slice(0, 400)} (vozlisce ${String(napaka?.node_type ?? "?")})`
      );
    }
    if (zapis.status?.completed || zapis.outputs) {
      return Object.values(zapis.outputs ?? {}).flatMap((o) => o.images ?? []);
    }
  }
  await fetch(`${COMFY}/interrupt`, { method: "POST" }).catch(() => {});
  throw new Error(`ComfyUI korak je presegel ${COMFY_KORAK_MS / 60_000} min`);
}

async function comfyPrenesi(slika: ComfySlika, cilj: string): Promise<void> {
  const q = new URLSearchParams({ filename: slika.filename, subfolder: slika.subfolder, type: slika.type });
  const r = await fetch(`${COMFY}/view?${q}`);
  if (!r.ok) throw new Error(`ComfyUI prenos ${r.status}`);
  writeFileSync(cilj, Buffer.from(await r.arrayBuffer()));
}

// --- Python orodja (OpenCV, ffmpeg) -----------------------------------------

/**
 * Požene orodja.py v ComfyUI-jevem vgrajenem Pythonu (isti numpy/torch, brez
 * drugega 5-GB okolja). Orodje sporoča napredek z vrsticami „NAPREDEK n“ in
 * izid z eno vrstico „IZID {json}“.
 */
function python(
  args: string[],
  napredek?: (p: number) => void,
  rokMs = 60 * 60_000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const p = spawn(PYTHON, ["-s", ORODJA_PY, ...args], {
      windowsHide: true,
      env: { ...process.env, ...OKOLJE_MODELOV, FFMPEG, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
    });
    let izid: Record<string, unknown> | null = null;
    let napake = "";
    let ostanek = "";
    const straza = setTimeout(() => p.kill(), rokMs);
    const utripalec = setInterval(() => utrip(`python ${args[0]}`), 20_000);
    p.stdout.on("data", (kos: Buffer) => {
      ostanek += kos.toString("utf8");
      const vrstice = ostanek.split(/\r?\n/);
      ostanek = vrstice.pop() ?? "";
      for (const v of vrstice) {
        if (v.startsWith("NAPREDEK ")) napredek?.(Number(v.slice(9)));
        else if (v.startsWith("IZID ")) izid = JSON.parse(v.slice(5)) as Record<string, unknown>;
        else if (v.trim()) log(`    py: ${v.slice(0, 300)}`);
      }
    });
    p.stderr.on("data", (kos: Buffer) => {
      napake = (napake + kos.toString("utf8")).slice(-3_000);
    });
    p.on("close", (koda) => {
      clearTimeout(straza);
      clearInterval(utripalec);
      if (koda === 0 && izid) resolve(izid);
      else reject(new Error(`orodja.py ${args[0]} (koda ${koda}): ${napake.trim().split(/\r?\n/).slice(-4).join(" | ")}`));
    });
  });
}

// --- vrste nalog -------------------------------------------------------------

type Datoteka = { pot: string; vrsta: "slika" | "video"; opis: string; ai?: string | null; glavna?: boolean };
type Izid = {
  status?: "koncano" | "rabi_tocke";
  datoteke: Datoteka[];
  primerjava?: { levo: string; desno: string; levoOznaka: string; desnoOznaka: string } | null;
  opombe?: string[];
  [kljuc: string]: unknown;
};

function mapaIzhoda(id: number): string {
  const m = join(MAPA, "izhod", String(id));
  mkdirSync(m, { recursive: true });
  return m;
}

function mapaDela(id: number): string {
  const m = join(MAPA, "delo", String(id));
  mkdirSync(m, { recursive: true });
  return m;
}

function vhodVloge(n: Naloga, vloga: string): Vhod {
  const v = n.vhod.find((x) => x.vloga === vloga) ?? (vloga === "slika" ? n.vhod[0] : undefined);
  if (!v) throw new Error(`manjka vhodna datoteka (${vloga})`);
  const pot = absolutno(v.pot);
  if (!existsSync(pot)) throw new Error(`vhodne datoteke ni na disku: ${v.pot}`);
  return { ...v, pot };
}

function zastavica(v: unknown, privzeto: boolean): boolean {
  return typeof v === "boolean" ? v : privzeto;
}

/**
 * Obnova stare fotografije: praske -> povečava -> (barvanje).
 *
 * Vsak korak je svoja datoteka, izvirnik ostane nedotaknjen. Obnove obrazov
 * (CodeFormer, GFPGAN) namenoma ni: ti modeli obraze narišejo na novo, kar pri
 * zgodovinski fotografiji ni obnova, ampak izmišljanje.
 */
async function obnova(n: Naloga, napredek: (od: number, do_: number) => (p: number, faza?: string) => void): Promise<Izid> {
  const vhod = vhodVloge(n, "slika");
  const izhod = mapaIzhoda(n.id);
  const praske = zastavica(n.parametri.praske, true);
  const povecava = zastavica(n.parametri.povecava, true);
  const barvanje = zastavica(n.parametri.barvanje, false);
  const opombe: string[] = [];
  const datoteke: Datoteka[] = [];

  let trenutna = vhod.pot;
  const info = (await python(["info", "--vhod", vhod.pot])) as { sirina: number; visina: number };

  if (praske) {
    napredek(0, 5)(0, "odstranjujem praske");
    const izid = (await python(
      ["praske", "--vhod", trenutna, "--izhod", join(izhod, "01-brez-prask.png"), "--maska", join(izhod, "01-maska-prask.png")],
      napredek(5, 25)
    )) as { delez: number; opomba?: string };
    trenutna = join(izhod, "01-brez-prask.png");
    datoteke.push({ pot: relativno(trenutna), vrsta: "slika", opis: "Brez prask in pik" });
    datoteke.push({
      pot: relativno(join(izhod, "01-maska-prask.png")),
      vrsta: "slika",
      opis: `Maska popravljenih mest (${(izid.delez * 100).toFixed(2)} % slike)`,
    });
    if (izid.opomba) opombe.push(izid.opomba);
  }
  await preveriPreklic(n.id);

  const dolgaStranica = Math.max(info.sirina, info.visina);
  if (povecava && dolgaStranica >= 3_000) {
    opombe.push(`Povečave ni bilo: slika ima že ${dolgaStranica} px po daljši stranici.`);
  } else if (povecava) {
    napredek(25, 30)(0, "povečujem (Real-ESRGAN)");
    await zagotoviComfy();
    // 4x iz modela, nato na največ 4096 px po daljši stranici — več od tega je
    // pri skenu razglednice samo večja datoteka, ne več podrobnosti.
    const faktor = Math.min(4, 4096 / dolgaStranica);
    const sirina = Math.round((info.sirina * faktor) / 8) * 8;
    const visina = Math.round((info.visina * faktor) / 8) * 8;
    const ime = await comfyNalozi(trenutna, `naloga-${n.id}`);
    const slike = await comfyPozeni(n.id, {
      "1": { class_type: "LoadImage", inputs: { image: ime } },
      "2": { class_type: "UpscaleModelLoader", inputs: { model_name: "RealESRGAN_x4plus.pth" } },
      "3": { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: ["2", 0], image: ["1", 0] } },
      "4": {
        class_type: "ImageScale",
        inputs: { image: ["3", 0], upscale_method: "lanczos", width: sirina, height: visina, crop: "disabled" },
      },
      "5": { class_type: "SaveImage", inputs: { images: ["4", 0], filename_prefix: `naloga-${n.id}/povecana` } },
    });
    if (!slike[0]) throw new Error("povečava ni vrnila slike");
    trenutna = join(izhod, "02-povecana.png");
    await comfyPrenesi(slike[0], trenutna);
    napredek(30, 60)(100, "povečano");
    datoteke.push({ pot: relativno(trenutna), vrsta: "slika", opis: `Povečana ${faktor.toFixed(1)}×`, ai: "povečano z AI" });
  }
  await preveriPreklic(n.id);

  if (barvanje) {
    napredek(60, 65)(0, "barvam (DDColor)");
    await zagotoviComfy();
    const ime = await comfyNalozi(trenutna, `naloga-${n.id}`);
    const slike = await comfyPozeni(n.id, {
      "1": { class_type: "LoadImage", inputs: { image: ime } },
      "2": {
        class_type: "DDColor_Colorize",
        inputs: { image: ["1", 0], model_input_size: 512, checkpoint: "ddcolor_modelscope.pth" },
      },
      "3": { class_type: "SaveImage", inputs: { images: ["2", 0], filename_prefix: `naloga-${n.id}/barvana` } },
    });
    if (!slike[0]) throw new Error("barvanje ni vrnilo slike");
    const surova = join(mapaDela(n.id), "barvana-surova.png");
    await comfyPrenesi(slike[0], surova);
    // Oznaka je vžgana v sliko: slika potuje brez strani, ki bi jo pojasnila.
    trenutna = join(izhod, "03-barvana.png");
    await python(["oznaka", "--vhod", surova, "--izhod", trenutna, "--besedilo", "Barvano z AI"]);
    napredek(65, 90)(100, "pobarvano");
    datoteke.push({ pot: relativno(trenutna), vrsta: "slika", opis: "Barvana", ai: "barvano z AI" });
  }

  napredek(90, 100)(0, "pripravljam za splet");
  const par = (await python([
    "par",
    "--a",
    vhod.pot,
    "--b",
    trenutna,
    "--izhod-a",
    join(izhod, "primerjava-pred.jpg"),
    "--izhod-b",
    join(izhod, "obnovljena.jpg"),
  ])) as { sirina: number; visina: number };
  datoteke.unshift({
    pot: relativno(join(izhod, "obnovljena.jpg")),
    vrsta: "slika",
    opis: `Obnovljena (${par.sirina} × ${par.visina})`,
    ai: barvanje ? "barvano z AI" : povecava && dolgaStranica < 3_000 ? "povečano z AI" : null,
    glavna: true,
  });
  return {
    datoteke,
    primerjava: {
      levo: relativno(join(izhod, "primerjava-pred.jpg")),
      desno: relativno(join(izhod, "obnovljena.jpg")),
      levoOznaka: "Izvirnik",
      desnoOznaka: "Obnovljena",
    },
    opombe,
  };
}

/**
 * Nekoč / danes: današnji posnetek istega kraja poravnamo na staro fotografijo.
 *
 * Poravnamo DANAŠNJO sliko na staro in ne obratno: stara fotografija je
 * zgodovinski dokument in je ne krivimo. Kadar samodejno ujemanje ne najde
 * zanesljive homografije (stavbe so se spremenile, drugačna leča), naloga
 * dobi status rabi_tocke in človek označi 4 pare točk.
 */
async function nekocDanes(n: Naloga, napredek: (od: number, do_: number) => (p: number, faza?: string) => void): Promise<Izid> {
  const staro = vhodVloge(n, "staro");
  const danes = vhodVloge(n, "danes");
  const izhod = mapaIzhoda(n.id);
  const args = ["poravnaj", "--staro", staro.pot, "--danes", danes.pot, "--izhod", izhod, "--delo", mapaDela(n.id)];
  const tocke = n.parametri.tocke as { staro?: number[][]; danes?: number[][] } | undefined;
  const kandidat = (n.rezultat as { kandidat?: string } | null)?.kandidat;
  if (tocke?.staro?.length === 4 && tocke.danes?.length === 4 && kandidat) {
    args.push("--tocke", JSON.stringify(tocke), "--kandidat", absolutno(kandidat));
  }
  napredek(0, 5)(0, "iščem najboljše ujemanje");
  const izid = (await python(args, napredek(5, 100))) as {
    status: "koncano" | "rabi_tocke";
    kandidat?: string;
    staro?: string;
    inlierji?: number;
    metoda?: string;
    pokritost?: number;
    opomba?: string;
  };
  const opombe: string[] = [];
  if (izid.opomba) opombe.push(izid.opomba);

  if (izid.status === "rabi_tocke") {
    return {
      status: "rabi_tocke",
      datoteke: [],
      kandidat: izid.kandidat ? relativno(izid.kandidat) : null,
      staro: izid.staro ? relativno(izid.staro) : null,
      inlierji: izid.inlierji ?? 0,
      opombe,
    };
  }

  const r = (p: string) => relativno(join(izhod, p));
  return {
    datoteke: [
      { pot: r("drsnik.jpg"), vrsta: "slika", opis: "Slika drsnika (pol nekoč, pol danes)", glavna: true },
      { pot: r("preliv.mp4"), vrsta: "video", opis: "Video s prelivom" },
      { pot: r("drsnik.mp4"), vrsta: "video", opis: "Video z drsnikom" },
      { pot: r("staro.jpg"), vrsta: "slika", opis: "Nekoč (izrez)" },
      { pot: r("danes.jpg"), vrsta: "slika", opis: "Danes (poravnano)" },
      { pot: r("ujemanje.jpg"), vrsta: "slika", opis: "Pregled ujemanja (za kontrolo)" },
    ],
    primerjava: { levo: r("staro.jpg"), desno: r("danes.jpg"), levoOznaka: "Nekoč", desnoOznaka: "Danes" },
    kandidat: izid.kandidat ? relativno(izid.kandidat) : null,
    meritevUjemanja: { metoda: izid.metoda, inlierji: izid.inlierji, pokritost: izid.pokritost },
    opombe,
  };
}

/**
 * 2,5D gibanje iz ene fotografije: globinska karta + počasen premik kamere.
 *
 * Depth Anything V2 SMALL namenoma: Small je pod licenco Apache-2.0, Base in
 * Large pa pod CC-BY-NC-4.0 (nekomercialno) — za stran agencije to ni čista
 * podlaga. Za nežno paralakso zadošča.
 */
async function paralaksa(n: Naloga, napredek: (od: number, do_: number) => (p: number, faza?: string) => void): Promise<Izid> {
  const vhod = vhodVloge(n, "slika");
  const izhod = mapaIzhoda(n.id);
  napredek(0, 5)(0, "računam globino (Depth Anything V2)");
  await zagotoviComfy();
  const ime = await comfyNalozi(vhod.pot, `naloga-${n.id}`);
  const slike = await comfyPozeni(n.id, {
    "1": { class_type: "LoadImage", inputs: { image: ime } },
    "2": {
      class_type: "DownloadAndLoadDepthAnythingV2Model",
      inputs: { model: "depth_anything_v2_vits_fp16.safetensors" },
    },
    "3": { class_type: "DepthAnything_V2", inputs: { da_model: ["2", 0], images: ["1", 0] } },
    "4": { class_type: "SaveImage", inputs: { images: ["3", 0], filename_prefix: `naloga-${n.id}/globina` } },
  });
  if (!slike[0]) throw new Error("globinska karta ni vrnila slike");
  const globina = join(izhod, "globina.png");
  await comfyPrenesi(slike[0], globina);
  // Model za globino ni več potreben; paralaksa je čisto OpenCV.
  await comfyFree();

  const sekund = Math.min(20, Math.max(3, Number(n.parametri.sekund ?? 6)));
  const gibanje = ["priblizaj", "levo-desno", "krog"].includes(String(n.parametri.gibanje))
    ? String(n.parametri.gibanje)
    : "priblizaj";
  const moc = Math.min(2, Math.max(0.3, Number(n.parametri.moc ?? 1)));
  napredek(30, 35)(0, "izrisujem gibanje");
  await python(
    [
      "paralaksa",
      "--slika",
      vhod.pot,
      "--globina",
      globina,
      "--izhod",
      join(izhod, "paralaksa.mp4"),
      "--sekund",
      String(sekund),
      "--gibanje",
      gibanje,
      "--moc",
      String(moc),
    ],
    napredek(35, 100)
  );
  return {
    datoteke: [
      { pot: relativno(join(izhod, "paralaksa.mp4")), vrsta: "video", opis: `2,5D gibanje (${sekund} s, ${gibanje})`, ai: "globina z AI", glavna: true },
      { pot: relativno(globina), vrsta: "slika", opis: "Globinska karta" },
    ],
    primerjava: null,
    opombe: [],
  };
}

// --- ena naloga --------------------------------------------------------------

async function obdelaj(n: Naloga): Promise<void> {
  const zacetek = Date.now();
  log(`Naloga ${n.id} (${n.vrsta}) ${n.naziv ?? ""} - zacenjam (poskus ${n.poskusi + 1}).`);
  const prevzeto = await posodobi(
    n.id,
    { status: "tece", zacetek: new Date().toISOString(), napredek: 0, faza: "pripravljam grafično", napaka: null, poskusi: n.poskusi + 1 },
    "&status=eq.caka"
  );
  if (prevzeto === 0) return;

  zapisiZastavico(n.id);
  let merilec: { ustavi: () => number | null } | null = null;
  try {
    await pocakajDaVidMiruje();
    const sprosceni = await sprostiOllamo();
    const obveza = await prostaObvezaGB();
    if (obveza !== null && obveza < NAJMANJ_OBVEZE_GB) {
      // Ne tvegamo padca drugih programov: naloga gre nazaj v vrsto.
      log(`  premalo obveze pomnilnika (${obveza.toFixed(1)} GB < ${NAJMANJ_OBVEZE_GB} GB) - naloga nazaj v vrsto cez 5 min.`);
      await posodobi(n.id, {
        status: "caka",
        poskusi: n.poskusi,
        faza: `čakam na pomnilnik (rezerva ${obveza.toFixed(1)} GB, rabim ${NAJMANJ_OBVEZE_GB} GB)`,
      });
      pobrisiZastavico();
      await spanec(5 * 60_000);
      return;
    }
    const vramPred = await vramMB();
    merilec = merilecVram();
    const napredek = (od: number, do_: number) => napredekZa(n.id, od, do_);

    const izid =
      n.vrsta === "obnova" ? await obnova(n, napredek) : n.vrsta === "nekoc_danes" ? await nekocDanes(n, napredek) : await paralaksa(n, napredek);

    const vramNajvec = merilec.ustavi();
    const sekund = Math.round((Date.now() - zacetek) / 1000);
    const status = izid.status ?? "koncano";
    delete izid.status;
    await posodobi(n.id, {
      status,
      napredek: status === "koncano" ? 100 : 0,
      faza: status === "rabi_tocke" ? "samodejna poravnava ni uspela - označi 4 pare točk" : null,
      konec: new Date().toISOString(),
      rezultat: {
        ...izid,
        meritve: { sekund, vramPredMB: vramPred, vramNajvecMB: vramNajvec, obvezaGB: obveza, sproscenaOllama: sprosceni },
      },
    });
    log(`Naloga ${n.id} ${status} v ${sekund} s (VRAM pred ${vramPred} MB, najvec ${vramNajvec} MB).`);
  } catch (e) {
    merilec?.ustavi();
    if (e instanceof Preklicano) {
      log(`Naloga ${n.id} preklicana.`);
      await posodobi(n.id, { konec: new Date().toISOString(), faza: null }).catch(() => {});
    } else {
      const sporocilo = e instanceof Error ? e.message : String(e);
      log(`Naloga ${n.id} NAPAKA: ${sporocilo}`);
      await posodobi(n.id, { status: "napaka", napaka: sporocilo.slice(0, 2_000), konec: new Date().toISOString(), faza: null }).catch(
        () => {}
      );
    }
  } finally {
    await comfyFree();
    pobrisiZastavico();
    zadnjeDelo = Date.now();
    try {
      rmSync(join(MAPA, "delo", String(n.id)), { recursive: true, force: true });
      rmSync(join(MAPA, "delo", "comfy-vhod", `naloga-${n.id}`), { recursive: true, force: true });
      rmSync(join(MAPA, "delo", "comfy-izhod", `naloga-${n.id}`), { recursive: true, force: true });
    } catch {
      // Pospravljanje ni razlog za padec.
    }
  }
}

// --- glavna zanka --------------------------------------------------------------

/** Naloge, ki jih je prekinil padec delavca, gredo nazaj v vrsto (največ 3-krat). */
async function obnoviPrekinjene(): Promise<void> {
  const prekinjene = await bazaGet<{ id: number; poskusi: number }[]>("render_naloge?select=id,poskusi&status=eq.tece");
  for (const p of prekinjene) {
    if (p.poskusi >= NAJVEC_POSKUSOV) {
      await posodobi(p.id, { status: "napaka", napaka: `prekinjena ${p.poskusi}-krat (padec delavca ali računalnika)`, faza: null });
    } else {
      await posodobi(p.id, { status: "caka", faza: "ponovno v vrsti po prekinitvi" });
    }
    log(`Prekinjena naloga ${p.id} (poskus ${p.poskusi}) ${p.poskusi >= NAJVEC_POSKUSOV ? "-> napaka" : "-> nazaj v vrsto"}.`);
  }
}

/**
 * Nedokončana nalaganja (.part), starejša od dneva, samo zasedajo disk.
 *
 * Samo starejša od dneva: nalaganje videa po 8-MB kosih prek mobilne
 * povezave traja lahko pol ure in ga ne smemo pobrisati sredi prenosa.
 */
function pospraviNalaganja(): void {
  const vhod = join(MAPA, "vhod");
  const meja = Date.now() - 24 * 3600_000;
  try {
    for (const paket of readdirSync(vhod)) {
      const mapa = join(vhod, paket);
      for (const ime of readdirSync(mapa)) {
        const pot = join(mapa, ime);
        if (ime.endsWith(".part") && statSync(pot).mtimeMs < meja) {
          unlinkSync(pot);
          log(`Pobrisano nedokoncano nalaganje: ${relativno(pot)}`);
        }
      }
    }
  } catch {
    // Nič hudega; naslednjič.
  }
}

async function main(): Promise<void> {
  if (!prevzemiZaklep()) {
    log("Render delavec ze tece (zaklep drzi ziv proces) - ta zagon se konca.");
    return;
  }
  if (!DB_KLJUC) {
    log("USTAVLJENO: manjka AVTONET_DB_KEY v .env.local");
    process.exit(1);
  }
  for (const m of ["vhod", "izhod", "delo"]) mkdirSync(join(MAPA, m), { recursive: true });
  // Zastavica prejšnjega procesa ne velja več; vid.ts bi jo sicer upošteval, dokler ne zastara.
  pobrisiZastavico();
  log(`Render delavec zagnan (PID ${process.pid}). Mapa: ${MAPA}, Python: ${existsSync(PYTHON) ? "ok" : "MANJKA"}, ffmpeg: ${existsSync(FFMPEG) ? "ok" : "MANJKA"}.`);
  await obnoviPrekinjene().catch((e) => log(`Obnova prekinjenih ni uspela: ${e instanceof Error ? e.message : e}`));

  let zadnjePospravljanje = 0;
  for (;;) {
    try {
      utrip("cakam na nalogo");
      const [n] = await bazaGet<Naloga[]>(
        "render_naloge?select=id,vrsta,status,naziv,vhod,parametri,rezultat,poskusi&status=eq.caka&order=id.asc&limit=1"
      );
      if (n) {
        await obdelaj(n);
        continue;
      }
      if (Date.now() - zadnjeDelo > COMFY_MIRUJE_MS && (comfyProces || (await comfyZiv()))) {
        log("ComfyUI miruje - ugasnem ga, da sprosti VRAM.");
        await ustaviComfy();
      }
      if (Date.now() - zadnjePospravljanje > 24 * 3600_000) {
        zadnjePospravljanje = Date.now();
        pospraviNalaganja();
      }
      await spanec(5_000);
    } catch (e) {
      log(`Napaka zanke: ${e instanceof Error ? e.message : String(e)} - nadaljujem cez 30 s.`);
      pobrisiZastavico();
      await spanec(30_000);
    }
  }
}

process.on("exit", () => pobrisiZastavico());

main().catch((e) => {
  log(`Usodna napaka: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  pobrisiZastavico();
  process.exit(1);
});
