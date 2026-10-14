import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Baza za leade in skrejp podjetij — LOKALNI Postgres, ne oblak.
 *
 * Zakaj svoj odjemalec: leadi so ostali edini del, ki je ob vsakem kliku hodil
 * v Supabase, medtem ko vozila in nepremičnine že tečejo doma. Skrejp podjetij
 * je zato pisal ven vsako vrstico, ki jo je prebral — plačljivo, počasnejše in
 * odvisno od tujega sistema za podatke, ki so v celoti naši.
 *
 * Od 14. 10. 2026 je lokalna tudi prijava (GoTrue v avtonet-db): Supabase
 * oblak je zaklenil projekt zaradi presežene kvote prenosa in nihče ni mogel
 * več v admin. NEXT_PUBLIC_SUPABASE_URL zato kaže na isto lokalno bazo.
 *
 * Če lokalna baza ni nastavljena, pade nazaj na Supabase, tako da stran deluje
 * tudi na razvojnem računalniku brez Dockerja.
 */
export function createLeadClient() {
  const url = process.env.AVTONET_DB_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.AVTONET_DB_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
