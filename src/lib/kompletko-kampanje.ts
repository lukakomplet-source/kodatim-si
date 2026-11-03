import "server-only";

/**
 * Kompletko kampanje (3. 11. 2026). Luka: »kompletko panik gumbi pa pol recimo kampanija za promoviranje
 * escortov pa potem recimo monitoring kampanija«. Panik gumb teče po svoji poti (Harvey Kompletko: prevozniki,
 * posiljanja) in se tu ne spreminja. Spremstvo tovora in Monitoring sta v pripravi: brez seznamov in mailov,
 * dokler Luka ne potrdi ponudbe; podjetje se doda samo ročno (Harvey Kompletko, harvey/kampanje.py).
 * Nova kampanja je en zapis tukaj (in ključ v KAMPANJE v harvey/kampanje.py) ter zavihek v admin-meni.ts.
 */

const HARVEY_KOMPLETKO = process.env.HARVEY_KOMPLETKO_URL ?? "http://127.0.0.1:5556";

export type KampanjaVPripravi = {
  kljuc: "spremstvo" | "monitoring";
  ime: string;
  kaj: string;
  komu: string[];
  manjka: string[];
};

export const KAMPANJE_V_PRIPRAVI: KampanjaVPripravi[] = [
  {
    kljuc: "spremstvo",
    ime: "Spremstvo tovora",
    kaj: "Spremstvo in varovanje tovornjakov na poti, skupaj s partnerjem, ki ima licenco ZZasV-1.",
    komu: ["špediterji", "logistični centri", "pošiljatelji dragocenega blaga (elektronika, farmacija, tobak)"],
    manjka: [
      "Potrjena ponudba partnerja z licenco ZZasV-1: kaj točno ponudimo in pod kakšnimi pogoji. Kompletko licence nima, tega nikjer ne trdimo.",
      "Seznam ciljnih podjetij (30 do 50 za začetek).",
      "Prvi mail. Gre po isti poti kot panik gumb: osnutek, TEST, tvoj »pošlji«.",
    ],
  },
  {
    kljuc: "monitoring",
    ime: "Monitoring",
    kaj: "Spremljanje tovora in vozil prek nadzornega centra (SOC), ki ob alarmu ukrepa.",
    komu: ["špediterji", "logistični centri", "prevozniki z dragocenim tovorom"],
    manjka: [
      "Potrjeni pogoji nadzornega centra: kaj spremlja, kako hitro ukrepa, cena za nas.",
      "Seznam ciljnih podjetij (30 do 50 za začetek).",
      "Prvi mail. Gre po isti poti kot panik gumb: osnutek, TEST, tvoj »pošlji«.",
    ],
  },
];

export function kampanjaVPripravi(kljuc: string): KampanjaVPripravi | null {
  return KAMPANJE_V_PRIPRAVI.find((k) => k.kljuc === kljuc) ?? null;
}

export type PodjetjeVKampanji = {
  ime: string;
  davcna: string;
  domena: string;
  opomba: string;
  kdo: string;
  dodano: string | null;
};

/** null = Harvey Kompletko ne odgovarja (»ni podatka«, nikoli prazen seznam). */
export async function preberiPodjetjaKampanje(kljuc: string): Promise<PodjetjeVKampanji[] | null> {
  try {
    const r = await fetch(`${HARVEY_KOMPLETKO}/api/kampanje/${encodeURIComponent(kljuc)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { success?: boolean; podjetja?: PodjetjeVKampanji[] };
    return j.success && Array.isArray(j.podjetja) ? j.podjetja : null;
  } catch {
    return null;
  }
}

export async function dodajVKampanjo(
  kljuc: string,
  podatki: { ime: string; davcna: string; spletna: string; opomba: string; kdo: string },
): Promise<{ ok: boolean; napaka?: string }> {
  try {
    const r = await fetch(`${HARVEY_KOMPLETKO}/api/kampanje/${encodeURIComponent(kljuc)}`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(podatki),
    });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; message?: string };
    return j.success ? { ok: true } : { ok: false, napaka: j.message ?? "Ni uspelo." };
  } catch {
    return { ok: false, napaka: "Harvey Kompletko ne odgovarja (5556)." };
  }
}
