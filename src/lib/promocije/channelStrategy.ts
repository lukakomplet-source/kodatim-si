import "server-only";
import { chatJSON } from "@/lib/openai";
import { CARDONE_PERSONA } from "@/lib/cardonePersona";
import { CAMPAIGN_KIND_CONTEXT, type CampaignKind } from "./targeting";

/**
 * The campaign beyond email: what to do on Instagram/Facebook/LinkedIn, how to
 * call, and in what order — for THIS theme, not in general.
 *
 * The app cannot open social accounts; what it can do is hand over everything
 * an account needs on day one (handle ideas, bio, first posts, DM template) as
 * copy-paste blocks, so "naredi tematski profil" becomes ten minutes of
 * clicking instead of an afternoon of staring at empty fields. The call script
 * is structured — opening, qualifying questions, objections, goal — because a
 * list of tips is not something you can read from mid-call.
 */

export type SocialPlan = {
  channel: string;
  handleIdeas: string[];
  bio: string;
  firstPosts: string[];
  dmTemplate: string;
  tip: string;
};

export type CallScript = {
  opening: string;
  qualifyingQuestions: string[];
  objections: { objection: string; answer: string }[];
  goal: string;
};

export type ChannelStrategy = {
  overview: string;
  /** Channel names in the order worth working them, with a reason each. */
  channelOrder: { channel: string; why: string }[];
  socials: SocialPlan[];
  emailPlan: { approach: string; followUpDays: number[] };
  calling: CallScript;
  kpis: string[];
};

const PROMPT = `Si strateg za B2B kampanje na slovenskem trgu. Za opisano kampanjo sestavi
IZVEDLJIVO strategijo kanalov. Odgovori IZKLJUČNO z veljavnim JSON objektom oblike:

{
  "overview": "<2-3 povedi: bistvo pristopa za to temo>",
  "channelOrder": [{ "channel": "<ime>", "why": "<ena poved>" }],
  "socials": [
    {
      "channel": "Instagram" | "Facebook" | "LinkedIn",
      "handleIdeas": ["<3-5 predlogov imena profila>"],
      "bio": "<opis profila, do 150 znakov>",
      "firstPosts": ["<3-5 idej za prve objave, vsaka ena poved>"],
      "dmTemplate": "<predloga zasebnega sporočila, 3-5 povedi>",
      "tip": "<en konkreten nasvet za ta kanal in to temo>"
    }
  ],
  "emailPlan": { "approach": "<2 povedi o pristopu>", "followUpDays": [3, 7, 14] },
  "calling": {
    "opening": "<prvi stavki klica, dobesedno>",
    "qualifyingQuestions": ["<4-6 kvalifikacijskih vprašanj>"],
    "objections": [{ "objection": "<ugovor>", "answer": "<odgovor>" }],
    "goal": "<en stavek: kaj je cilj klica>"
  },
  "kpis": ["<3-5 merljivih kazalnikov za to kampanjo>"]
}

Pravila:
- Vse mora biti KONKRETNO za opisano temo in namen — nobenih splošnih marketinških fraz.
- Imena profilov: slovenska, kratka, brez zasedenosti ne ugibaj (ne trdi, da so prosta).
- DM in klic: vikanje, spoštljivo, jasen naslednji korak.
- Ne izmišljuj si podatkov, cen ali rezultatov.
- Vse v slovenščini.`;

export async function buildChannelStrategy(
  theme: string,
  kind: CampaignKind,
  opts: { senderContext?: string; knowledge?: string; cardone?: boolean } = {}
): Promise<ChannelStrategy> {
  const system = opts.cardone
    ? `${PROMPT}\n\nMISELNOST, s katero svetuješ (AI posnemanje javnih načel Granta Cardona):\n${CARDONE_PERSONA}`
    : PROMPT;

  const ai = await chatJSON<Partial<ChannelStrategy>>(
    system,
    [
      CAMPAIGN_KIND_CONTEXT[kind],
      `Cilj kampanje: ${theme}`,
      opts.senderContext && `O pošiljatelju: ${opts.senderContext}`,
      opts.knowledge && `Lastno prodajno znanje:\n${opts.knowledge}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    { temperature: 0.5 }
  );

  const str = (v: unknown, fallback = "") => (typeof v === "string" ? v.trim() : fallback);
  const strList = (v: unknown, max: number) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, max) : [];

  return {
    overview: str(ai.overview),
    channelOrder: Array.isArray(ai.channelOrder)
      ? ai.channelOrder
          .map((c) => ({ channel: str((c as { channel?: string })?.channel), why: str((c as { why?: string })?.why) }))
          .filter((c) => c.channel)
          .slice(0, 6)
      : [],
    socials: Array.isArray(ai.socials)
      ? ai.socials
          .map((s) => {
            const raw = s as Partial<SocialPlan>;
            return {
              channel: str(raw.channel),
              handleIdeas: strList(raw.handleIdeas, 5),
              bio: str(raw.bio),
              firstPosts: strList(raw.firstPosts, 5),
              dmTemplate: str(raw.dmTemplate),
              tip: str(raw.tip),
            };
          })
          .filter((s) => s.channel)
          .slice(0, 4)
      : [],
    emailPlan: {
      approach: str((ai.emailPlan as { approach?: string } | undefined)?.approach),
      followUpDays: Array.isArray((ai.emailPlan as { followUpDays?: unknown[] } | undefined)?.followUpDays)
        ? ((ai.emailPlan as { followUpDays: unknown[] }).followUpDays
            .map((d) => Number(d))
            .filter((d) => Number.isFinite(d) && d > 0)
            .slice(0, 6) as number[])
        : [3, 7, 14],
    },
    calling: {
      opening: str((ai.calling as Partial<CallScript> | undefined)?.opening),
      qualifyingQuestions: strList((ai.calling as Partial<CallScript> | undefined)?.qualifyingQuestions, 6),
      objections: Array.isArray((ai.calling as Partial<CallScript> | undefined)?.objections)
        ? ((ai.calling as CallScript).objections ?? [])
            .map((o) => ({ objection: str(o?.objection), answer: str(o?.answer) }))
            .filter((o) => o.objection && o.answer)
            .slice(0, 6)
        : [],
      goal: str((ai.calling as Partial<CallScript> | undefined)?.goal),
    },
    kpis: strList(ai.kpis, 5),
  };
}
