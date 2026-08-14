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
  /** Who created the search — the link to their account-level settings. */
  created_by?: string | null;
  /** The full avto.net-style filter (FiltriVozil jsonb); extras applied below. */
  filtri?: Record<string, unknown> | null;
};

/**
 * The conditions the legacy columns cannot express, read from the jsonb filter.
 * Mirrors src/lib/avtonet/filtriVozil.ts (the worker is a separate package; the
 * file-level comment above already declares this mirror duty).
 */
function dodatniPogoji<Q extends { ilike(c: string, p: string): Q; or(f: string): Q; gte(c: string, v: unknown): Q; lte(c: string, v: unknown): Q; contains(c: string, v: unknown): Q }>(
  q: Q,
  f: Record<string, unknown> | null | undefined
): Q {
  if (!f) return q;
  let out = q;
  const niz = (k: string) => (typeof f[k] === "string" && (f[k] as string).trim() ? (f[k] as string) : null);
  const st = (k: string) => (typeof f[k] === "number" && Number.isFinite(f[k]) ? (f[k] as number) : null);
  const seznam = (k: string) => (Array.isArray(f[k]) ? (f[k] as string[]).filter((x) => typeof x === "string") : []);

  const tip = niz("tip");
  if (tip) out = out.ilike("naziv", `%${tip.replace(/[%,*()]/g, " ").trim()}%`);
  const starosti = seznam("starost");
  if (starosti.length > 0 && starosti.length < 3) out = out.or(starosti.map((s) => `starost.ilike.${s}*`).join(","));
  if (f.oldtimer) out = out.ilike("starost", "%oldtimer%");
  if (f.garancija) out = out.or("starost.ilike.*garanc*,starost.ilike.*jamstvo*");
  const kar = seznam("karoserija");
  if (kar.length > 0) {
    const VZORCI: Record<string, string> = {
      microcar: "*microcar*", kombilimuzina: "*kombilimuzina*", limuzina: "limuzina*",
      karavan: "*karavan*", enoprostorec: "*enoprostorec*", suv: "*suv*", coupe: "*coupe*",
      cabrio: "*cabrio*", pickup: "*pick*",
    };
    const deli = kar.filter((k) => VZORCI[k]).map((k) => `karoserija.ilike.${VZORCI[k]}`);
    if (deli.length) out = out.or(deli.join(","));
  }
  if (f.pogon4x4) out = out.or("pogon.ilike.*4x4*,pogon.ilike.*4wd*");
  const ccmMin = st("ccmMin"); if (ccmMin) out = out.gte("ccm", ccmMin);
  const ccmMax = st("ccmMax"); if (ccmMax) out = out.lte("ccm", ccmMax);
  const barva = niz("barva"); if (barva) out = out.ilike("barva", `%${barva}%`);
  if (f.metalik) out = out.ilike("barva", "%metalik%");
  const vrata = niz("vrata");
  if (vrata === "23") out = out.lte("stevilo_vrat", 3);
  if (vrata === "45") out = out.gte("stevilo_vrat", 4);
  const sedezi = niz("sedezi");
  if (sedezi && Number(sedezi) > 0) out = out.gte("stevilo_sedezev", Number(sedezi));
  const oprema = seznam("oprema");
  if (oprema.length > 0) out = out.contains("oprema_znacilke", oprema);
  const lokacija = niz("lokacija");
  if (lokacija) out = out.ilike("lokacija", `%${lokacija.replace(/[%,*()]/g, " ").trim()}%`);
  return out;
}

/**
 * Where a search's notifications go.
 *
 * Three places are consulted, most specific first: an address typed into this
 * particular search, then the one the owner set under Nastavitve, then the
 * address they sign in with. The point is that setting it once in Nastavitve is
 * enough — a person should not have to repeat their email on every watch they
 * create — while a single watch can still be pointed somewhere else.
 *
 * Never throws: a search whose owner cannot be resolved simply has no recipient,
 * and the sweep carries on.
 */
export async function prejemnik(
  db: Db,
  iskanje: Iskanje
): Promise<{ email: string | null; vir: "spremljanje" | "nastavitve" | "prijava" | "ni" }> {
  if (iskanje.email_obvestila) return { email: iskanje.email_obvestila, vir: "spremljanje" };
  if (!iskanje.created_by) return { email: null, vir: "ni" };

  try {
    const { data: vpis } = await db
      .from("avtonet_uporabniki")
      .select("obvestila_email")
      .eq("uporabnik", iskanje.created_by)
      .maybeSingle();
    const nastavljen = (vpis as { obvestila_email: string | null } | null)?.obvestila_email;
    if (nastavljen) return { email: nastavljen, vir: "nastavitve" };

    const { data: profil } = await db
      .from("profiles")
      .select("email")
      .eq("id", iskanje.created_by)
      .maybeSingle();
    const prijavni = (profil as { email: string | null } | null)?.email;
    if (prijavni) return { email: prijavni, vir: "prijava" };
  } catch {
    // Treated as "no recipient": a lookup failure must not stop the sweep.
  }

  return { email: null, vir: "ni" };
}

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

  // Full-filter watches carry extra conditions the legacy columns cannot hold.
  q = dodatniPogoji(q, iskanje.filtri);

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
<p style="margin-top:22px"><a href="${process.env.SBN_ANALIZA_URL ?? "https://www.kodatim.si/avtonet/analiza"}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:9px;font-weight:600;font-size:14px;">Poglej analizo trga →</a></p>
<p style="color:#a1a1aa;font-size:12px;margin-top:20px">SBN Auto · KodaTim · kodatim.si</p>
</body></html>`;
}

/** Never throws: an email problem must not fail a sweep that collected fine. */
async function sendAlert(iskanje: Iskanje, zadetki: Zadetek[], to: string | null): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.REPORT_EMAIL_FROM;
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

    const { email, vir } = await prejemnik(db, raw);
    const poslano = await sendAlert(raw, zadetki, email);
    outcomes.push({
      iskanje: raw.naziv,
      zadetkov: zadetki.length,
      poslano,
      // The reason names WHERE the address came from, because "not delivered"
      // and "nobody has set an address anywhere" need different fixes.
      razlog: poslano
        ? `poslano na ${email} (vir: ${vir})`
        : email
          ? "posiljanje ni uspelo ali RESEND ni nastavljen"
          : "ne spremljanje ne uporabnik nimata nastavljenega e-naslova",
    });
  }

  return outcomes;
}
