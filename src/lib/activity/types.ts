// Shared, cross-module timeline (backed by intel_lead_activity, which is
// keyed by lead_id — Promocije targets already reference the same lead via
// promo_campaign_targets.lead_id, so both modules read/write this one table.
export const ACTIVITY_TYPES = [
  // Lead Intelligence (pre-existing)
  "note",
  "status_change",
  "contacted",
  "email_sent",
  "call",
  "import",
  "enrichment",
  // Promocije (added this phase)
  "stage_changed",
  "field_visit",
  "social_outreach",
  "ai_company_analysis",
  "ai_proposal_generated",
  // Seams for a later phase (email webhooks) — unused for now
  "email_opened",
  "email_clicked",
  "email_replied",
  // AI Discovery enrichment pipeline (added this phase)
  "enrichment_started",
  "enrichment_step",
  "enrichment_completed",
  "enrichment_failed",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type Activity = {
  id: string;
  lead_id: string;
  type: ActivityType;
  content: string | null;
  created_by: string | null;
  created_at: string;
};

export type ActivityWithAuthor = Activity & {
  author: { full_name: string | null; email: string } | null;
};

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  note: "Opomba",
  status_change: "Sprememba statusa",
  contacted: "Kontaktiran",
  email_sent: "Poslan e-mail",
  call: "Klic",
  import: "Uvoz",
  enrichment: "AI obogatitev",
  stage_changed: "Sprememba faze",
  field_visit: "Terenski obisk",
  social_outreach: "Družbena omrežja",
  ai_company_analysis: "AI analiza podjetja",
  ai_proposal_generated: "AI predlog ponudbe",
  email_opened: "E-mail odprt",
  email_clicked: "Klik na e-mail",
  email_replied: "Odgovor na e-mail",
  enrichment_started: "Obogatitev začeta",
  enrichment_step: "Korak obogatitve",
  enrichment_completed: "Obogatitev končana",
  enrichment_failed: "Obogatitev neuspešna",
};
