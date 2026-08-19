import "dotenv/config";
import { createServer } from "node:http";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { connect, oznaciIzginule, shraniOglase, type Db } from "./db.js";
import { VIRI, najdiVir } from "./viri/index.js";
import type { VirAdapter } from "./viri/vmesnik.js";
import { geokodirajOglase, naloziKraje, poveziNepremicnine } from "./nepremicnine.js";
import { izracunajPosle } from "./posli.js";
import { preveriIskanja } from "./iskanja.js";

/**
 * SBN Nepremičnine — zbiralnik. Namenoma svoj proces (vrata 8081): če se ta
 * modul sesuje, avtomobilski sistem tega ne sme čutiti, in obratno.
 *
 * Viri se obdelujejo ZAPOREDNO (nikoli dva hkrati): ob urniku se sestavi
 * čakalnica vseh vklopljenih virov (nep_viri.omogocen), vsak vir dobi svoj
 * pregled. En pokvarjen vir ne ustavi drugih. Po vsakem pregledu teče
 * "knjigovodstvo": geokodiranje, kanonične nepremičnine, deal feed, iskanja —
 * vsak korak zavarovan, ker knjigovodstvo ne sme podreti zbiranja.
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

async function pregled(db: Db, pregledId: string, vir: VirAdapter): Promise<void> {
  const zacetek = new Date().toISOString();
  const p = { strani: 0, najdenih: 0, novih: 0, posodobljenih: 0, sprememb_cen: 0, napak: 0 };
  const objavi = async (dodatno: Record<string, unknown> = {}) => {
    await db.from("nep_pregledi").update({ ...p, ...dodatno }).eq("id", pregledId);
  };
  await db.from("nep_pregledi").update({ status: "tece", zacetek, vir: vir.vir }).eq("id", pregledId);
  log("info", "pregled zacet", { vir: vir.vir });

  // Brskalnik se zažene ZNOTRAJ try: če launch pade, mora pregled končati kot
  // "napaka", ne proces kot truplo z večno "tece" vrstico.
  let browser: Browser | null = null;
  const videni = new Set<string>();
  let popoln = true;

  /**
   * Ena stran seznama. Pri virih s svezKontekstNaStran (Cloudflare pusti PRVO
   * zahtevo konteksta skozi, vsako naslednjo pošlje na izziv — izmerjeno na
   * nepremicnine.net) se za vsako stran ustvari svež kontekst (~200 ms, ob 6 s
   * razmika med stranmi nič); ostali viri obdržijo en kontekst.
   */
  const skupni: { ctx: BrowserContext | null } = { ctx: null };
  const novKontekst = () =>
    zOmejitvijo(
      "newContext",
      browser!.newContext({
        locale: "sl-SI",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      })
    );
  const preberiStran = async (url: string) => {
    const ctx = vir.svezKontekstNaStran ? await novKontekst() : (skupni.ctx ??= await novKontekst());
    try {
      const page = await zOmejitvijo("newPage", ctx.newPage());
      try {
        const r = await zOmejitvijo("goto", page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 }), 60_000);
        const status = r?.status() ?? 0;
        if (status === 403 || status === 429) throw new Error("HTTP " + status + " - vir blokira");
        await sleep(1500);
        return await zOmejitvijo("preberiSeznam", vir.preberiSeznam(page));
      } finally {
        if (!vir.svezKontekstNaStran) await zOmejitvijo("closePage", page.close(), 15_000).catch(() => {});
      }
    } finally {
      if (vir.svezKontekstNaStran) await zOmejitvijo("close", ctx.close(), 15_000).catch(() => {});
    }
  };

  /**
   * ROTACIJA REZIN. Vir zna po ~pol ure branja začeti zavračati (izmerjeno na
   * bolha.com: blokada po 60 straneh). Če bi vsak pregled začel pri prvi
   * kategoriji, bi zadnje nikoli ne prišle na vrsto. Zato si zapomnimo, kje se
   * je pregled ustavil, in naslednjič začnemo tam — v nekaj dneh je pokrit ves
   * katalog, brez hitrejšega branja.
   */
  const vseRezine = vir.rezine();
  const { data: stanjeRezin } = await db.from("nep_statistika").select("podatki").eq("kljuc", `rezine:${vir.vir}`).maybeSingle();
  const zacetniIndeks = Number((stanjeRezin?.podatki as { naslednja?: number } | null)?.naslednja ?? 0) % vseRezine.length;
  const rezineVrstniRed = [...vseRezine.slice(zacetniIndeks), ...vseRezine.slice(0, zacetniIndeks)];
  let obdelanihRezin = 0;
  const shraniNaslednjo = async () => {
    await db.from("nep_statistika").upsert({
      kljuc: `rezine:${vir.vir}`,
      podatki: { naslednja: (zacetniIndeks + obdelanihRezin) % vseRezine.length, zadnjic: new Date().toISOString() },
      izracunano: new Date().toISOString(),
    });
  };

  try {
    browser = await zOmejitvijo("chromium.launch", chromium.launch({ args: ["--no-sandbox"] }), 90_000);
    if (zacetniIndeks > 0) log("info", "nadaljujem pri rezini", { vir: vir.vir, indeks: zacetniIndeks, oznaka: rezineVrstniRed[0]?.oznaka });
    for (const rezina of rezineVrstniRed) {
      if (stopping) {
        popoln = false;
        break;
      }
      let stran = 1;
      let zadnja: number | null = null;
      let praznihZapored = 0;
      let praznaPrvaPoskusov = 0;

      for (;;) {
        if (stopping) {
          popoln = false;
          break;
        }
        try {
          const { kartice, zadnjaStran } = await preberiStran(vir.seznamUrl(rezina, stran));

          /**
           * PRVA stran kategorije ni nikoli prazna. Če je, vir tiho zavrača
           * (mehka blokada) ali so se spremenili selektorji — oboje je treba
           * povedati, ne pa prebrati kot "konec kategorije". Izmerjeno na
           * bolha.com: po ~25 hitrih straneh začne vračati strani brez kartic,
           * svež brskalnik pa isti naslov ta hip postreže normalno. Zato en
           * daljši premor in ponovni poskus, sicer pregled ustavimo.
           */
          if (stran === 1 && kartice.length === 0) {
            praznaPrvaPoskusov += 1;
            if (praznaPrvaPoskusov <= 1) {
              log("warn", "prazna prva stran - premor 60 s in ponovni poskus", { vir: vir.vir, rezina: rezina.oznaka });
              await sleep(60_000);
              continue;
            }
            throw new Error("vir blokira (prazna prva stran tudi po premoru)");
          }

          zadnja = zadnjaStran ?? zadnja;
          p.strani += 1;
          zadnjiPremik = Date.now();

          // "Prazna" je tudi stran brez ENE nove kartice: vir za stranmi čez
          // konec pogosto vrača vsebino prve strani, števec strani pa zna
          // pograbiti napačno številko (izmerjeno: "5/567" pri rezini s ~30
          // stranmi). Šteti nove namesto vseh ustavi oboje.
          const noveTuKaj = kartice.filter((k) => !videni.has(k.virId)).length;
          if (kartice.length === 0 || noveTuKaj === 0) {
            praznihZapored += 1;
            if (praznihZapored >= 2) break;
          } else {
            praznihZapored = 0;
            const nove = kartice.filter((k) => !videni.has(k.virId));
            for (const k of nove) videni.add(k.virId);
            p.najdenih += nove.length;
            if (nove.length > 0) {
              const izid = await shraniOglase(db, nove.map((k) => vir.normaliziraj(k, rezina)));
              p.novih += izid.novih;
              p.posodobljenih += izid.posodobljenih;
              p.sprememb_cen += izid.spremembCen;
            }
          }

          await objavi({
            zadnja_rezina: `${vir.vir}: ${rezina.oznaka} - stran ${stran}${zadnja ? `/${zadnja}` : ""}`,
          });
          if (zadnja !== null && stran >= zadnja) break;
          if (kartice.length === 0 && praznihZapored >= 2) break;
          stran += 1;
          await sleep(vir.omejitve.zamikMs);
        } catch (err) {
          p.napak += 1;
          popoln = false;
          const sporocilo = err instanceof Error ? err.message : String(err);
          await db.from("nep_napake").insert({ vir: vir.vir, url: vir.seznamUrl(rezina, stran), tip: "seznam", sporocilo });
          log("warn", "napaka na strani", { vir: vir.vir, rezina: rezina.oznaka, stran, sporocilo });
          if (/vir blokira/.test(sporocilo)) throw err; // 403 ustavi cel pregled - vztrajanje bi ga poglobilo
          break; // druga napaka: preskoči rezino, nadaljuj s preostankom
        }
      }
      // Rezina je za nami (dokončana ali preskočena zaradi napake): naslednji
      // pregled naj začne za njo.
      obdelanihRezin += 1;
      await shraniNaslednjo();
    }

    // Izginotja samo po POPOLNEM pregledu TEGA vira: delen pregled ne ve, česa
    // ni videl, in bi žive oglase razglasil za izginule. Pregled, ki se je
    // začel sredi kroga (rotacija rezin), po definiciji ni popoln.
    let izginulih = 0;
    if (zacetniIndeks !== 0 || obdelanihRezin < vseRezine.length) popoln = false;
    if (popoln && videni.size >= vir.pricakovanRazpon[0]) {
      izginulih = await oznaciIzginule(db, zacetek, vir.vir);
    } else if (videni.size < vir.pricakovanRazpon[0]) {
      log("warn", "premalo najdenih - verjetno sprememba selektorjev", {
        vir: vir.vir,
        najdenih: videni.size,
        pricakovano: vir.pricakovanRazpon,
      });
      await db
        .from("nep_viri")
        .update({ zdravje: "degraded", opomba: `Najdenih ${videni.size}, pričakovano vsaj ${vir.pricakovanRazpon[0]}` })
        .eq("vir", vir.vir);
    }

    await objavi({ status: "koncano", konec: new Date().toISOString(), izginulih });
    await db
      .from("nep_viri")
      .update({
        zdravje: videni.size >= vir.pricakovanRazpon[0] ? "healthy" : "degraded",
        zadnji_pregled: new Date().toISOString(),
        zadnjic_najdenih: videni.size,
      })
      .eq("vir", vir.vir);
    log("info", "pregled koncan", { vir: vir.vir, ...p, unikatnih: videni.size, popoln });
  } catch (err) {
    await objavi({
      status: "napaka",
      konec: new Date().toISOString(),
      zadnja_napaka: err instanceof Error ? err.message : String(err),
    });
    log("error", "pregled padel", { vir: vir.vir, napaka: err instanceof Error ? err.message : String(err) });
  } finally {
    if (skupni.ctx) await skupni.ctx.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Knjigovodstvo po pregledu: vsak korak zavarovan — napaka enega ne sme
 * ustaviti niti drugih korakov niti zbiranja.
 */
async function knjigovodstvo(db: Db): Promise<void> {
  const l = (m: string) => log("info", "[knjigovodstvo] " + m);
  try {
    const kraji = await naloziKraje(db);
    const g = await geokodirajOglase(db, kraji);
    if (g > 0) l(`geokodiranih ${g} oglasov`);
  } catch (e) {
    log("warn", "geokodiranje padlo", { napaka: e instanceof Error ? e.message : String(e) });
  }
  try {
    const p = await poveziNepremicnine(db, l);
    l(`nepremičnine: +${p.novihNepremicnin} novih, ${p.povezav} povezav, ${p.kandidatov} kandidatov`);
  } catch (e) {
    log("warn", "povezovanje padlo", { napaka: e instanceof Error ? e.message : String(e) });
  }
  try {
    await izracunajPosle(db, l);
  } catch (e) {
    log("warn", "posli padli", { napaka: e instanceof Error ? e.message : String(e) });
  }
  try {
    await preveriIskanja(db, l);
  } catch (e) {
    log("warn", "iskanja padla", { napaka: e instanceof Error ? e.message : String(e) });
  }
}

/** Vsak adapter iz registra dobi vrstico v nep_viri; novi so IZKLOPLJENI. */
async function zagotoviViri(db: Db): Promise<void> {
  const { data } = await db.from("nep_viri").select("vir");
  const obstojeci = new Set((data ?? []).map((v) => v.vir as string));
  for (const v of VIRI) {
    if (obstojeci.has(v.vir)) continue;
    await db.from("nep_viri").insert({ vir: v.vir, omogocen: false, pricakovano_min: v.pricakovanRazpon[0], pricakovano_max: v.pricakovanRazpon[1] });
    log("info", "nov vir vpisan (izklopljen)", { vir: v.vir });
  }
}

async function vklopljeniViri(db: Db): Promise<string[]> {
  const { data } = await db.from("nep_viri").select("vir, omogocen").eq("omogocen", true);
  const vBazi = new Set((data ?? []).map((v) => v.vir as string));
  return VIRI.filter((v) => vBazi.has(v.vir)).map((v) => v.vir);
}

function naslednjiTermin(ura: number): Date {
  const d = new Date();
  d.setHours(ura, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const virArg = process.argv.find((a) => a.startsWith("--vir="))?.slice(6) ?? null;
  /**
   * Prevzem ŽE OBSTOJEČE vrstice pregleda (--prevzemi=<id>). Namenjeno
   * dohitevanju iz druge seje: vrstica se v bazo vpiše s statusom "tece", zato
   * je demon nikoli ne prevzame — ista naloga tako ne more teči dvakrat in
   * vira ne obremenimo podvojeno.
   */
  const prevzemiId = process.argv.find((a) => a.startsWith("--prevzemi="))?.slice(11) ?? null;
  const db = connect();
  await zagotoviViri(db);

  if (prevzemiId) {
    const { data } = await db.from("nep_pregledi").select("id, vir, status").eq("id", prevzemiId).maybeSingle();
    if (!data) {
      console.error(`Pregleda ${prevzemiId} ni.`);
      process.exit(2);
    }
    log("info", "prevzemam obstojeci pregled", { id: prevzemiId, vir: data.vir, status: data.status });
    await pregled(db, prevzemiId, najdiVir((data.vir as string | null) ?? virArg));
    await knjigovodstvo(db);
    return;
  }

  const server = once
    ? null
    : createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, heartbeatAgeMs: Date.now() - zadnjiPremik }));
      });
  if (server) {
    await new Promise<void>((resolve) => {
      server.on("error", (e: NodeJS.ErrnoException) => {
        if (e.code === "EADDRINUSE") {
          console.error("Zbiralnik nepremičnin že teče (vrata zasedena).");
          process.exit(3);
        }
      });
      server.listen(PORT, () => {
        log("info", `health na portu ${PORT}`);
        resolve();
      });
    });
    // Vrata so naša => noben drug zbiralnik ne teče => vsak 'tece' zapis je
    // osirotel ostanek mrtvega procesa (izpad elektrike, sesutje). Brez te
    // obnove bi unique indeks za vedno blokiral vse nadaljnje preglede,
    // heartbeat pa bi mirno kazal "živ".
    const { data: osiroteli } = await db
      .from("nep_pregledi")
      .update({ status: "napaka", konec: new Date().toISOString(), zadnja_napaka: "prekinjen — ponovni zagon zbiralnika" })
      .eq("status", "tece")
      .select("id");
    if ((osiroteli ?? []).length > 0) {
      log("warn", "osiroteli pregledi označeni kot napaka", { st: (osiroteli ?? []).length });
    }
  }

  log("info", "nepremicnine zbiralnik zagnan", { urnikOb: URNIK_URA, viri: VIRI.map((v) => v.vir) });

  if (once) {
    const vir = najdiVir(virArg);
    const { data } = await db.from("nep_pregledi").insert({ status: "zahtevano", vir: vir.vir }).select("id").maybeSingle();
    if (data) await pregled(db, data.id as string, vir);
    await knjigovodstvo(db);
    return;
  }

  let naslednji = naslednjiTermin(URNIK_URA);
  log("info", "naslednji termin", { ob: naslednji.toISOString() });
  let cakalnica: string[] = [];

  while (!stopping) {
    zadnjiPremik = Date.now();
    if (Date.now() >= naslednji.getTime()) {
      cakalnica = await vklopljeniViri(db);
      log("info", "urnik: cakalnica virov", { cakalnica });
      naslednji = naslednjiTermin(URNIK_URA);
    }

    // En aktiven pregled naenkrat (unique indeks to tudi trdo zagotavlja):
    // nova zahteva se vpiše šele, ko ni ne čakajoče ne tekoče.
    const { data: aktivni } = await db
      .from("nep_pregledi")
      .select("id, vir, status")
      .in("status", ["zahtevano", "tece"])
      .limit(1);
    const aktiven = (aktivni ?? [])[0];

    if (!aktiven && cakalnica.length > 0) {
      const vir = cakalnica[0];
      const { error } = await db.from("nep_pregledi").insert({ status: "zahtevano", vir });
      if (!error) cakalnica.shift();
    }

    // Prevzame čakajočo zahtevo — urnikovo ali ročno iz konzole.
    const { data } = await db
      .from("nep_pregledi")
      .select("id, vir")
      .eq("status", "zahtevano")
      .order("zahtevano_ob")
      .limit(1);
    const naloga = (data ?? [])[0];
    if (naloga) {
      await pregled(db, naloga.id as string, najdiVir((naloga.vir as string | null) ?? null));
      await knjigovodstvo(db);
    }
    await sleep(POLL_MS);
  }
  server?.close();
}

main().catch((err) => {
  console.error("USODNA NAPAKA:", err instanceof Error ? err.message : err);
  process.exit(1);
});
