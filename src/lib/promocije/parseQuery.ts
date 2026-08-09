import "server-only";
import { chatJSON } from "@/lib/openai";
import { skdByCode, skdCatalogueText } from "@/lib/skd";
import { fetchMunicipalities } from "@/lib/publicEnrichment/ajpesExhaustive";
import type { CampaignKind, TargetProfile } from "./targeting";

/**
 * One plain sentence — "rabim podizvajalce za polaganje keramike, Celje z
 * okolico, s.p., promet pod 50k" — becomes a structured, validated search
 * profile.
 *
 * The model does the reading; the registers do the truth. Every SKD code is
 * looked up in the official classification and every municipality in the
 * official list before either is accepted, because both failure modes are
 * silent: a stale code or a misspelled municipality searches for something
 * that does not exist and returns an honest, misleading zero.
 *
 * Lives here rather than in the route so the verification script exercises the
 * exact code path the button uses.
 */

const PROMPT = `Uporabnik z navadnim stavkom opiše, kakšna podjetja išče v Sloveniji.
Iz opisa sestavi iskalne filtre. Odgovori IZKLJUČNO z veljavnim JSON objektom s ključi:

{
  "skdCodes": ["<šifre IZKLJUČNO iz priloženega šifranta, ki ustrezajo opisani dejavnosti>"],
  "municipalities": ["<občine IZKLJUČNO iz priloženega seznama, ki ustrezajo opisanemu območju>"],
  "keywords": ["<3-8 besed iz opisa dejavnosti, male črke>"],
  "revenueMinEur": <število ali null>,
  "revenueMaxEur": <število ali null>,
  "legalForm": "sp" | "doo" | null,
  "summary": "<ena poved: koga iščemo>"
}

Pravila:
- Dejavnost: šifre vzemi dobesedno iz šifranta. "Keramika/polaganje ploščic" je npr. 43.330
  (Oblaganje tal in sten). Raje več ustreznih šifer kot premalo, a nobene, ki očitno ne spada.
- Območje je GEOGRAFSKI opis: "Celje z okolico" pomeni občino Celje in sosednje občine do
  ~25 km; regija pomeni vse njene občine. Imena piši črko za črko kot v seznamu.
  Če območje ni omenjeno, vrni prazno polje.
- Promet: "pod 50k" -> revenueMaxEur 50000; "nad 100.000" -> revenueMinEur 100000.
  Če ni omenjen, null.
- "s.p." -> legalForm "sp"; "d.o.o." -> "doo"; sicer null.
- Vse v slovenščini.`;

export type ParsedLeadQuery =
  | { ok: true; profile: TargetProfile }
  | { ok: false; error: string };

export async function parseLeadQuery(query: string, kind: CampaignKind): Promise<ParsedLeadQuery> {
  const official = await fetchMunicipalities();
  const officialSet = new Set(official);

  type Parsed = {
    skdCodes?: string[];
    municipalities?: string[];
    keywords?: string[];
    revenueMinEur?: number | null;
    revenueMaxEur?: number | null;
    legalForm?: string | null;
    summary?: string;
  };

  // The full model: classification + geography + number reading in one pass,
  // asked once per typed query. The mini model already proved too weak for
  // the geography half alone.
  const ai = await chatJSON<Parsed>(
    PROMPT,
    [
      `Uradni šifrant SKD dejavnosti:\n${skdCatalogueText()}`,
      `Uradni seznam občin:\n${official.join("\n")}`,
      `Opis (namen: ${kind}): ${query}`,
    ].join("\n\n"),
    { temperature: 0.2, model: "gpt-4o" }
  );

  const strList = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
      : [];
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };

  const skdCodes = [...new Set(strList(ai.skdCodes).filter((c) => Boolean(skdByCode(c))))];
  const municipalities = [...new Set(strList(ai.municipalities).filter((m) => officialSet.has(m)))];
  const legalForm = ai.legalForm === "sp" || ai.legalForm === "doo" ? ai.legalForm : null;

  const profile: TargetProfile = {
    skdCodes,
    keywords: strList(ai.keywords).map((k) => k.toLowerCase()).slice(0, 8),
    regions: [],
    sizes: [],
    summary: typeof ai.summary === "string" ? ai.summary.trim() : "",
    municipalities,
    revenueMinEur: num(ai.revenueMinEur),
    revenueMaxEur: num(ai.revenueMaxEur),
    legalForm,
  };

  if (skdCodes.length === 0 && profile.keywords.length === 0) {
    return { ok: false, error: "Iz opisa ni bilo mogoče razbrati dejavnosti — dopišite, kaj podjetja počnejo." };
  }
  return { ok: true, profile };
}
