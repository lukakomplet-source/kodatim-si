const PRIORITY_TIERS: { rank: number; keywords: string[] }[] = [
  { rank: 1, keywords: ["lastnik", "solastnik", "owner", "co-owner"] },
  { rank: 2, keywords: ["direktor", "director", "izvršni direktor"] },
  { rank: 3, keywords: ["ceo", "chief executive"] },
  { rank: 4, keywords: ["ustanovitelj", "ustanoviteljica", "founder", "co-founder", "soustanovitelj"] },
  { rank: 5, keywords: ["managing director", "poslovodja"] },
  { rank: 6, keywords: ["prodajni direktor", "sales director", "vodja prodaje"] },
  { rank: 7, keywords: ["komercialni direktor", "commercial director"] },
  { rank: 8, keywords: ["business development", "razvoj poslovanja"] },
  { rank: 9, keywords: ["marketing manager", "vodja marketinga"] },
  { rank: 10, keywords: ["office manager", "vodja pisarne"] },
  { rank: 11, keywords: ["splošni kontakt", "general contact", "info", "tajništvo", "receptor"] },
];

export const FALLBACK_PRIORITY_RANK = 999;

/** Scores a job title against the user's exact priority order — used only for display sorting, never for auto-fill eligibility. */
export function scoreJobTitle(title: string | null | undefined): number {
  if (!title) return FALLBACK_PRIORITY_RANK;
  const normalized = title.toLowerCase();
  for (const tier of PRIORITY_TIERS) {
    if (tier.keywords.some((k) => normalized.includes(k))) return tier.rank;
  }
  return FALLBACK_PRIORITY_RANK;
}
