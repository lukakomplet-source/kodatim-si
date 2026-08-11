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

export async function preberiIzSlik(dataUrls: string[]): Promise<BranjeRezultat> {
  const surovo = await chatJSONWithImages<SurovoBranje>(
    SISTEM,
    "Preberi podatke o vozilu iz tega posnetka oglasa.",
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

  // Plain fetch as the fallback. mobile.de and avto.net both fight scrapers, so
  // this is expected to fail sometimes — and when it does we say so and ask for
  // a screenshot rather than returning a half-read vehicle.
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
        besedilo = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 12_000);
      }
    } catch {
      // Handled below.
    }
  }

  if (!besedilo || besedilo.trim().length < 200) {
    throw new Error(
      `Strani ni bilo mogoče prebrati. ${opombaVira} Poskusite naložiti posnetek zaslona oglasa — z njega preberemo iste podatke.`
    );
  }

  const izvor: Izvor = jeMobileDe(url) ? "mobile" : jeAvtoNet(url) ? "avtonet" : "besedilo";
  return preberiIzBesedila(besedilo, izvor);
}
