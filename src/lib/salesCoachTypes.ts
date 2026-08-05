/**
 * Shapes and labels shared by the server logic and the browser UI.
 *
 * Separate from salesCoach.ts because that file is `server-only` — it reaches
 * the database and the model — and a client component importing a label from it
 * would drag the whole server module into the browser bundle.
 */

export const KNOWLEDGE_KINDS = ["note", "script", "objection", "case_study", "offer"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export const KNOWLEDGE_KIND_LABELS: Record<KnowledgeKind, string> = {
  note: "Zapisek",
  script: "Skripta",
  objection: "Ugovor in odgovor",
  case_study: "Primer iz prakse",
  offer: "Ponudba",
};

export type KnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  kind: KnowledgeKind;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type CoachAnswer = {
  answer: string;
  /** Entries the answer leans on, so a claim can be traced back. */
  used: { id: string; title: string }[];
  /** True when the base had nothing relevant — the UI says so plainly. */
  outOfScope: boolean;
};
