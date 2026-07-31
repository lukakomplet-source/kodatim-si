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
  { rank: 10, keywords: ["it vodja", "vodja it", "it manager", "vodja informatike", "cio", "chief information officer"] },
  { rank: 11, keywords: ["nabava", "vodja nabave", "procurement manager", "purchasing manager"] },
  { rank: 12, keywords: ["operativa", "vodja operative", "operations manager", "chief operating officer"] },
  { rank: 13, keywords: ["office manager", "vodja pisarne"] },
  { rank: 14, keywords: ["splošni kontakt", "general contact", "info", "tajništvo", "receptor"] },
];

export const FALLBACK_PRIORITY_RANK = 999;

/** Scores a job title against the priority order — used only for display sorting, never for auto-fill eligibility. */
export function scoreJobTitle(title: string | null | undefined): number {
  if (!title) return FALLBACK_PRIORITY_RANK;
  const normalized = title.toLowerCase();
  for (const tier of PRIORITY_TIERS) {
    if (tier.keywords.some((k) => normalized.includes(k))) return tier.rank;
  }
  return FALLBACK_PRIORITY_RANK;
}

/** Buckets a priority_rank into a 1-5 "decision maker" star rating — derived from the tier list, not a new AI field. */
export function starsForPriorityRank(rank: number): number {
  if (rank <= 4) return 5; // Lastnik, Direktor, CEO, Ustanovitelj
  if (rank <= 7) return 4; // Managing Director, Vodja prodaje/Prodajni direktor, Komercialni direktor
  if (rank <= 9) return 3; // Business development, Vodja marketinga
  if (rank <= 12) return 2; // IT vodja, Nabava, Operativa
  return 1; // Office manager, Splošni kontakt, fallback (999)
}
