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
    const r = await c.query<{
      date: string;
      job_type: string | null;
      customer_price: number | null;
      extra_charge: number | null;
      customer_name: string | null;
    }>("SELECT date, job_type, customer_price, extra_charge, customer_name FROM escort_jobs WHERE status = 'completed'");
    // Stranka gre na stran samo kot ključ (s1, s2 …): Pregled šteje stranke in ponavljanje, imen ne kaže.
    const kljuci = new Map<string, string>();
    const kljuc = (ime: string | null): string | null => {
      const k = imeStranke(ime);
      if (!k) return null;
      if (!kljuci.has(k)) kljuci.set(k, `s${kljuci.size + 1}`);
      return kljuci.get(k)!;
    };
    return {
      nalogi: r.rows
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map((x) => ({
          datum: String(x.date).slice(0, 10),
          vrsta: x.job_type || "escort",
          // Cena za stranko + dodatni stroški, ki jih zaračunamo naprej; brez cene je znesek neznan (ne 0).
          znesek: x.customer_price === null ? null : Number(x.customer_price) + Number(x.extra_charge ?? 0),
          stranka: kljuc(x.customer_name),
        })),
      napaka: null,
    };
  } catch {
    return { nalogi: null, napaka: "Aplikacija Kompletko trenutno ne odgovarja, zato teh prihodkov ni." };
  } finally {
    await c.end().catch(() => undefined);
  }
}

/** Ime stranke za štetje: male črke, brez pravne oblike (d.o.o., d.d., s.p., GmbH …) in ločil; prazno = null. */
export function imeStranke(ime: string | null): string | null {
  const k = (ime ?? "")
    .toLowerCase()
    // pravna oblika samo kot samostojna beseda (ne »sp« sredi imena)
    .replace(/(?<![\p{L}\p{N}])(d\.?\s*o\.?\s*o|d\.?\s*d|s\.?\s*p|gmbh|ltd|llc|sp\.?\s*z\s*o\.?\s*o|s\.?\s*r\.?\s*o|kft)\.?(?![\p{L}\p{N}])/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return k || null;
}
