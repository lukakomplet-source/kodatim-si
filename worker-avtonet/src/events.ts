import type { Db } from "./db.js";

/**
 * The live log the research console reads.
 *
 * Two properties decide the shape of this file.
 *
 * First, it must never affect the sweep. A logging failure is not a collecting
 * failure, so nothing here throws and nothing here is awaited by the caller —
 * `zapisi()` returns void on purpose. A run must not die because a log write
 * timed out.
 *
 * Second, it must not double the request count. A full sweep emits one event
 * per advert, tens of thousands of them, so events are buffered and flushed in
 * batches rather than written one INSERT at a time. The flush interval is short
 * enough that a watching human sees the log move in near real time, which is
 * the entire point of the panel.
 */

export type Vrsta = "faza" | "stran" | "oglas" | "konec_strani" | "napaka" | "info";

type Dogodek = {
  raziskava_id: string | null;
  ob: string;
  vrsta: Vrsta;
  sporocilo: string;
  podatki: Record<string, unknown> | null;
};

const FLUSH_MS = Number(process.env.AVTONET_LOG_FLUSH_MS ?? 1500);
/** A buffer this size flushes immediately, so a fast burst cannot grow forever. */
const MAX_BUFFER = 40;

export type EventSink = {
  zapisi: (vrsta: Vrsta, sporocilo: string, podatki?: Record<string, unknown>) => void;
  /** Flushes what is left. Awaited once, at the end of a run. */
  zakljuci: () => Promise<void>;
};

/**
 * A sink bound to one research row. Pass `null` for runs with no row (the
 * scheduled mode) and the events are simply dropped — the console only ever
 * shows events belonging to a research.
 */
export function odpriDnevnik(db: Db, raziskavaId: string | null): EventSink {
  if (raziskavaId === null) {
    return { zapisi: () => {}, zakljuci: async () => {} };
  }

  let buffer: Dogodek[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> = Promise.resolve();

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    try {
      const { error } = await db.from("avtonet_dogodki").insert(batch);
      // Logged to stdout only: the platform's log is the fallback channel when
      // the database one is broken, and escalating further would be the tail
      // wagging the dog.
      if (error) console.error(`[dnevnik] zapis ni uspel: ${error.message}`);
    } catch (err) {
      console.error(`[dnevnik] zapis ni uspel: ${err instanceof Error ? err.message : err}`);
    }
  };

  const razporedi = (): void => {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      inFlight = inFlight.then(flush);
    }, FLUSH_MS);
    timer.unref?.();
  };

  return {
    zapisi(vrsta, sporocilo, podatki) {
      buffer.push({
        raziskava_id: raziskavaId,
        ob: new Date().toISOString(),
        vrsta,
        sporocilo,
        podatki: podatki ?? null,
      });
      if (buffer.length >= MAX_BUFFER) {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        inFlight = inFlight.then(flush);
      } else {
        razporedi();
      }
    },

    async zakljuci() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      inFlight = inFlight.then(flush);
      await inFlight;
    },
  };
}

/** "BMW 320d — 24.900 € — 2019 — 126.000 km", the console's advert line. */
export function opisOglasa(row: {
  naziv: string | null;
  cenaEur: number | null;
  letnik: number | null;
  km: number | null;
}): string {
  const deli = [
    (row.naziv ?? "neznano vozilo").slice(0, 60),
    row.cenaEur === null ? "cena ni navedena" : `${Math.round(row.cenaEur).toLocaleString("sl-SI")} €`,
    row.letnik === null ? "letnik ?" : String(row.letnik),
    row.km === null ? "km ?" : `${row.km.toLocaleString("sl-SI")} km`,
  ];
  return deli.join(" — ");
}
