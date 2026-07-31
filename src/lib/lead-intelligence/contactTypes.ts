import type { ContactSource } from "@/lib/enrichment/types";

export const CONTACT_STATUSES = ["suggested", "imported", "dismissed"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  suggested: "Predlagan",
  imported: "Uvožen",
  dismissed: "Zavrnjen",
};

export type OutreachSequence = {
  cold_email: { subject: string; body: string };
  linkedin_message: string;
  phone_script: string;
  follow_up_1: string;
  follow_up_2: string;
  generated_at: string;
};

export type IntelLeadContact = {
  id: string;
  lead_id: string;
  full_name: string;
  job_title: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  linkedin_url: string | null;
  contact_page_url: string | null;
  source: ContactSource;
  source_detail: string | null;
  confidence: number;
  priority_rank: number;
  status: ContactStatus;
  is_best_contact: boolean;
  best_contact_reason: string | null;
  outreach_sequence: OutreachSequence | null;
  created_at: string;
  updated_at: string;
  imported_at: string | null;
};

const DIRECTORY_HOSTS = ["ajpes.si", "bizi.si", "gvin.com", "eprs.si", "companywall.si"];

/** Derives a human-readable source label from the real extraction method + hostname — never invents an integration that isn't actually happening. */
export function describeContactSource(contact: Pick<IntelLeadContact, "source" | "source_detail">): string {
  if (contact.source === "manual") return "Ročni vnos";
  if (contact.source === "official_website") return "Uradna spletna stran";

  const host = contact.source_detail?.toLowerCase() ?? "";
  if (host.includes("linkedin.com")) return "LinkedIn (iz iskanja)";
  if (DIRECTORY_HOSTS.some((d) => host.includes(d))) return "Poslovni imenik (iz iskanja)";
  if (host) return `Splet — ${contact.source_detail} (iz iskanja)`;
  return "Splošno spletno iskanje";
}

export type ContactStatusBadge = { emoji: string; label: string };

/** Drives the colored status indicator from the real source/source_detail — never from confidence, since two contacts with the same fixed confidence band can have different real provenance. */
export function contactStatusBadge(contact: Pick<IntelLeadContact, "source" | "source_detail">): ContactStatusBadge {
  if (contact.source === "manual") return { emoji: "⚪", label: "Ročno dodano" };
  if (contact.source === "official_website") return { emoji: "🟢", label: "Potrjeno na spletni strani" };

  const host = contact.source_detail?.toLowerCase() ?? "";
  if (host.includes("linkedin.com")) return { emoji: "🟡", label: "Najdeno na LinkedInu" };
  if (DIRECTORY_HOSTS.some((d) => host.includes(d))) return { emoji: "🔵", label: "Najdeno v registru" };
  return { emoji: "🔴", label: "AI predlog" };
}
