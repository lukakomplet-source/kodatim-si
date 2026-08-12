import "server-only";
import { chatJSON, chatJSONWithImages } from "@/lib/openai";
import { isFirecrawlUnavailable, scrapeUrl } from "@/lib/firecrawl";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizirajGorivo,
  normalizirajKaroserijo,
  normalizirajMenjalnik,
  normalizirajPogon,
  OZNAKE_ZNACILK,
  PRAZNO_VOZILO,
  type Vozilo,
} from "./vozilo";

/**
 * Reading a vehicle out of whatever the user pasted.
 *
 * Three inputs, three different reliabilities, and the difference is reported
 * rather than smoothed over:
 *
 *   avto.net link   the advert is very likely already in our own database, in
 *                   which case nothing is inferred at all — we return the
 *                   parsed record. This is both the cheapest and the most
 *                   accurate path, so it is tried first.
 *   mobile.de link  fetched and read by AI, because we have no parser for it.
 *   screenshot      read by AI vision.
 *
 * The rule for the AI paths: **never invent a field.** A value that is not
 * legible in the source comes back null, and the screen marks it as unknown.
 * An invented drivetrain silently changes which cars we compare against, which
 * is a wrong answer wearing the costume of a confident one.
 */

export type Izvor = "baza" | "avtonet" | "mobile" | "slika" | "besedilo";

export type BranjeRezultat = {
  vozilo: Vozilo;
  izvor: Izvor;
  /** Fields the source stated outright. */
  znano: string[];
  /** Fields nothing in the source stated. */
  neznano: string[];
  opomba: string;
};

const POLJA = [
  "znamka", "model", "verzija", "letnik", "km", "ccm", "kw", "gorivo", "menjalnik", "pogon",
  "karoserija", "cena",
] as const;

function razvrstiPolja(v: Vozilo): { znano: string[]; neznano: string[] } {
  const znano: string[] = [];
  const neznano: string[] = [];
  for (const p of POLJA) {
    const val = (v as unknown as Record<string, unknown>)[p];
    (val === null || val === undefined || val === "" ? neznano : znano).push(p);
  }
  return { znano, neznano };
}

const SLOVAR_ZNACILK = Object.entries(OZNAKE_ZNACILK)
  .map(([slug, oznaka]) => `${slug} (${oznaka})`)
  .join(", ");

const SISTEM = `Si natančen luščilnik podatkov o rabljenih vozilih iz oglasov.
Vrni SAMO JSON s temi ključi:
{"znamka":string|null,"model":string|null,"verzija":string|null,"letnik":number|null,
 "km":number|null,"ccm":number|null,"kw":number|null,"gorivo":string|null,
 "menjalnik":string|null,"pogon":string|null,"karoserija":string|null,
 "cena":number|null,"valuta":string|null,"znacilke":string[]}

PRAVILA — ta so pomembnejša od popolnosti odgovora:
1. NIKOLI si ne izmisli podatka. Če podatka v besedilu/sliki ni, vrni null.
2. Ne sklepaj opreme iz imena paketa. "M Sport" NE pomeni, da ima avto adaptivni tempomat.
3. "model" naj bo kratko ime modela (A6, X5, Golf, Captur, serija 3), NE cel naslov oglasa.
4. "verzija" je oznaka motorja/opreme (npr. "50 TDI quattro", "1.3 TCe 140 Intens").
5. "km" so prevoženi kilometri kot število, brez pik in enot.
6. "kw" je moč v kilovatih. Če je navedena samo v KM/PS, pretvori: kW = KM / 1.36.
7. "cena" je zahtevana cena kot število; "valuta" npr. "EUR".
8. "znacilke" izberi SAMO iz tega slovarja, in samo tiste, ki so v oglasu izrecno navedene: ${SLOVAR_ZNACILK}
9. Nemške izraze normaliziraj (Automatik -> avtomatski, Allrad -> 4x4, Kombi -> karavan,
   Limousine -> limuzina, Schaltgetriebe -> ročni, Benzin -> bencin, Diesel -> diesel).`;

type SurovoBranje = {
  znamka?: string | null;
  model?: string | null;
  verzija?: string | null;
  letnik?: number | null;
  km?: number | null;
  ccm?: number | null;
  kw?: number | null;
  gorivo?: string | null;
  menjalnik?: string | null;
  pogon?: string | null;
  karoserija?: string | null;
  cena?: number | null;
  valuta?: string | null;
  znacilke?: string[] | null;
};

function stevilo(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function niz(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null;
}

/** Turns the model's answer into a Vozilo, dropping anything outside our vocabulary. */
function vVozilo(s: SurovoBranje): Vozilo {
  const dovoljene = new Set(Object.keys(OZNAKE_ZNACILK));
  return {
    ...PRAZNO_VOZILO,
    znamka: niz(s.znamka),
    model: niz(s.model),
    verzija: niz(s.verzija),
    letnik: stevilo(s.letnik),
    km: stevilo(s.km),
    ccm: stevilo(s.ccm),
    kw: stevilo(s.kw),
    gorivo: normalizirajGorivo(s.gorivo),
    menjalnik: normalizirajMenjalnik(s.menjalnik),
    pogon: normalizirajPogon(s.pogon),
    karoserija: normalizirajKaroserijo(s.karoserija),
    // A slug the model made up would silently never match anything, so it is
    // dropped here rather than carried into the comparison as dead weight.
    znacilke: (s.znacilke ?? []).filter((z) => typeof z === "string" && dovoljene.has(z)),
    cena: stevilo(s.cena),
    valuta: niz(s.valuta) ?? "EUR",
  };
}

/** avto.net advert id from any of the URL shapes the site uses. */
export function avtonetId(url: string): string | null {
  return url.match(/[?&]id=(\d+)/i)?.[1] ?? null;
}

export function jeMobileDe(url: string): boolean {
  return /(^|\.)mobile\.de$/i.test(safeHost(url) ?? "");
}

export function jeAvtoNet(url: string): boolean {
  return /(^|\.)avto\.net$/i.test(safeHost(url) ?? "");
}

/**
 * A readable car name from a mobile.de listing URL, e.g.
 * ".../auto-inserat/cupra-formentor-vz-4drive-led-beats-.../458599126.html"
 * -> "Cupra Formentor Vz 4drive Led Beats". Used only to make the "we can't
 * read mobile.de, use a screenshot" message concrete — never as valuation data.
 */
function mobileDeSlug(url: string): string | null {
  const m = url.match(/auto-inserat\/([a-z0-9-]+)\//i);
  if (!m) return null;
  const words = m[1]
    .split("-")
    .filter((w) => w && !/^\d+$/.test(w))
    .slice(0, 6)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.length ? words.join(" ") : null;
}

/** Signals a fetched page is a bot-block interstitial, not the real content. */
function jeBlokada(text: string): boolean {
  return /Access denied|Zugriff verweigert|returned error 403|Just a moment|captcha|cf-browser-verification/i.test(
    text.slice(0, 1500)
  );
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * The advert as WE already parsed it. No AI, no fetch, no inference — this is
 * the path where every field is a fact we collected ourselves.
 */
async function izBaze(id: string): Promise<BranjeRezultat | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("avtonet_oglasi")
    .select(
      "znamka, model, verzija, letnik, km, ccm, kw, gorivo, menjalnik, pogon, karoserija, " +
        "oprema_znacilke, cena_eur"
    )
    .eq("avtonet_id", id)
    .maybeSingle();
  if (!data) return null;

  const r = data as unknown as Record<string, unknown>;
  const vozilo: Vozilo = {
    ...PRAZNO_VOZILO,
    znamka: (r.znamka as string) ?? null,
    model: (r.model as string) ?? null,
    verzija: (r.verzija as string) ?? null,
    letnik: (r.letnik as number) ?? null,
    km: (r.km as number) ?? null,
    ccm: (r.ccm as number) ?? null,
    kw: (r.kw as number) ?? null,
    gorivo: normalizirajGorivo(r.gorivo as string),
    menjalnik: normalizirajMenjalnik(r.menjalnik as string),
    pogon: normalizirajPogon(r.pogon as string),
    karoserija: normalizirajKaroserijo(r.karoserija as string),
    znacilke: (r.oprema_znacilke as string[]) ?? [],
    cena: r.cena_eur === null || r.cena_eur === undefined ? null : Number(r.cena_eur),
    valuta: "EUR",
  };
  const { znano, neznano } = razvrstiPolja(vozilo);
  return {
    vozilo,
    izvor: "baza",
    znano,
    neznano,
    opomba: "Oglas je že v naši bazi — podatki so iz našega lastnega zajema, brez ugibanja.",
  };
}

export async function preberiIzBesedila(besedilo: string, izvor: Izvor = "besedilo"): Promise<BranjeRezultat> {
  const surovo = await chatJSON<SurovoBranje>(SISTEM, besedilo.slice(0, 12_000), { temperature: 0 });
  const vozilo = vVozilo(surovo);
  const { znano, neznano } = razvrstiPolja(vozilo);
  return {
    vozilo,
    izvor,
    znano,
    neznano,
    opomba:
      neznano.length > 0
        ? `Iz vira ni bilo mogoče razbrati: ${neznano.join(", ")}. Ta polja ostajajo prazna in niso ugibana.`
        : "Vsa ključna polja so bila razbrana iz vira.",
  };
}

export async function preberiIzSlik(
  dataUrls: string[],
  opcije?: { vidnaOprema?: boolean }
): Promise<BranjeRezultat> {
  // For photos of the CAR (not a screenshot of the advert's spec table), the
  // user wants visible equipment recognised — LED headlights, a panoramic roof,
  // the alloy design, leather, a large screen. That is reading a visible fact,
  // not inventing one, so it is allowed; anything not clearly visible still
  // stays null.
  const navodilo = opcije?.vidnaOprema
    ? "Preberi podatke o vozilu s teh fotografij. Kar jasno vidiš na sliki (LED/matrix žarometi, " +
      "panoramska streha, oblika platišč, usnjeni/športni sedeži, velik zaslon, digitalni merilniki), " +
      "dodaj v 'znacilke'. Česar ne vidiš jasno, NE ugibaj."
    : "Preberi podatke o vozilu iz tega posnetka oglasa.";
  const surovo = await chatJSONWithImages<SurovoBranje>(
    SISTEM,
    navodilo,
    dataUrls.slice(0, 4),
    // The spec table on a car advert is dense small text; low detail loses the
    // digits that matter most (mileage, power, price).
    { temperature: 0, imageDetail: "high" }
  );
  const vozilo = vVozilo(surovo);
  const { znano, neznano } = razvrstiPolja(vozilo);
  return {
    vozilo,
    izvor: "slika",
    znano,
    neznano,
    opomba:
      neznano.length > 0
        ? `S posnetka ni bilo mogoče prebrati: ${neznano.join(", ")}. Ta polja lahko dopolnite ročno.`
        : "Vsa ključna polja so bila prebrana s posnetka.",
  };
}

/**
 * Trim / engine / drivetrain badges worth carrying into `verzija`.
 *
 * These are the words a seller puts in the listing URL that identify WHICH
 * version of a model it is — the difference between a 310 PS Formentor VZ and a
 * 150 PS 1.5 eTSI. Single-character badges (Golf "R", BMW "M") are omitted on
 * purpose: podobnostVerzije drops one-character tokens, so extracting them
 * would be dead weight.
 */
const BESEDE_IZVEDBE = new Set([
  "vz", "gti", "gtd", "gts", "rs", "amg", "sline", "mpaket", "msport", "mperformance",
  "quattro", "xdrive", "4drive", "4motion", "4matic", "allrad", "tdi", "tsi", "tfsi", "etsi",
  "tdci", "ecoboost", "bluehdi", "hdi", "cdi", "dci", "crdi", "jtd", "phev", "mhev", "hybrid",
  "abarth", "jcw", "nline", "cupra", "competition", "performance",
]);

/**
 * Slug-token → equipment slug. First matching pattern wins per token; the list
 * is ordered specific-before-generic ("matrix" before "led"). Only slugs that
 * exist in our vocabulary survive the caller's validation.
 */
const SLUG_ZNACILKE: [RegExp, string][] = [
  [/matrix/, "matrix_led"],
  [/laser/, "laser_luci"],
  [/xenon/, "xenon"],
  [/led/, "led"],
  [/beats|bose|harman|hifi|soundsystem|dynaudio|meridian/, "hi_fi"],
  [/360/, "kamera_360"],
  [/kamera|camera|rueckfahr|rearview|backup/, "kamera"],
  [/^acc$|abstandstempomat|adaptivetempomat|adaptivecruise/, "acc"],
  [/tempomat|cruise/, "tempomat"],
  [/lane|spurhalt|^lka$/, "lane_assist"],
  [/blindspot|totwinkel/, "blind_spot"],
  [/keyless|kessy|smartkey/, "keyless"],
  [/panorama|panodach|^pano$/, "panorama"],
  [/navi/, "navigacija"],
  [/carplay/, "apple_carplay"],
  [/androidauto/, "android_auto"],
  [/headup|^hud$/, "hud"],
  [/virtualcockpit|digitalcockpit|^cockpit$|^virtual$/, "virtual_cockpit"],
  [/leder|usnje|leather/, "usnje"],
  [/massage/, "sedezi_masaza"],
  [/memory/, "memory"],
  [/sitzheiz|seatheat|gretjesedez|heatedseats/, "sedezi_gretje"],
  [/^ahk$|anhang|towbar|vlecna|kupplung/, "vlecna"],
  [/ambient/, "ambientna"],
];

/** Power from a slug: "150kw"/"150-kw"/"310ps"/"310hp" → kW (PS/HP ÷ 1.36). */
function izlusciMoc(tokeni: string[]): number | null {
  for (let i = 0; i < tokeni.length; i++) {
    let m = tokeni[i].match(/^(\d{2,3})(kw|ps|hp)$/);
    if (!m && /^\d{2,3}$/.test(tokeni[i]) && i + 1 < tokeni.length && /^(kw|ps|hp)$/.test(tokeni[i + 1])) {
      m = [tokeni[i] + tokeni[i + 1], tokeni[i], tokeni[i + 1]] as unknown as RegExpMatchArray;
    }
    if (m) {
      const n = Number(m[1]);
      const kw = m[2] === "kw" ? n : Math.round(n / 1.36);
      if (kw >= 40 && kw <= 700) return kw;
    }
  }
  return null;
}

/**
 * What the listing URL itself reveals about the car.
 *
 * mobile.de blocks page reading, but the seller-written slug
 * (".../cupra-formentor-vz-4drive-led-beats-acc-lane-keylessgo-...") still
 * names the trim, drivetrain and headline equipment. Reading it is not
 * inference — the words are literally in the link — but it only ever FILLS
 * gaps (see the merge), so it can never override what the page actually stated.
 */
function izLuscenegaSlug(url: string): Partial<Vozilo> {
  let pot: string;
  try {
    pot = decodeURIComponent(new URL(url).pathname);
  } catch {
    pot = url;
  }
  const razrez = pot
    .toLowerCase()
    .replace(/\.html?$/i, "")
    .split(/[/\-_.]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !["auto", "inserat", "autos", "fahrzeug", "details", "podrobnosti", "oglas", "vehicle"].includes(t));
  const besede = razrez.filter((t) => !/^\d+$/.test(t));

  const izvedba = besede.filter((t) => BESEDE_IZVEDBE.has(t));
  const verzija = izvedba.length ? izvedba.join(" ") : null;

  const dovoljene = new Set(Object.keys(OZNAKE_ZNACILK));
  const znacilke = new Set<string>();
  for (const t of besede) {
    for (const [re, slug] of SLUG_ZNACILKE) {
      if (re.test(t)) {
        if (dovoljene.has(slug)) znacilke.add(slug);
        break;
      }
    }
  }

  return {
    verzija,
    pogon: normalizirajPogon(razrez.join(" ")),
    // Only the engine badges, so a stray word in the slug cannot invent a fuel.
    gorivo: normalizirajGorivo(izvedba.join(" ")),
    kw: izlusciMoc(razrez),
    znacilke: [...znacilke],
  };
}

/** Fills only the fields the source left empty; equipment is unioned. */
function zdruziIzSlug(v: Vozilo, iz: Partial<Vozilo>): Vozilo {
  return {
    ...v,
    verzija: v.verzija ?? iz.verzija ?? null,
    pogon: v.pogon ?? iz.pogon ?? null,
    gorivo: v.gorivo ?? iz.gorivo ?? null,
    kw: v.kw ?? iz.kw ?? null,
    znacilke: Array.from(new Set([...(v.znacilke ?? []), ...(iz.znacilke ?? [])])),
  };
}

export async function preberiIzPovezave(url: string): Promise<BranjeRezultat> {
  // Our own database first: free, instant, and the only path with no inference.
  if (jeAvtoNet(url)) {
    const id = avtonetId(url);
    if (id) {
      const iz = await izBaze(id);
      if (iz) return iz;
    }
  }

  let besedilo: string | null = null;
  let opombaVira = "";

  try {
    const scrape = await scrapeUrl(url, { onlyMainContent: true });
    besedilo = `${scrape.title ?? ""}\n\n${scrape.markdown}`;
  } catch (err) {
    if (!isFirecrawlUnavailable(err)) {
      opombaVira = `Branje strani prek Firecrawl ni uspelo (${err instanceof Error ? err.message : "neznana napaka"}).`;
    } else {
      opombaVira = "Firecrawl ni na voljo.";
    }
  }

  // mobile.de blocks ordinary reading; a stealth (residential + anti-bot) proxy
  // is the one server-side path that sometimes gets through. Attempted only for
  // mobile.de and only if the plain read produced nothing, because stealth
  // costs more Firecrawl credits. Silently falls through if Firecrawl is
  // unavailable — this is a bonus attempt, not the load-bearing path.
  if ((!besedilo || jeBlokada(besedilo)) && jeMobileDe(url)) {
    try {
      const scrape = await scrapeUrl(url, { onlyMainContent: true, proxy: "stealth", waitFor: 2500 });
      const t = `${scrape.title ?? ""}\n\n${scrape.markdown}`;
      if (t.trim().length > 200 && !jeBlokada(t)) besedilo = t;
    } catch {
      // Stealth also blocked or no Firecrawl — the screenshot path still works.
    }
  }

  // Jina Reader — a free, no-key rendering proxy. Works on most sites that
  // block a naive fetch (it uses its own headless browser), so avto.net ads not
  // in our DB and other sources become readable without Firecrawl. mobile.de is
  // the known exception: its WAF returns "Access denied" even to Jina, which
  // jeBlokada() detects and rejects rather than feeding a block page to the AI.
  if (!besedilo) {
    try {
      const jr = await fetch(`https://r.jina.ai/${url}`, {
        headers: { "User-Agent": "Mozilla/5.0", "X-Return-Format": "markdown" },
        signal: AbortSignal.timeout(30_000),
      });
      if (jr.ok) {
        const t = await jr.text();
        if (t && t.length > 300 && !jeBlokada(t)) besedilo = t.slice(0, 12_000);
      }
    } catch {
      // Falls through to plain fetch.
    }
  }

  // Plain fetch as the last resort.
  if (!besedilo) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "sl,de;q=0.9,en;q=0.8",
        },
      });
      if (res.ok) {
        const html = await res.text();
        const clean = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 12_000);
        if (!jeBlokada(clean)) besedilo = clean;
      }
    } catch {
      // Handled below.
    }
  }

  if (!besedilo || besedilo.trim().length < 200) {
    // mobile.de deliberately blocks all server-side reading (verified: 403
    // "Access denied" to every method). Rather than a generic failure, name the
    // car recognised from the URL and point at the path that actually works.
    if (jeMobileDe(url)) {
      const ime = mobileDeSlug(url);
      throw new Error(
        `mobile.de blokira samodejno branje oglasa (njihova zaščita proti botom).${
          ime ? ` Iz povezave prepoznam: ${ime}.` : ""
        } Uporabi zavihek „Posnetek zaslona" — z njega preberemo ceno, kilometre in letnik. (Povezava deluje pri Avto.net oglasih.)`
      );
    }
    throw new Error(
      `Strani ni bilo mogoče prebrati. ${opombaVira} Poskusite naložiti posnetek zaslona oglasa — z njega preberemo iste podatke.`
    );
  }

  const izvor: Izvor = jeMobileDe(url) ? "mobile" : jeAvtoNet(url) ? "avtonet" : "besedilo";
  const rez = await preberiIzBesedila(besedilo, izvor);

  // The link's own words fill what the (often thin or partly blocked) page body
  // did not — trim, drivetrain and headline equipment — WITHOUT overwriting any
  // field the page stated. This is the difference between comparing a Formentor
  // VZ 4Drive against real VZ 4Drives and comparing it against every cheap 1.5.
  const iz = izLuscenegaSlug(url);
  const vozilo = zdruziIzSlug(rez.vozilo, iz);
  const { znano, neznano } = razvrstiPolja(vozilo);
  const dopolnjeno = Boolean(iz.verzija || iz.pogon || iz.gorivo || iz.kw || iz.znacilke?.length);
  const opomba = [
    neznano.length > 0
      ? `Iz vira ni bilo mogoče razbrati: ${neznano.join(", ")}. Ta polja ostajajo prazna in niso ugibana.`
      : "Vsa ključna polja so bila razbrana iz vira.",
    dopolnjeno ? "Izvedbo, pogon in opremo smo dopolnili iz besed v sami povezavi oglasa." : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { ...rez, vozilo, znano, neznano, opomba };
}
