import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { chatJSON } from "@/lib/openai";
import { CARDONE_PERSONA } from "./cardonePersona";
import { KNOWLEDGE_KIND_LABELS, type CoachAnswer, type KnowledgeEntry } from "./salesCoachTypes";

/**
 * A sales coach that answers from YOUR material, not from the model's general
 * opinions about selling.
 *
 * Every answer names the knowledge entries it used, and the prompt requires it
 * to say when the base does not cover the question instead of filling the gap
 * with plausible-sounding advice. Generic sales advice is easy to get anywhere;
 * the point of this is that it repeats what you decided works.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export {
  KNOWLEDGE_KINDS,
  KNOWLEDGE_KIND_LABELS,
  type KnowledgeKind,
  type KnowledgeEntry,
  type CoachAnswer,
} from "./salesCoachTypes";

/**
 * Picks the entries worth putting in front of the model.
 *
 * Plain keyword overlap rather than embeddings: the base is a person's own
 * notes, so it is hundreds of entries, not millions, and a lexical match over
 * that is both good enough and explainable. Embeddings would add a vector
 * column, an indexing step and a second failure mode for no gain at this size.
 */
export async function searchKnowledge(
  admin: AdminClient,
  query: string,
  limit = 8
): Promise<KnowledgeEntry[]> {
  const { data, error } = await admin
    .from("sales_knowledge")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(`Baze znanja ni bilo mogoče prebrati: ${error.message}`);

  const entries = (data ?? []) as unknown as KnowledgeEntry[];
  const words = normalise(query)
    .split(" ")
    .filter((w) => w.length >= 4);
  if (words.length === 0) return entries.slice(0, limit);

  const scored = entries.map((entry) => {
    const haystack = normalise(`${entry.title} ${entry.tags.join(" ")} ${entry.content}`);
    let score = 0;
    for (const word of words) {
      if (haystack.includes(word)) score += 1;
      // A hit in the title says more about relevance than one in the body.
      if (normalise(entry.title).includes(word)) score += 2;
    }
    return { entry, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
}

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[čć]/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * What the user's OWN system can do — so a proposed plan is made of steps that
 * exist as buttons, not of generic advice ("pripravite seznam podjetij") the
 * user would have to translate into the app themselves. A plan whose steps are
 * clickable is a plan that actually gets executed.
 */
const APP_CONTEXT = `ORODJA, KI JIH UPORABNIK ŽE IMA (aplikacija KodaTim) — načrte sestavljaj iz teh korakov:
- Lead skrejp: po SKD kodi in občinah (tudi "regija"/"okolica kraja") najde VSA podjetja v
  registru in jim skrejpa kontakte (email, telefon, direktor, promet). Zna tudi masovno
  obdelavo v ozadju ("npm run worker").
- Tematska kampanja: iz cilja sestavi profil, poišče kandidate v bazi (filtri: SKD, občine,
  promet, s.p./d.o.o.), AI napiše predlogo maila in različico za vsako podjetje; namen je
  lahko prodaja, iskanje podizvajalcev ali partnerjev. "Strategija kanalov" pripravi IG/FB/
  LinkedIn profile, DM predloge in klicno skripto.
- Lead Intelligence: CRM baza vseh leadov s statusi, oznakami in AI analizo na zahtevo.
Kadar korak ustreza enemu od teh orodij, ga POIMENUJ (npr. "V Lead skrejp vpišite 43.330 in
okolico Celja") — ne opisuj ročnega dela, ki ga orodje že opravi.`;

/** How every answer is laid out — the chat renders this subset of Markdown. */
const FORMAT_RULES = `Oblika odgovora ("answer"):
- Strukturirano, ne zid besedila: **krepko** za ključne poudarke, oštevilčeni koraki
  (vsak korak v SVOJI vrstici), alineje z "-" za naštevanje.
- Vsak korak konkreten in preverljiv (kaj, kje v aplikaciji, koliko, do kdaj).
- Nove vrstice med odstavki. Brez tabel in brez HTML.`;

const COACH_PROMPT = `Si prodajni coach za slovenski trg. Odgovarjaš IZKLJUČNO na podlagi priloženih zapisov
iz uporabnikove baze znanja. Odgovori IZKLJUČNO z veljavnim JSON objektom s ključi:
"answer" (niz), "usedIds" (polje nizov — id-ji zapisov, ki si jih uporabil), "outOfScope" (true/false).

${APP_CONTEXT}

${FORMAT_RULES}

Pravila:
- Če priloženi zapisi vprašanja ne pokrivajo, nastavi "outOfScope": true in v "answer" povej,
  česa v bazi ni in kaj naj uporabnik vanjo doda. NE nadomeščaj manjkajočega s splošnimi nasveti.
- Kadar zapisi pokrivajo vprašanje, odgovori konkretno in uporabno: kaj reči, kakšen je naslednji korak.
- Ne izmišljuj si podatkov o strankah, cenah ali rezultatih, ki jih v zapisih ni.
- Vse v slovenščini, vikanje.`;

/**
 * "Grant Cardone mode" changes the CONTRACT, not just the tone. The base coach
 * refuses to answer past the knowledge base, because generic sales advice is
 * available anywhere. With the persona on, the whole point is the mindset —
 * so the base stays the source of FACTS (scripts, prices, cases, and the
 * usedIds citations), while questions the base does not cover get answered
 * from the persona's principles instead of a refusal. outOfScope still gets
 * set, so the UI can keep nudging the user to grow the base.
 */
function cardonePrompt(): string {
  return `Si prodajni coach za slovenski trg.

${CARDONE_PERSONA}

${APP_CONTEXT}

${FORMAT_RULES}

Odgovori IZKLJUČNO z veljavnim JSON objektom s ključi:
"answer" (niz), "usedIds" (polje nizov — id-ji zapisov iz baze, ki si jih uporabil), "outOfScope" (true/false).

Pravila:
- Priloženi zapisi iz uporabnikove baze znanja so tvoj VIR DEJSTEV: skripte, cene, primeri,
  ugovori z odgovori. Kadar pokrivajo vprašanje, gradi na njih in jih navedi v "usedIds".
- Kadar baza vprašanja NE pokriva, vseeno odgovori — iz zgornje miselnosti, konkretno in
  akcijsko. Takrat nastavi "outOfScope": true in v ENI povedi omeni, kateri zapis bi bilo
  vredno dodati v bazo.
- NIKOLI si ne izmišljuj podatkov o strankah, cenah, rezultatih ali obljubah, ki jih ni v zapisih.
- Vse v slovenščini. Do uporabnika neposredno in energično, brez mehčanja; predlagana
  komunikacija do strank vedno z vikanjem in spoštljiva.
- Vsak odgovor zaključi z enim konkretnim korakom za ŠE DANES.`;
}

export async function coachAnswer(
  admin: AdminClient,
  question: string,
  opts: { style?: string | null; context?: string | null; cardone?: boolean } = {}
): Promise<CoachAnswer> {
  const entries = await searchKnowledge(admin, question);

  // Without the persona, an empty base means there is nothing to answer FROM.
  // With it, the persona itself is the answer's backbone, so keep going.
  if (entries.length === 0 && !opts.cardone) {
    return {
      answer:
        "V vaši bazi znanja ni še nič, kar bi pokrivalo to vprašanje. Dodajte skripto, ugovor z odgovorom ali primer iz prakse, pa bom odgovarjal iz tega.",
      used: [],
      outOfScope: true,
    };
  }

  const knowledgeBlock =
    entries.length === 0
      ? "(Baza znanja je še prazna.)"
      : entries
          .map((e) => `id: ${e.id}\nnaslov: ${e.title}\nvrsta: ${KNOWLEDGE_KIND_LABELS[e.kind] ?? e.kind}\n${e.content}`)
          .join("\n\n---\n\n");

  const ai = await chatJSON<{ answer?: string; usedIds?: string[]; outOfScope?: boolean }>(
    opts.cardone ? cardonePrompt() : COACH_PROMPT,
    [
      opts.style && `Slog prodaje, ki ga želi uporabnik: ${opts.style}`,
      opts.context && `Kontekst (kampanja): ${opts.context}`,
      `Zapisi iz baze znanja:\n\n${knowledgeBlock}`,
      `Vprašanje: ${question}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    { temperature: 0.4 }
  );

  const byId = new Map(entries.map((e) => [e.id, e]));
  const used = (ai.usedIds ?? [])
    .map((id) => byId.get(id))
    .filter((e): e is KnowledgeEntry => Boolean(e))
    .map((e) => ({ id: e.id, title: e.title }));

  return {
    answer: (ai.answer ?? "").trim() || "Odgovora ni bilo mogoče sestaviti.",
    used,
    outOfScope: Boolean(ai.outOfScope),
  };
}
