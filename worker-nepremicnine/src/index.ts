import "dotenv/config";
import { createServer } from "node:http";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { connect, oznaciIzginule, shraniOglase, type Db } from "./db.js";
import { VIRI, najdiVir } from "./viri/index.js";
import type { VirAdapter } from "./viri/vmesnik.js";
import { geokodirajOglase, naloziKraje, poveziNepremicnine } from "./nepremicnine.js";
import { izracunajPosle } from "./posli.js";
import { preveriIskanja } from "./iskanja.js";
import { zajemiDetajle } from "./detajli.js";
import { preveriIzziv } from "./izziv.js";
import {
  hlajenjeDo,
  oceniZakljucek,
  sprostiZataknjenoVrsto,
  zabelezBlokado,
  zabelezi,
  zapriOsirotele,
  type IzidPregleda,
} from "./samopopravilo.js";

/**
 * SBN Nepremičnine — zbiralnik. Namenoma svoj proces (vrata 8081): če se ta
 * modul sesuje, avtomobilski sistem tega ne sme čutiti, in obratno.
 *
 * Viri se obdelujejo ZAPOREDNO (nikoli dva hkrati): ob uri iz urnika se sestavi
 * čakalnica vseh vklopljenih virov (nep_viri.omogocen), vsak vir dobi svoj
 * pregled. En pokvarjen vir ne ustavi drugih.
 *
 * Vsak pregled ima dve fazi:
 *   1. seznami   — kartice s kategorijskih strani (cena, kraj, m², opis)
 *   2. detajli   — stran posameznega oglasa (sobe, energetska izkaznica,
 *                  ogrevanje, oprema, cela galerija); kvotirana, da se baza
 *                  polni v dneh in vir nikoli ne pritisne na zavoro
 *
 * Po pregledu teče "knjigovodstvo": geokodiranje, kanonične nepremičnine, deal
 * feed, iskanja — vsak korak zavarovan, ker knjigovodstvo ne sme podreti
 * zbiranja.
 *
 * ZAKLJUČEK PREGLEDA nikoli ne ostane odprt. Delni pregled je "koncano_delno",
 * ne "napaka"; pregled, ki ga proces ni več sposoben obdelovati, se zapre sam
 * (samopopravilo.ts); zataknjen proces se konča in ga nadzornik zažene znova.
 */

const PORT = Number(process.env.PORT ?? 8081);
const POLL_MS = 15_000;
/** Brez enega samega premika toliko časa je proces zataknjen, ne priden. */
const ZATAKNJEN_MS = Number(process.env.NEP_ZATAKNJEN_MIN ?? 25) * 60_000;

let stopping = false;
let zadnjiPremik = Date.now();
let trenutnaFaza: { vir: string | null; faza: number } = { vir: null, faza: 0 };
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
const utrip = () => {
  zadnjiPremik = Date.now();
};

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

/**
 * 1. FAZA — seznami. Vrne izid; o statusu vrstice odloči klicatelj, da je
 * pravilo "kdaj je to napaka" na enem mestu (samopopravilo.oceniZakljucek).
 */
async function pregledSeznamov(db: Db, pregledId: string, vir: VirAdapter): Promise<IzidPregleda> {
  const zacetek = new Date().toISOString();
  const p = { strani: 0, najdenih: 0, novih: 0, posodobljenih: 0, sprememb_cen: 0, napak: 0 };
  const objavi = async (dodatno: Record<string, unknown> = {}) => {
    await db.from("nep_pregledi").update({ ...p, ...dodatno, updated_at: new Date().toISOString() }).eq("id", pregledId);
  };
  trenutnaFaza = { vir: vir.vir, faza: 1 };
  await db
    .from("nep_pregledi")
    .update({ status: "tece", zacetek, vir: vir.vir, faza: 1, updated_at: zacetek })
    .eq("id", pregledId);
  log("info", "pregled zacet", { vir: vir.vir });

  let browser: Browser | null = null;
  const videni = new Set<string>();
  let popoln = true;
  let blokada: string | null = null;
  let napaka: string | null = null;

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
        // Zaslon preverjanja "ali si robot" pride s statusom 200; brez te
        // preverbe ga preberemo kot stran brez kartic in vztrajamo naprej.
        await preveriIzziv(page);
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
  const stanje = (stanjeRezin?.podatki ?? {}) as { naslednja?: number; stran?: number };
  const zacetniIndeks = Number(stanje.naslednja ?? 0) % vseRezine.length;
  const zacetnaStran = Math.max(1, Number(stanje.stran ?? 1));
  const rezineVrstniRed = [...vseRezine.slice(zacetniIndeks), ...vseRezine.slice(0, zacetniIndeks)];
  let obdelanihRezin = 0;
  /** Kje naj začne NASLEDNJI pregled: rezina in stran znotraj nje. */
  const shraniNadaljevanje = async (indeks: number, stran: number) => {
    await db.from("nep_statistika").upsert({
      kljuc: `rezine:${vir.vir}`,
      podatki: { naslednja: indeks % vseRezine.length, stran, zadnjic: new Date().toISOString() },
      izracunano: new Date().toISOString(),
    });
  };
  await objavi({ rezin_skupaj: vseRezine.length, rezin_koncanih: 0 });

  let dosezenaKvota = false;
  try {
    browser = await zOmejitvijo("chromium.launch", chromium.launch({ args: ["--no-sandbox"] }), 90_000);
    if (zacetniIndeks > 0) log("info", "nadaljujem pri rezini", { vir: vir.vir, indeks: zacetniIndeks, oznaka: rezineVrstniRed[0]?.oznaka });
    for (const [zaporedna, rezina] of rezineVrstniRed.entries()) {
      if (dosezenaKvota) break;
      if (stopping) {
        popoln = false;
        break;
      }
      const absolutniIndeks = (zacetniIndeks + zaporedna) % vseRezine.length;
      // Samo prva rezina tega pregleda nadaljuje sredi paginacije.
      let stran = zaporedna === 0 ? zacetnaStran : 1;
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
          utrip();

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
            rezin_koncanih: obdelanihRezin,
          });
          if (zadnja !== null && stran >= zadnja) break;
          if (kartice.length === 0 && praznihZapored >= 2) break;
          // Dnevna kvota strani: raje se ustavimo sami, kot da nas vir ustavi.
          if (vir.najvecStrani !== undefined && p.strani >= vir.najvecStrani) {
            log("info", "dosezena kvota strani za ta pregled", { vir: vir.vir, strani: p.strani, rezina: rezina.oznaka, naslednjaStran: stran + 1 });
            dosezenaKvota = true;
            // Naslednjič nadaljuj TOČNO tu — rezina se ne preskoči.
            await shraniNadaljevanje(absolutniIndeks, stran + 1);
            break;
          }
          stran += 1;
          await sleep(vir.omejitve.zamikMs);
        } catch (err) {
          p.napak += 1;
          popoln = false;
          const sporocilo = err instanceof Error ? err.message : String(err);
          await db.from("nep_napake").insert({ vir: vir.vir, url: vir.seznamUrl(rezina, stran), tip: "seznam", sporocilo });
          log("warn", "napaka na strani", { vir: vir.vir, rezina: rezina.oznaka, stran, sporocilo });
          if (/vir blokira|HTTP 403|HTTP 429/.test(sporocilo)) {
            // 403 ustavi cel pregled — vztrajanje bi blokado samo poglobilo.
            // Kje smo obstali, si zapomnimo, da naslednjič nadaljujemo tu.
            blokada = sporocilo;
            await shraniNadaljevanje(absolutniIndeks, stran);
            break;
          }
          break; // druga napaka: preskoči rezino, nadaljuj s preostankom
        }
      }
      if (blokada) break;
      // Rezina je za nami (dokončana ali preskočena zaradi napake): naslednji
      // pregled naj začne za njo, od prve strani.
      if (!dosezenaKvota) {
        obdelanihRezin += 1;
        await shraniNadaljevanje(absolutniIndeks + 1, 1);
      }
    }
  } catch (err) {
    napaka = err instanceof Error ? err.message : String(err);
    popoln = false;
    log("error", "1. faza padla", { vir: vir.vir, napaka });
  } finally {
    if (skupni.ctx) await skupni.ctx.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  // Izginotja samo po POPOLNEM pregledu TEGA vira: delen pregled ne ve, česa
  // ni videl, in bi žive oglase razglasil za izginule. Pregled, ki se je
  // začel sredi kroga (rotacija rezin), po definiciji ni popoln.
  let izginulih = 0;
  const delnaRezina = zacetniIndeks !== 0 || zacetnaStran > 1 || obdelanihRezin < vseRezine.length || dosezenaKvota;
  if (delnaRezina || blokada || napaka) popoln = false;
  if (popoln && videni.size >= vir.pricakovanRazpon[0]) {
    izginulih = await oznaciIzginule(db, zacetek, vir.vir);
  } else if (!delnaRezina && !blokada && !napaka && videni.size < vir.pricakovanRazpon[0]) {
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
  await objavi({ izginulih, rezin_koncanih: obdelanihRezin });

  // Zdravje: pri DELNEM pregledu (kvota, rotacija) je merilo, ali smo sploh
  // kaj dobili — ne število, ki velja za cel katalog. Sicer bi vljudno
  // odmerjen pregled vsak dan lažno kričal "degraded".
  const zdravo = blokada ? videni.size > 0 : delnaRezina ? videni.size > 0 : videni.size >= vir.pricakovanRazpon[0];
  await db
    .from("nep_viri")
    .update({
      zdravje: zdravo ? "healthy" : "degraded",
      zadnji_pregled: new Date().toISOString(),
      zadnjic_najdenih: videni.size,
      ...(zdravo ? { opomba: delnaRezina ? `Delni pregled (kvota ${vir.najvecStrani ?? "-"} strani): ${videni.size} oglasov` : null } : {}),
    })
    .eq("vir", vir.vir);

  log("info", "1. faza koncana", { vir: vir.vir, ...p, unikatnih: videni.size, popoln, blokada });
  return {
    strani: p.strani,
    najdenih: p.najdenih,
    napak: p.napak,
    popoln,
    blokada,
    napaka,
    prekinjeno: stopping,
  };
}

/**
 * Cel pregled enega vira: 1. faza, nato 2. faza, nato pošten zaključek.
 *
 * Nobena pot iz te funkcije ne pusti vrstice v stanju "tece" — tudi ne, če
 * kaj vrže. To je bil pogoj: status mora biti vsakič zaključen.
 */
async function pregled(db: Db, pregledId: string, vir: VirAdapter, detajlovNaKrog: number): Promise<void> {
  let izid: IzidPregleda = {
    strani: 0,
    najdenih: 0,
    napak: 0,
    popoln: false,
    blokada: null,
    napaka: null,
    prekinjeno: false,
  };
  let detajli = { obdelanih: 0, ostalo: 0, napak: 0, izginulih: 0, blokada: null as string | null };

  try {
    izid = await pregledSeznamov(db, pregledId, vir);

    // 2. faza samo, kadar je 1. potekla brez blokade: če nas vir ravnokar
    // ustavlja, je odpiranje detajlnih strani natanko tisto, česar ne smemo.
    const { data: virVrstica } = await db
      .from("nep_viri")
      .select("detajli_omogoceni")
      .eq("vir", vir.vir)
      .maybeSingle();
    const detajliDovoljeni = (virVrstica?.detajli_omogoceni ?? true) === true;

    if (vir.detajli && detajliDovoljeni && detajlovNaKrog > 0 && !izid.blokada && !stopping) {
      trenutnaFaza = { vir: vir.vir, faza: 2 };
      await db
        .from("nep_pregledi")
        .update({ faza: 2, updated_at: new Date().toISOString() })
        .eq("id", pregledId);
      await sprostiZataknjenoVrsto(db, vir.vir);
      const kvota = Math.min(vir.detajli.kvota, detajlovNaKrog);
      const izidDetajlov = await zajemiDetajle(
        db,
        { ...vir, detajli: { ...vir.detajli, kvota } },
        log,
        async (podatki) => {
          await db.from("nep_pregledi").update({ ...podatki, updated_at: new Date().toISOString() }).eq("id", pregledId);
        },
        utrip,
        () => stopping
      );
      detajli = izidDetajlov;
      await db
        .from("nep_pregledi")
        .update({
          detajlov_obdelanih: izidDetajlov.obdelanih,
          detajlov_skupaj: izidDetajlov.obdelanih + izidDetajlov.ostalo,
          izginulih: izidDetajlov.izginulih,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pregledId);
      if (izidDetajlov.blokada) izid = { ...izid, blokada: izidDetajlov.blokada };
    }
  } catch (err) {
    // Karkoli je ušlo obema fazama — pregled se vseeno zaključi.
    izid = { ...izid, napaka: err instanceof Error ? err.message : String(err) };
    log("error", "pregled padel", { vir: vir.vir, napaka: izid.napaka });
  } finally {
    trenutnaFaza = { vir: null, faza: 0 };
    const z = oceniZakljucek(izid);
    await db
      .from("nep_pregledi")
      .update({
        status: z.status,
        konec: new Date().toISOString(),
        pregled_popoln: z.pregledPopoln,
        opozorilo: z.opozorilo,
        zadnja_napaka: izid.blokada ?? izid.napaka ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pregledId);
    log("info", "pregled zakljucen", {
      vir: vir.vir,
      status: z.status,
      strani: izid.strani,
      najdenih: izid.najdenih,
      detajlov: detajli.obdelanih,
      opozorilo: z.opozorilo,
    });

    // Blokado spoštujemo: vir pustimo pri miru, dokler hlajenje ne poteče.
    // Nikoli je ne poskušamo obiti — počasneje in kasneje, ne drugače.
    if (izid.blokada) {
      await zabelezBlokado(db, vir.vir, vir.hlajenjeUr ?? 6, izid.blokada);
    } else if (z.status === "napaka") {
      await zabelezi(db, {
        sprozil: "zaključek pregleda",
        vir: vir.vir,
        vzrok: z.opozorilo ?? "Pregled ni pobral nobene strani.",
        ukrep: "ponovni_poskus",
        izvedeno: "Vir ostane v čakalnici; naslednji krog poskusi znova.",
      });
    }
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
  utrip();
}

/** Vsak adapter iz registra dobi vrstico v nep_viri; novi so IZKLOPLJENI. */
async function zagotoviViri(db: Db): Promise<void> {
  const { data } = await db.from("nep_viri").select("vir");
  const obstojeci = new Set((data ?? []).map((v) => v.vir as string));
  for (const v of VIRI) {
    if (obstojeci.has(v.vir)) {
      // Pravno opozorilo in Crawl-delay se osvežita ob vsakem zagonu: to sta
      // podatka o viru, ne nastavitvi uporabnika.
      await db
        .from("nep_viri")
        .update({ crawl_delay_s: v.crawlDelayS ?? null, opomba_pravno: v.pravno ?? null })
        .eq("vir", v.vir);
      continue;
    }
    await db.from("nep_viri").insert({
      vir: v.vir,
      omogocen: false,
      pricakovano_min: v.pricakovanRazpon[0],
      pricakovano_max: v.pricakovanRazpon[1],
      crawl_delay_s: v.crawlDelayS ?? null,
      opomba_pravno: v.pravno ?? null,
    });
    log("info", "nov vir vpisan (izklopljen)", { vir: v.vir });
  }
}

async function vklopljeniViri(db: Db): Promise<string[]> {
  const { data } = await db.from("nep_viri").select("vir, omogocen").eq("omogocen", true);
  const vBazi = new Set((data ?? []).map((v) => v.vir as string));
  const pripravljeni: string[] = [];
  for (const v of VIRI) {
    if (!vBazi.has(v.vir)) continue;
    const doKdaj = await hlajenjeDo(db, v.vir);
    if (doKdaj) {
      log("info", "vir je v hlajenju - preskocim", { vir: v.vir, do: doKdaj });
      continue;
    }
    pripravljeni.push(v.vir);
  }
  return pripravljeni;
}

type Urnik = { omogocen: boolean; ure: number[]; detajlovNaKrog: number };

/** Urnik iz baze; ob prazni ali pokvarjeni vrstici varen privzetek. */
async function preberiUrnik(db: Db): Promise<Urnik> {
  const privzeto: Urnik = { omogocen: true, ure: [4], detajlovNaKrog: 400 };
  const { data, error } = await db
    .from("nep_urnik")
    .select("omogocen, ure, detajlov_na_krog")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return privzeto;
  const ure = String(data.ure ?? "4")
    .split(/[,\s]+/)
    .map((h) => Number(h))
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  return {
    omogocen: data.omogocen !== false,
    ure: ure.length > 0 ? ure : privzeto.ure,
    detajlovNaKrog: Number(data.detajlov_na_krog ?? 400),
  };
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
  const urnikOb = await preberiUrnik(db);

  if (prevzemiId) {
    const { data } = await db.from("nep_pregledi").select("id, vir, status").eq("id", prevzemiId).maybeSingle();
    if (!data) {
      console.error(`Pregleda ${prevzemiId} ni.`);
      process.exit(2);
    }
    log("info", "prevzemam obstojeci pregled", { id: prevzemiId, vir: data.vir, status: data.status });
    await pregled(db, prevzemiId, najdiVir((data.vir as string | null) ?? virArg), urnikOb.detajlovNaKrog);
    await knjigovodstvo(db);
    return;
  }

  const server = once
    ? null
    : createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            heartbeatAgeMs: Date.now() - zadnjiPremik,
            faza: trenutnaFaza.faza,
            vir: trenutnaFaza.vir,
          })
        );
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
    // heartbeat pa bi mirno kazal "živ". Zapre se kot DELNI pregled — delo,
    // ki ga je opravil, je v bazi in je resnično.
    const zaprtih = await zapriOsirotele(db, 0);
    if (zaprtih > 0) log("warn", "osiroteli pregledi zaprti ob zagonu", { st: zaprtih });
  }

  log("info", "nepremicnine zbiralnik zagnan", {
    ure: urnikOb.ure,
    urnikOmogocen: urnikOb.omogocen,
    viri: VIRI.map((v) => v.vir),
  });

  if (once) {
    const vir = najdiVir(virArg);
    const { data } = await db.from("nep_pregledi").insert({ status: "zahtevano", vir: vir.vir }).select("id").maybeSingle();
    if (data) await pregled(db, data.id as string, vir, urnikOb.detajlovNaKrog);
    await knjigovodstvo(db);
    return;
  }

  /**
   * Nadzornik zataknjenosti. Zbiralnik piše `zadnjiPremik` ob vsaki strani,
   * vsakem detajlu in vsakem koraku knjigovodstva. Če se pol ure ne premakne
   * nič, proces ni priden — zataknjen je (izmerjeno pri avtomobilih: klic
   * brskalnika, ki 90 minut ne vrne). Takrat se konča; nadzornik.ps1 opazi
   * prazna vrata in ga zažene znova, ob zagonu pa se osiroteli pregled zapre
   * kot delni. Tako se sistem pobere sam, brez človeka.
   */
  const strazar = setInterval(() => {
    const mirujeMs = Date.now() - zadnjiPremik;
    if (mirujeMs < ZATAKNJEN_MS || stopping) return;
    log("error", "zbiralnik zataknjen - koncujem proces", { mirujeMin: Math.round(mirujeMs / 60_000) });
    void zabelezi(db, {
      sprozil: "nadzornik zataknjenosti",
      vir: trenutnaFaza.vir,
      vzrok: `Zbiralnik se ni premaknil ${Math.round(mirujeMs / 60_000)} minut (faza ${trenutnaFaza.faza}).`,
      ukrep: "ponovni_zagon",
      izvedeno: "Proces se konča; nadzornik ga zažene znova, osiroteli pregled se zapre kot delni.",
    }).finally(() => process.exit(1));
  }, 60_000);
  strazar.unref?.();

  /** Ključ termina, ki je bil že sprožen ("2026-08-20T04") — brez podvajanja. */
  let zadnjiTermin: string | null = null;
  let cakalnica: string[] = [];

  while (!stopping) {
    utrip();
    const urnik = await preberiUrnik(db);
    const zdaj = new Date();
    // Ključ termina je v LOKALNEM času, ker so ure urnika lokalne. Mešanje
    // datuma po UTC z lokalno uro bi okoli polnoči isti termin sprožilo
    // dvakrat ali ga preskočilo.
    const kljucTermina = `${zdaj.getFullYear()}-${String(zdaj.getMonth() + 1).padStart(2, "0")}-${String(
      zdaj.getDate()
    ).padStart(2, "0")}T${String(zdaj.getHours()).padStart(2, "0")}`;
    if (urnik.omogocen && urnik.ure.includes(zdaj.getHours()) && zadnjiTermin !== kljucTermina) {
      cakalnica = await vklopljeniViri(db);
      zadnjiTermin = kljucTermina;
      log("info", "urnik: cakalnica virov", { ob: kljucTermina, cakalnica });
    }

    // Osiroteli pregledi drugih procesov (npr. ročni zagon iz ukazne vrstice,
    // ki je bil ubit). Unikatni indeks zaradi njih zavrne vsako novo zahtevo.
    await zapriOsirotele(db, 45);

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
      const { error } = await db.from("nep_pregledi").insert({ status: "zahtevano", vir, zahteval: "urnik" });
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
      const virNaloge = najdiVir((naloga.vir as string | null) ?? null);
      const doKdaj = await hlajenjeDo(db, virNaloge.vir);
      if (doKdaj) {
        // Tudi ročna zahteva spoštuje hlajenje — sicer bi jo lahko uporabili
        // za obhod blokade, kar je točno tisto, česar nočemo.
        await db
          .from("nep_pregledi")
          .update({
            status: "preklicano",
            konec: new Date().toISOString(),
            opozorilo: `Vir počiva po blokadi do ${new Date(doKdaj).toLocaleString("sl-SI")}. Blokade ne obidemo.`,
            zadnja_napaka: "vir je v hlajenju po blokadi",
          })
          .eq("id", naloga.id as string);
        log("warn", "zahteva preklicana - vir v hlajenju", { vir: virNaloge.vir, do: doKdaj });
      } else {
        await pregled(db, naloga.id as string, virNaloge, urnik.detajlovNaKrog);
        await knjigovodstvo(db);
      }
    }
    await sleep(POLL_MS);
  }
  clearInterval(strazar);
  server?.close();
}

main().catch((err) => {
  console.error("USODNA NAPAKA:", err instanceof Error ? err.message : err);
  process.exit(1);
});
