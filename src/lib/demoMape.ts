/**
 * Luka's own folders on the "Spletne strani in aplikacije" screen.
 *
 * Kept in ui_state (one jsonb value per user) rather than in a table: the
 * folders are how one person sorts his work, and storing them there needed no
 * schema change. If the team ever needs shared folders, that is a table.
 *
 * Items are addressed by a key that survives both sources: built-in demos by
 * their slug (fixed in code), database rows by their id. A key whose item has
 * since disappeared is simply never shown — it is not an error.
 *
 * Built-in demos live in code, so their name and description cannot change
 * from the screen. What can is kept here, next to the folders: the client,
 * a note, and the preview status — the parts Luka fills in himself.
 */

import { DEMO_STATUSI, type DemoStatus } from "@/lib/demoStrani";

export const MAPE_KLJUC = "demo-strani-mape";

export type Mapa = { id: string; ime: string };

export type DodatekVgrajene = {
  stranka?: string;
  opombe?: string;
  status?: DemoStatus;
};

export type MapeStanje = {
  mape: Mapa[];
  /** item key -> folder id */
  razporeditev: Record<string, string>;
  /** built-in item key -> what Luka added himself */
  dodatki: Record<string, DodatekVgrajene>;
};

/** "vse" | "brez" | folder id */
export type IzbranaMapa = string;
export const VSE = "vse";
export const BREZ = "brez";

export const PRAZNO: MapeStanje = { mape: [], razporeditev: {}, dodatki: {} };

export const kljucVgrajene = (slug: string) => `koda:${slug}`;
export const kljucBaze = (id: string) => `baza:${id}`;

const MAX_IME = 60;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Whatever came back from ui_state, as a valid state. Anything malformed is
 * dropped rather than trusted: a broken save must not take the screen down,
 * and an assignment to a folder that no longer exists means "no folder".
 */
export function normaliziraj(value: unknown): MapeStanje {
  if (!isRecord(value)) return PRAZNO;

  const mape: Mapa[] = [];
  const videni = new Set<string>();
  if (Array.isArray(value.mape)) {
    for (const m of value.mape) {
      if (!isRecord(m)) continue;
      const id = typeof m.id === "string" ? m.id : "";
      const ime = typeof m.ime === "string" ? m.ime.trim().slice(0, MAX_IME) : "";
      if (!id || !ime || videni.has(id) || id === VSE || id === BREZ) continue;
      videni.add(id);
      mape.push({ id, ime });
    }
  }

  const razporeditev: Record<string, string> = {};
  if (isRecord(value.razporeditev)) {
    for (const [k, v] of Object.entries(value.razporeditev)) {
      if (typeof v === "string" && videni.has(v)) razporeditev[k] = v;
    }
  }

  const dodatki: Record<string, DodatekVgrajene> = {};
  if (isRecord(value.dodatki)) {
    for (const [k, v] of Object.entries(value.dodatki)) {
      if (!isRecord(v)) continue;
      const d: DodatekVgrajene = {};
      if (typeof v.stranka === "string" && v.stranka.trim()) d.stranka = v.stranka.trim().slice(0, 160);
      if (typeof v.opombe === "string" && v.opombe.trim()) d.opombe = v.opombe.trim().slice(0, 2000);
      if (typeof v.status === "string" && (DEMO_STATUSI as readonly string[]).includes(v.status)) {
        d.status = v.status as DemoStatus;
      }
      if (Object.keys(d).length > 0) dodatki[k] = d;
    }
  }

  return { mape, razporeditev, dodatki };
}

/** Null when the name can be used, otherwise why not. */
export function napakaImena(stanje: MapeStanje, ime: string, razenId?: string): string | null {
  const t = ime.trim();
  if (!t) return "Vpišite ime mape.";
  if (t.length > MAX_IME) return `Ime je predolgo (največ ${MAX_IME} znakov).`;
  const enako = stanje.mape.find((m) => m.id !== razenId && m.ime.toLowerCase() === t.toLowerCase());
  if (enako) return `Mapa „${enako.ime}“ že obstaja.`;
  return null;
}

export function dodajMapo(stanje: MapeStanje, ime: string, id: string): MapeStanje {
  return { ...stanje, mape: [...stanje.mape, { id, ime: ime.trim() }] };
}

export function preimenujMapo(stanje: MapeStanje, id: string, ime: string): MapeStanje {
  return { ...stanje, mape: stanje.mape.map((m) => (m.id === id ? { ...m, ime: ime.trim() } : m)) };
}

/** Removes the folder only; its items fall back to "Brez mape". */
export function izbrisiMapo(stanje: MapeStanje, id: string): MapeStanje {
  const razporeditev = Object.fromEntries(Object.entries(stanje.razporeditev).filter(([, v]) => v !== id));
  return { ...stanje, mape: stanje.mape.filter((m) => m.id !== id), razporeditev };
}

/** `mapaId` null or BREZ takes the item out of any folder. */
export function premakni(stanje: MapeStanje, kljuc: string, mapaId: string | null): MapeStanje {
  const razporeditev = { ...stanje.razporeditev };
  if (!mapaId || mapaId === BREZ || !stanje.mape.some((m) => m.id === mapaId)) delete razporeditev[kljuc];
  else razporeditev[kljuc] = mapaId;
  return { ...stanje, razporeditev };
}

export function nastaviDodatek(stanje: MapeStanje, kljuc: string, sprememba: DodatekVgrajene): MapeStanje {
  const novo: DodatekVgrajene = { ...stanje.dodatki[kljuc], ...sprememba };
  for (const k of Object.keys(novo) as (keyof DodatekVgrajene)[]) {
    if (novo[k] === undefined || novo[k] === "") delete novo[k];
  }
  const dodatki = { ...stanje.dodatki };
  if (Object.keys(novo).length === 0) delete dodatki[kljuc];
  else dodatki[kljuc] = novo;
  return { ...stanje, dodatki };
}

export function mapaOd(stanje: MapeStanje, kljuc: string): Mapa | null {
  const id = stanje.razporeditev[kljuc];
  return id ? (stanje.mape.find((m) => m.id === id) ?? null) : null;
}

/** Whether an item shows under the selected folder tab. */
export function vMapi(stanje: MapeStanje, kljuc: string, izbrana: IzbranaMapa): boolean {
  if (izbrana === VSE) return true;
  const mapa = mapaOd(stanje, kljuc);
  if (izbrana === BREZ) return mapa === null;
  return mapa?.id === izbrana;
}

/** Item counts per tab, over the keys that exist right now. */
export function stevilaPoMapah(stanje: MapeStanje, kljuci: readonly string[]): Map<string, number> {
  const n = new Map<string, number>([[VSE, kljuci.length], [BREZ, 0]]);
  for (const m of stanje.mape) n.set(m.id, 0);
  for (const k of kljuci) {
    const mapa = mapaOd(stanje, k);
    const id = mapa ? mapa.id : BREZ;
    n.set(id, (n.get(id) ?? 0) + 1);
  }
  return n;
}

/**
 * The preview status only ever moves forward on its own: opening the preview
 * marks "Za predogled", copying the message "Pri stranki". A demo already
 * approved or moved to its domain is never pulled back by a click.
 */
export function naprejDo(trenutni: DemoStatus | undefined, cilj: DemoStatus): DemoStatus | null {
  const red = DEMO_STATUSI.indexOf(trenutni ?? "v_izdelavi");
  const ciljRed = DEMO_STATUSI.indexOf(cilj);
  return ciljRed > red ? cilj : null;
}

/** The message Luka copies to the client. Plain, editable before copying. */
export function sporociloZaStranko(naziv: string, povezava: string): string {
  return [
    "Pozdravljeni,",
    "",
    `pripravili smo predogled: ${naziv}.`,
    "Ogledate si ga lahko na tej povezavi:",
    povezava,
    "",
    "Gre za delovno verzijo, zato bomo veseli vaših pripomb in želja za popravke.",
    "",
    "Lep pozdrav,",
    "Luka Komplet, KodaTim",
  ].join("\n");
}
