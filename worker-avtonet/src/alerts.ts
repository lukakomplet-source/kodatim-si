import type { Db } from "./db.js";

/**
 * Saved searches: the second use of the same collected data.
 *
 * After every sweep, each active search asks the database one question — has
 * anything NEW turned up that matches? — and the answer goes out by email
 * once. The `avtonet_obvestila` table has a unique key on (search, listing),
 * so a repeated sweep can never send the same car twice, even if the process
 * crashes between sending and recording.
 */

export type Iskanje = {
  id: string;
  naziv: string;
  znamka: string | null;
  model: string | null;
  letnik_min: number | null;
  letnik_max: number | null;
  km_min: number | null;
  km_max: number | null;
  moc_min: number | null;
  moc_max: number | null;
  cena_min: number | null;
  cena_max: number | null;
  gorivo: string | null;
  menjalnik: string | null;
  /** vsi | dealer | zasebnik */
  prodajalec_filter: "vsi" | "dealer" | "zasebnik" | null;
  samo_dealerji: boolean;
  email_obvestila: string | null;
};

/** The seller condition, tolerating rows written before the column existed. */
function prodajalecPogoj(iskanje: Iskanje): "vsi" | "dealer" | "zasebnik" {
  if (iskanje.prodajalec_filter) return iskanje.prodajalec_filter;
  return iskanje.samo_dealerji ? "dealer" : "vsi";
}

export type Zadetek = {
  id: string;
  avtonet_id: string;
  naziv: string | null;
  znamka: string | null;
  letnik: number | null;
  km: number | null;
  km_moci: number | null;
  cena_eur: number | null;
  prodajalec: string | null;
  /** null until the advert's own page has been read — and sometimes after. */
  je_dealer: boolean | null;
  url: string;
};

export type AlertOutcome = {
  iskanje: string;
  zadetkov: number;
  poslano: boolean;
  razlog?: string;
};

/**
 * Listings matching one search that have not been reported for it yet.
 *
 * Filtering happens in SQL rather than in memory: the table grows to hundreds
 * of thousands of rows and pulling them all into the worker to filter would
 * turn a cheap query into a memory problem.
 */
export async function findMatches(db: Db, iskanje: Iskanje, limit = 25): Promise<Zadetek[]> {
  let q = db
    .from("avtonet_oglasi")
    .select("id, avtonet_id, naziv, znamka, letnik, km, km_moci, cena_eur, prodajalec, je_dealer, url")
    .eq("status", "aktiven")
    .order("first_seen", { ascending: false })
    .limit(limit * 4);

  if (iskanje.znamka) q = q.ilike("znamka", iskanje.znamka);
  if (iskanje.model) q = q.ilike("naziv", `%${iskanje.model}%`);
  if (iskanje.letnik_min !== null) q = q.gte("letnik", iskanje.letnik_min);
  if (iskanje.letnik_max !== null) q = q.lte("letnik", iskanje.letnik_max);
  if (iskanje.km_min !== null) q = q.gte("km", iskanje.km_min);
  if (iskanje.km_max !== null) q = q.lte("km", iskanje.km_max);
  if (iskanje.moc_min !== null) q = q.gte("km_moci", iskanje.moc_min);
  if (iskanje.moc_max !== null) q = q.lte("km_moci", iskanje.moc_max);
  if (iskanje.cena_min !== null) q = q.gte("cena_eur", iskanje.cena_min);
  if (iskanje.cena_max !== null) q = q.lte("cena_eur", iskanje.cena_max);
  // Stored as the single lowercase word the results row carries — "diesel",
  // "bencinski", "hibridni" — so a prefix match is what fits the data.
  if (iskanje.gorivo) q = q.ilike("gorivo", `${iskanje.gorivo}%`);
  if (iskanje.menjalnik) q = q.ilike("menjalnik", `${iskanje.menjalnik}%`);

  // The seller condition is applied, but only where the seller is actually
  // known. Seller type is not readable from the results row — it exists on the
  // advert's own page, and even there not always — so a plain `eq` would
  // silently discard every match whose detail page has not been read yet.
  // Instead the unknowns are KEPT and the notification says the seller could
  // not be verified. An honest note beats a filter that quietly hides most of
  // the market.
  const pogoj = prodajalecPogoj(iskanje);
  if (pogoj !== "vsi") {
    q = pogoj === "dealer" ? q.or("je_dealer.is.true,je_dealer.is.null") : q.or("je_dealer.is.false,je_dealer.is.null");
  }

  const { data, error } = await q;
  if (error) throw new Error(`Iskanje zadetkov ni uspelo: ${error.message}`);
  const rows = (data ?? []) as unknown as Zadetek[];
  if (rows.length === 0) return [];

  // Drop everything already reported for this search.
  const { data: sent } = await db
    .from("avtonet_obvestila")
    .select("oglas_id")
    .eq("iskanje_id", iskanje.id)
    .in("oglas_id", rows.map((r) => r.id));
  const seen = new Set((sent ?? []).map((s) => s.oglas_id as string));

  return rows.filter((r) => !seen.has(r.id)).slice(0, limit);
}

function eur(v: number | null): string {
  return v === null ? "?" : `${Math.round(v).toLocaleString("sl-SI")} €`;
}

export function renderAlertHtml(iskanje: Iskanje, zadetki: Zadetek[]): string {
  const neznanProdajalec =
    prodajalecPogoj(iskanje) !== "vsi" && zadetki.some((z) => z.je_dealer === null && !z.prodajalec);

  const rows = zadetki
    .map(
      (z) => `<tr>
  <td style="padding:8px 12px"><a href="${z.url}" style="color:#18181b;font-weight:600">${z.naziv ?? z.avtonet_id}</a></td>
  <td style="padding:8px 12px">${z.letnik ?? "?"}</td>
  <td style="padding:8px 12px">${z.km === null ? "?" : z.km.toLocaleString("sl-SI") + " km"}</td>
  <td style="padding:8px 12px">${z.km_moci ?? "?"} KM</td>
  <td style="padding:8px 12px;font-weight:600">${eur(z.cena_eur)}</td>
</tr>`
    )
    .join("");

  return `<!doctype html><html lang="sl"><body style="font-family:system-ui,sans-serif;color:#18181b">
<h2>Novi avtomobili za iskanje „${iskanje.naziv}"</h2>
<p style="color:#71717a">Najdenih ${zadetki.length} novih oglasov, ki ustrezajo vašim pogojem.</p>
<table cellspacing="0" style="border-collapse:collapse;font-size:14px">
  <tr style="background:#f4f4f5"><th align="left" style="padding:8px 12px">Vozilo</th><th align="left" style="padding:8px 12px">Letnik</th><th align="left" style="padding:8px 12px">Km</th><th align="left" style="padding:8px 12px">Moč</th><th align="left" style="padding:8px 12px">Cena</th></tr>
  ${rows}
</table>
${
  neznanProdajalec
    ? `<p style="color:#a16207;font-size:13px;margin-top:16px">Opomba: pri nekaterih oglasih vrsta prodajalca še ni znana (na seznamu oglasov ni objavljena). Teh nismo izpustili — preverite v samem oglasu.</p>`
    : ""
}
<p style="color:#a1a1aa;font-size:12px;margin-top:20px">SBN Auto - KodaTim.si</p>
</body></html>`;
}

/** Never throws: an email problem must not fail a sweep that collected fine. */
async function sendAlert(iskanje: Iskanje, zadetki: Zadetek[]): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.REPORT_EMAIL_FROM;
  const to = iskanje.email_obvestila;
  if (!key || !from || !to) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `${zadetki.length} nov${zadetki.length === 1 ? "" : "ih"} oglas${zadetki.length === 1 ? "" : "ov"}: ${iskanje.naziv}`,
        html: renderAlertHtml(iskanje, zadetki),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Runs every active saved search and reports what happened to each.
 *
 * Matches are recorded BEFORE the send is judged: a listing marked as
 * reported but not emailed costs one missed notification, while the reverse —
 * emailing and failing to record — would re-send the same cars on every sweep
 * until someone noticed. Of the two failure modes, the quiet one is kinder.
 */
export async function runSavedSearches(db: Db): Promise<AlertOutcome[]> {
  const { data, error } = await db.from("avtonet_iskanja").select("*").eq("aktivno", true);
  if (error) throw new Error(`Branje shranjenih iskanj ni uspelo: ${error.message}`);

  const outcomes: AlertOutcome[] = [];

  for (const raw of (data ?? []) as unknown as Iskanje[]) {
    const zadetki = await findMatches(db, raw);
    if (zadetki.length === 0) {
      outcomes.push({ iskanje: raw.naziv, zadetkov: 0, poslano: false, razlog: "ni novih zadetkov" });
      continue;
    }

    await db.from("avtonet_obvestila").insert(
      zadetki.map((z) => ({ iskanje_id: raw.id, oglas_id: z.id }))
    );

    const poslano = await sendAlert(raw, zadetki);
    outcomes.push({
      iskanje: raw.naziv,
      zadetkov: zadetki.length,
      poslano,
      razlog: poslano
        ? undefined
        : raw.email_obvestila
          ? "posiljanje ni uspelo ali RESEND ni nastavljen"
          : "iskanje nima nastavljenega e-naslova",
    });
  }

  return outcomes;
}
