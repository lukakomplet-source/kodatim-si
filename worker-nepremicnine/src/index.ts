import "dotenv/config";
import { createServer } from "node:http";
import { chromium, type Browser } from "playwright";
import { connect, oznaciIzginule, shraniOglase, type Db } from "./db.js";
import {
  OMEJITVE,
  PRICAKOVAN_RAZPON,
  VIR,
  normaliziraj,
  preberiSeznam,
  seznamUrl,
  vseRezine,
} from "./viri/nepremicnine-net.js";

/**
 * SBN Nepremičnine — zbiralnik. Namenoma svoj proces (vrata 8081): če se ta vir
 * sesuje, avtomobilski sistem tega ne sme čutiti, in obratno.
 *
 * En pregled = vse rezine (posel x regija x tip) po seznamih, s 6 s razmika med
 * stranmi — pri okoli tisoč straneh za Slovenijo je to okoli dve uri, enkrat
 * dnevno ob 4:00, ko je promet vira najnižji. Detajlov ne odpiramo (glej
 * adapter — kartica na seznamu nosi vse ključno, detajl pa varuje preverjanje).
 */

const PORT = Number(process.env.PORT ?? 8081);
const URNIK_URA = Number(process.env.NEP_URNIK_URA ?? 4);
const POLL_MS = 15_000;

let stopping = false;
let zadnjiPremik = Date.now();
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

function log(lvl: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ t: new Date().toISOString(), lvl, msg, ...extra }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Trda meja okoli vsakega klica brskalnika — lekcija iz avtonet workerja. */
async function zOmejitvijo<T>(kaj: string, delo: Promise<T>, ms = 60_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Klic "${kaj}" se ni odzval v ${ms / 1000} s`)), ms);
    delo.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function pregled(db: Db, pregledId: string): Promise<void> {
  const zacetek = new Date().toISOString();
  const p = { strani: 0, najdenih: 0, novih: 0, posodobljenih: 0, sprememb_cen: 0, napak: 0 };
  const objavi = async (dodatno: Record<string, unknown> = {}) => {
    await db.from("nep_pregledi").update({ ...p, ...dodatno }).eq("id", pregledId);
  };
  await db.from("nep_pregledi").update({ status: "tece", zacetek }).eq("id", pregledId);

  const browser: Browser = await zOmejitvijo(
    "chromium.launch",
    chromium.launch({ args: ["--no-sandbox"] }),
    90_000
  );
  const videni = new Set<string>();
  let popoln = true;

  /**
   * Ena stran seznama = en svež kontekst.
   *
   * Cloudflare pusti PRVO zahtevo konteksta skozi, vsako naslednjo pa pošlje na
   * preverjanje, ki ga headless brskalnik ne prestane (izmerjeno: stran 1 vedno
   * 200, stran 2 v istem kontekstu vedno izziv; v svežem kontekstu spet 200).
   * Svež kontekst stane ~200 ms, kar je ob 6 s razmika med stranmi nič.
   */
  const preberiStran = async (url: string) => {
    const ctx = await zOmejitvijo(
      "newContext",
      browser.newContext({
        locale: "sl-SI",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      })
    );
    try {
      const page = await zOmejitvijo("newPage", ctx.newPage());
      const r = await zOmejitvijo("goto", page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 }), 60_000);
      const status = r?.status() ?? 0;
      if (status === 403 || status === 429) throw new Error("HTTP " + status + " - vir blokira");
      await sleep(1500);
      return await zOmejitvijo("preberiSeznam", preberiSeznam(page));
    } finally {
      await zOmejitvijo("close", ctx.close(), 15_000).catch(() => {});
    }
  };

  try {
    for (const rezina of vseRezine()) {
      if (stopping) {
        popoln = false;
        break;
      }
      let stran = 1;
      let zadnja: number | null = null;
      let praznihZapored = 0;

      for (;;) {
        if (stopping) {
          popoln = false;
          break;
        }
        try {
          const { kartice, zadnjaStran } = await preberiStran(seznamUrl(rezina, stran));
          zadnja = zadnjaStran ?? zadnja;
          p.strani += 1;
          zadnjiPremik = Date.now();

          // "Prazna" je tudi stran brez ENE nove kartice: vir za stranmi čez
          // konec pogosto vrača vsebino prve strani, števec strani pa zna
          // pograbiti napačno številko (izmerjeno: "5/567" pri rezini s ~30
          // stranmi). Šteti nove namesto vseh ustavi oboje — brez tega bi ena
          // rezina vrtela prazne strani uro in več.
          const noveTuKaj = kartice.filter((k) => !videni.has(k.virId)).length;
          if (kartice.length === 0 || noveTuKaj === 0) {
            praznihZapored += 1;
            if (praznihZapored >= 2) break;
          } else {
            praznihZapored = 0;
            // Isti oglas se lahko pojavi v dveh rezinah (regija + "ne spreglejte");
            // v enem pregledu ga štejemo in pišemo enkrat.
            const nove = kartice.filter((k) => !videni.has(k.virId));
            for (const k of nove) videni.add(k.virId);
            p.najdenih += nove.length;
            if (nove.length > 0) {
              const izid = await shraniOglase(db, nove.map((k) => normaliziraj(k, rezina)));
              p.novih += izid.novih;
              p.posodobljenih += izid.posodobljenih;
              p.sprememb_cen += izid.spremembCen;
            }
          }

          await objavi({
            zadnja_rezina: `${rezina.posel}/${rezina.regija}/${rezina.tip} - stran ${stran}${zadnja ? `/${zadnja}` : ""}`,
          });
          if (zadnja !== null && stran >= zadnja) break;
          if (kartice.length === 0 && praznihZapored >= 2) break;
          stran += 1;
          await sleep(OMEJITVE.zamikMs);
        } catch (err) {
          p.napak += 1;
          popoln = false;
          const sporocilo = err instanceof Error ? err.message : String(err);
          await db.from("nep_napake").insert({ vir: VIR, url: seznamUrl(rezina, stran), tip: "seznam", sporocilo });
          log("warn", "napaka na strani", { rezina: `${rezina.regija}/${rezina.tip}`, stran, sporocilo });
          if (/vir blokira/.test(sporocilo)) throw err; // 403 ustavi cel pregled - vztrajanje bi ga poglobilo
          break; // druga napaka: preskoči rezino, nadaljuj s preostankom
        }
      }
    }

    // Izginotja samo po POPOLNEM pregledu: delen pregled ne ve, česa ni videl,
    // in bi žive oglase razglasil za izginule (lekcija 29.730 lažnih pri avtih).
    let izginulih = 0;
    if (popoln && videni.size >= PRICAKOVAN_RAZPON[0]) {
      izginulih = await oznaciIzginule(db, zacetek);
    } else if (videni.size < PRICAKOVAN_RAZPON[0]) {
      log("warn", "premalo najdenih - verjetno sprememba selektorjev", {
        najdenih: videni.size,
        pricakovano: PRICAKOVAN_RAZPON,
      });
      await db
        .from("nep_viri")
        .update({ zdravje: "degraded", opomba: `Najdenih ${videni.size}, pričakovano vsaj ${PRICAKOVAN_RAZPON[0]}` })
        .eq("vir", VIR);
    }

    await objavi({ status: "koncano", konec: new Date().toISOString(), izginulih });
    await db
      .from("nep_viri")
      .update({
        zdravje: videni.size >= PRICAKOVAN_RAZPON[0] ? "healthy" : "degraded",
        zadnji_pregled: new Date().toISOString(),
        zadnjic_najdenih: videni.size,
      })
      .eq("vir", VIR);
    log("info", "pregled koncan", { ...p, unikatnih: videni.size, popoln });
  } catch (err) {
    await objavi({
      status: "napaka",
      konec: new Date().toISOString(),
      zadnja_napaka: err instanceof Error ? err.message : String(err),
    });
    log("error", "pregled padel", { napaka: err instanceof Error ? err.message : String(err) });
  } finally {
    await browser.close().catch(() => {});
  }
}

function naslednjiTermin(ura: number): Date {
  const d = new Date();
  d.setHours(ura, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const db = connect();

  const server = once
    ? null
    : createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, heartbeatAgeMs: Date.now() - zadnjiPremik }));
      });
  server?.listen(PORT, () => log("info", `health na portu ${PORT}`));
  server?.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE") {
      console.error("Zbiralnik nepremičnin že teče (vrata zasedena).");
      process.exit(3);
    }
  });

  log("info", "nepremicnine zbiralnik zagnan", { urnikOb: URNIK_URA });

  if (once) {
    const { data } = await db.from("nep_pregledi").insert({ status: "zahtevano" }).select("id").maybeSingle();
    if (data) await pregled(db, data.id as string);
    return;
  }

  let naslednji = naslednjiTermin(URNIK_URA);
  log("info", "naslednji termin", { ob: naslednji.toISOString() });

  while (!stopping) {
    zadnjiPremik = Date.now();
    if (Date.now() >= naslednji.getTime()) {
      await db.from("nep_pregledi").insert({ status: "zahtevano" });
      naslednji = naslednjiTermin(URNIK_URA);
    }
    // Prevzame čakajočo zahtevo — urnikovo ali ročno iz konzole.
    const { data } = await db
      .from("nep_pregledi")
      .select("id")
      .eq("status", "zahtevano")
      .order("zahtevano_ob")
      .limit(1);
    const naloga = (data ?? [])[0];
    if (naloga) await pregled(db, naloga.id as string);
    await sleep(POLL_MS);
  }
  server?.close();
}

main().catch((err) => {
  console.error("USODNA NAPAKA:", err instanceof Error ? err.message : err);
  process.exit(1);
});
