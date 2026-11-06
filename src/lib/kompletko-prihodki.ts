import { Client } from "pg";
import type { NalogAplikacije } from "./pregled-vodstvo";

/**
 * Opravljeni nalogi spremstva iz aplikacije Kompletko (prava baza, samo branje) za razdelek Prihodki v Pregledu.
 *
 * Povezava je KOMPLETKO_PRIHODKI_URL (.env.local, uporabnik »pregled_bralec«, ki ga ustvari
 * avtonet-db\PREGLED-BRALEC.ps1): sme brati samo stolpce id, date, status, customer_name, customer_price,
 * extra_charge in job_type v escort_jobs, nič o poti ali tovoru, pisati ne more. Brez povezave ali ob napaki vrne
 * null in razlog (stran pokaže N/A, nikoli 0). Samo za strežnik.
 */
export async function preberiNalogeAplikacije(): Promise<{ nalogi: NalogAplikacije[] | null; napaka: string | null }> {
  const url = process.env.KOMPLETKO_PRIHODKI_URL;
  if (!url) return { nalogi: null, napaka: "Povezava z aplikacijo Kompletko še ni nastavljena." };
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 3_000, statement_timeout: 5_000, query_timeout: 6_000 });
  try {
    await c.connect();
    const r = await c.query<{ date: string; job_type: string | null; customer_price: number | null; extra_charge: number | null }>(
      "SELECT date, job_type, customer_price, extra_charge FROM escort_jobs WHERE status = 'completed'",
    );
    return {
      nalogi: r.rows.map((x) => ({
        datum: String(x.date).slice(0, 10),
        vrsta: x.job_type || "escort",
        // Cena za stranko + dodatni stroški, ki jih zaračunamo naprej; brez cene je znesek neznan (ne 0).
        znesek: x.customer_price === null ? null : Number(x.customer_price) + Number(x.extra_charge ?? 0),
      })),
      napaka: null,
    };
  } catch {
    return { nalogi: null, napaka: "Aplikacija Kompletko trenutno ne odgovarja, zato teh prihodkov ni." };
  } finally {
    await c.end().catch(() => undefined);
  }
}
