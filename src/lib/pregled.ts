import "server-only";
import type { PregledPodatki } from "@/lib/pregled-racun";

const HARVEY_KOMPLETKO = process.env.HARVEY_KOMPLETKO_URL ?? "http://127.0.0.1:5556";

/**
 * Dogodki za Pregled iz Harveyja Kompletko (GET /api/pregled, samo branje).
 * null = Harvey ne odgovarja; 404 = Harvey še teče brez te poti (pred ponovnim zagonom).
 */
export async function preberiPregled(): Promise<{ podatki: PregledPodatki | null; status: number }> {
  try {
    const r = await fetch(`${HARVEY_KOMPLETKO}/api/pregled`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return { podatki: null, status: r.status };
    const data = (await r.json()) as PregledPodatki;
    if (!data || !Array.isArray(data.dogodki) || typeof data.zdaj !== "string") return { podatki: null, status: 502 };
    return { podatki: data, status: 200 };
  } catch {
    return { podatki: null, status: 0 };
  }
}
