import type { Db } from "./db.js";

/**
 * Self-healing guard for the detail pass.
 *
 * The failure this exists for, observed live on 16.08: avto.net stopped
 * returning advert pages and started answering 200 with EMPTY content — a soft
 * block. A 403 already had backoff; an empty page did not, so it fell into the
 * generic catch and the pool kept firing at full speed. Result: 1,697 errors
 * and 22 successes in one hour, the queue never moving, and the hammering very
 * likely deepening the block (the previous night it ended in a hard 403).
 *
 * The rule this encodes: **a source that stops answering is telling us to stop
 * asking.** So the guard watches the recent success rate and, when it collapses,
 * withdraws for a while — longer each time — and gives up on this round
 * entirely rather than grinding. When things go well it quietly speeds back up.
 * Nothing is lost by withdrawing: unprocessed adverts stay queued for the next
 * scheduled round, which is the same mechanism a crash already relies on.
 */

export type Izid = "uspeh" | "prazna" | "blokada" | "druga";

/** How many recent attempts the health judgement looks at. */
const OKNO = 20;
/** Failure share within the window that counts as "the source stopped talking". */
const PRAG_NAPAK = 0.6;
/** Cool-down ladder; after the last one the round gives up and waits for the next schedule. */
const HLAJENJA_MS = [15 * 60_000, 30 * 60_000, 60 * 60_000];
/** Requests judged right after a cool-down before trusting recovery. */
const SONDA = 5;

export type StanjeZascite = {
  delayMs: number;
  hlajenj: number;
  pavzaDo: number;
  vOknu: number;
  napakVOknu: number;
  ustavi: boolean;
  razlog: string | null;
};

export function ustvariZascito(osnovniDelayMs: number, log: (l: "info" | "warn" | "error", m: string, e?: Record<string, unknown>) => void) {
  const okno: boolean[] = []; // true = napaka
  let delayMs = osnovniDelayMs;
  let hlajenj = 0;
  let pavzaDo = 0;
  let zaporednihUspehov = 0;
  let sondaOstalo = 0;
  let sondaNapak = 0;
  let ustavi = false;
  let razlog: string | null = null;

  const delezNapak = (): number =>
    okno.length === 0 ? 0 : okno.filter(Boolean).length / okno.length;

  return {
    /** Milliseconds the caller must wait before the next request. */
    cakanje(): number {
      return Math.max(delayMs, pavzaDo - Date.now());
    },

    ustaviSe(): boolean {
      return ustavi;
    },

    razlogUstavitve(): string | null {
      return razlog;
    },

    /**
     * Records one outcome and decides what happens next.
     * Returns "naprej" to continue, "ustavi" to end the detail pass.
     */
    zabelezi(izid: Izid): "naprej" | "ustavi" {
      const napaka = izid !== "uspeh";
      okno.push(napaka);
      if (okno.length > OKNO) okno.shift();

      // Probe window right after a cool-down: judge recovery on a few requests.
      if (sondaOstalo > 0) {
        sondaOstalo -= 1;
        if (napaka) sondaNapak += 1;
        if (sondaOstalo === 0) {
          if (sondaNapak >= SONDA - 1) {
            // Still blocked — escalate immediately, do not burn the whole window.
            return this.vHlajenje("vir se vedno ne odgovarja po hlajenju");
          }
          okno.length = 0; // recovered: judge fresh from here
          log("info", "zascita: vir spet odgovarja", { delayMs });
        }
        return ustavi ? "ustavi" : "naprej";
      }

      if (napaka) {
        zaporednihUspehov = 0;
        // Each failure widens the spacing a little, whatever its kind.
        delayMs = Math.min(30_000, Math.round(delayMs * 1.3));
        if (izid === "blokada") return this.vHlajenje("vir je vrnil blokado (403/429)");
        if (okno.length >= OKNO && delezNapak() >= PRAG_NAPAK) {
          return this.vHlajenje(
            `${Math.round(delezNapak() * 100)} % zahtevkov ne vrne oglasa (mehka blokada)`
          );
        }
        return "naprej";
      }

      zaporednihUspehov += 1;
      // Sustained success earns the speed back, gently and never below base.
      if (zaporednihUspehov >= 50 && delayMs > osnovniDelayMs) {
        delayMs = Math.max(osnovniDelayMs, Math.round(delayMs * 0.8));
        zaporednihUspehov = 0;
        log("info", "zascita: pospesujem nazaj", { delayMs });
      }
      return "naprej";
    },

    /** Withdraw for a while; past the last rung, end the round. */
    vHlajenje(zakaj: string): "naprej" | "ustavi" {
      if (hlajenj >= HLAJENJA_MS.length) {
        ustavi = true;
        razlog = `${zakaj} — po ${hlajenj} hlajenjih odneham za ta krog; neobdelani oglasi ostanejo v vrsti`;
        log("warn", "zascita: odneham za ta krog", { hlajenj, zakaj });
        return "ustavi";
      }
      const trajanje = HLAJENJA_MS[hlajenj];
      hlajenj += 1;
      pavzaDo = Date.now() + trajanje;
      delayMs = Math.min(30_000, Math.max(delayMs, osnovniDelayMs * 2));
      okno.length = 0;
      sondaOstalo = SONDA;
      sondaNapak = 0;
      razlog = `${zakaj} — hlajenje ${hlajenj}, nadaljujem čez ${Math.round(trajanje / 60_000)} min`;
      log("warn", "zascita: hlajenje", { hlajenj, minut: Math.round(trajanje / 60_000), zakaj });
      return "naprej";
    },

    stanje(): StanjeZascite {
      return {
        delayMs,
        hlajenj,
        pavzaDo,
        vOknu: okno.length,
        napakVOknu: okno.filter(Boolean).length,
        ustavi,
        razlog,
      };
    },
  };
}

/** Publishes the guard's state so the console can show what the collector is doing. */
export async function objaviStanje(db: Db, s: StanjeStanje): Promise<void> {
  try {
    await db.from("avtonet_statistika").upsert({
      kljuc: "zbiralnik",
      podatki: s,
      izracunano: new Date().toISOString(),
    });
  } catch {
    // Visibility must never break collection.
  }
}

export type StanjeStanje = StanjeZascite & {
  faza: string;
  ob: string;
  /**
   * When phase 2 started. The console's "how much longer" was dividing details
   * done by the WHOLE run's elapsed time — including the hours of phase 1, when
   * no detail is fetched at all — and so announced 26 h for an hour of work.
   */
  faza2Od?: string;
};
