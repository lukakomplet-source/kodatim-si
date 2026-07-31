import type { ContactSource } from "@/lib/enrichment/types";

export const CONTACT_STATUSES = ["suggested", "imported", "dismissed"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  suggested: "Predlagan",
  imported: "Uvožen",
  dismissed: "Zavrnjen",
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
