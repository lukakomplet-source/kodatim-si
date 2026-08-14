import "server-only";
import { createAvtonetClient } from "./db";

/**
 * Reading the precomputed aggregates (avtonet_statistika, written by the
 * worker's statistika.ts after every research). Pages read JSON and render;
 * no page ever recomputes what the worker already knows.
 */
export async function preberiStatistike(
  kljuci: string[]
): Promise<Record<string, unknown | null>> {
  const db = createAvtonetClient();
  const out: Record<string, unknown | null> = {};
  for (const k of kljuci) out[k] = null;
  const { data } = await db
    .from("avtonet_statistika")
    .select("kljuc, podatki, izracunano")
    .in("kljuc", kljuci);
  for (const r of (data ?? []) as { kljuc: string; podatki: unknown }[]) {
    out[r.kljuc] = r.podatki;
  }
  return out;
}
