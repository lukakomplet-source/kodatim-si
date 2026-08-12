import type { Db } from "./db.js";

/**
 * The daily market summary.
 *
 * Sending is optional on purpose: with no RESEND_API_KEY the report is still
 * computed and logged, and the run says plainly that it was not sent. A
 * missing key must never look like a missing report, and it must never take
 * the collector down — the collecting is the valuable part.
 */

export type DailyReport = {
  datum: string;
  novihOglasov: number;
  izginilih: number;
  prodanih: number;
  znizanihCen: number;
  aktivnih: number;
  najhitrejsi: { model: string; medianaDni: number; vzorec: number }[];
};

/**
 * Statistics are only shown for models with enough observations.
 *
 * Below this, a "median time to sale" is noise dressed up as insight — two
 * cars that happened to vanish quickly would crown a model as the fastest
 * seller on the Slovenian market. Better to show nothing than to be
 * confidently wrong in front of a client.
 */
const MIN_VZOREC = Number(process.env.AVTONET_MIN_VZOREC ?? 20);

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export async function buildDailyReport(db: Db): Promise<DailyReport> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [novi, izginili, prodani, aktivni] = await Promise.all([
    db.from("avtonet_oglasi").select("id", { count: "exact", head: true }).gte("first_seen", since),
    db.from("avtonet_oglasi").select("id", { count: "exact", head: true }).eq("status", "izginil").gte("status_spremenjen", since),
    db.from("avtonet_oglasi").select("id", { count: "exact", head: true }).eq("status", "prodano").gte("status_spremenjen", since),
    db.from("avtonet_oglasi").select("id", { count: "exact", head: true }).eq("status", "aktiven"),
  ]);

  const { data: znizani } = await db
    .from("avtonet_oglasi")
    .select("id, cena_eur, cena_prvotna_eur")
    .not("cena_prvotna_eur", "is", null)
    .not("cena_eur", "is", null);
  const znizanihCen = (znizani ?? []).filter(
    (o) => Number(o.cena_eur) < Number(o.cena_prvotna_eur)
  ).length;

  // Time on the market, per model, from listings that have left. "Left" means
  // gone OR marked sold — and the report says which, rather than calling both
  // a sale.
  const { data: zakljuceni } = await db
    .from("avtonet_oglasi")
    .select("znamka, model, first_seen, status_spremenjen")
    .in("status", ["izginil", "prodano"])
    .not("status_spremenjen", "is", null)
    .limit(5000);

  const perModel = new Map<string, number[]>();
  for (const row of zakljuceni ?? []) {
    const key = [row.znamka, row.model].filter(Boolean).join(" ").trim();
    if (!key) continue;
    const dni =
      (new Date(row.status_spremenjen as string).getTime() - new Date(row.first_seen as string).getTime()) /
      86_400_000;
    if (!Number.isFinite(dni) || dni < 0) continue;
    const list = perModel.get(key) ?? [];
    list.push(dni);
    perModel.set(key, list);
  }

  const najhitrejsi = [...perModel.entries()]
    .filter(([, dni]) => dni.length >= MIN_VZOREC)
    .map(([model, dni]) => ({ model, medianaDni: Math.round(medianOf(dni) * 10) / 10, vzorec: dni.length }))
    .sort((a, b) => a.medianaDni - b.medianaDni)
    .slice(0, 10);

  return {
    datum: new Date().toISOString().slice(0, 10),
    novihOglasov: novi.count ?? 0,
    izginilih: izginili.count ?? 0,
    prodanih: prodani.count ?? 0,
    znizanihCen,
    aktivnih: aktivni.count ?? 0,
    najhitrejsi,
  };
}

/** Where "Poglej analizo trga" points. Overridable, defaults to the live site. */
const ANALIZA_URL = process.env.SBN_ANALIZA_URL ?? "https://www.kodatim.si/avtonet/analiza";

export function renderReportHtml(r: DailyReport): string {
  const statRow = (n: number | string, label: string) =>
    `<tr>
      <td style="padding:9px 0;border-bottom:1px solid #f0f0f2;font-size:22px;font-weight:800;color:#4f46e5;width:90px;">${n}</td>
      <td style="padding:9px 0;border-bottom:1px solid #f0f0f2;font-size:14px;color:#3f3f46;">${label}</td>
    </tr>`;

  const lestvica =
    r.najhitrejsi.length > 0
      ? r.najhitrejsi
          .map(
            (m, i) =>
              `<tr>
                <td style="padding:8px 12px;border-bottom:1px solid #f0f0f2;font-size:14px;">${i + 1}. ${m.model}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #f0f0f2;font-size:14px;text-align:right;font-weight:700;color:#18181b;">${m.medianaDni} dni</td>
                <td style="padding:8px 12px;border-bottom:1px solid #f0f0f2;font-size:12px;text-align:right;color:#a1a1aa;">${m.vzorec} oglasov</td>
              </tr>`
          )
          .join("")
      : `<tr><td style="padding:12px;font-size:13px;color:#71717a;">Za zanesljivo statistiko je potrebnih vsaj ${MIN_VZOREC} zaključenih oglasov na model. Zbiranje še teče.</td></tr>`;

  return `<!doctype html><html lang="sl"><body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7;">
  <div style="padding:24px 28px;background:linear-gradient(135deg,#4f46e5,#7c3aed);">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle;">
        <div style="width:44px;height:44px;border-radius:11px;background:rgba(255,255,255,.18);text-align:center;line-height:44px;font-size:22px;">🚗</div>
      </td>
      <td style="vertical-align:middle;padding-left:14px;">
        <div style="font-size:20px;font-weight:800;letter-spacing:-.02em;color:#ffffff;">SBN Auto</div>
        <div style="font-size:11px;letter-spacing:.06em;color:#e0e7ff;margin-top:2px;">SLOVENSKI TRG VOZIL · dnevni pregled</div>
      </td>
    </tr></table>
  </div>

  <div style="padding:26px 28px;">
    <p style="margin:0 0 16px;font-size:13px;color:#a1a1aa;">${r.datum}</p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      ${statRow(r.novihOglasov, "novih oglasov v zadnjih 24 h")}
      ${statRow(r.aktivnih.toLocaleString("sl-SI"), "aktivnih oglasov v bazi")}
      ${statRow(r.izginilih, "izginilo z oglasnika")}
      ${statRow(r.prodanih, "označenih kot prodano")}
      ${statRow(r.znizanihCen, "oglasov z znižano ceno")}
    </table>

    <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#a1a1aa;">
      „Izginilo" ni isto kot „prodano" — oglas je lahko umaknjen. Kot prodano šteje le tisto, kar vir izrecno označi.
    </p>

    <h3 style="margin:26px 0 8px;font-size:15px;color:#18181b;">Najhitreje zapuščajo oglasnik</h3>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
      ${lestvica}
    </table>

    <div style="margin-top:26px;text-align:center;">
      <a href="${ANALIZA_URL}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:9px;font-weight:600;font-size:15px;">Poglej celotno analizo trga →</a>
    </div>
  </div>

  <div style="background:#fafafa;border-top:1px solid #e4e4e7;padding:16px 28px;font-size:11px;color:#a1a1aa;line-height:1.5;">
    SBN Auto · KodaTim · <a href="https://www.kodatim.si" style="color:#a1a1aa;">kodatim.si</a><br>
    Podatki so zbrani z Avto.neta ob upoštevanju njihovega robots.txt.
  </div>
</div>
</body></html>`;
}

/** Sends the report if a key is configured. Never throws. */
export async function sendDailyReport(report: DailyReport): Promise<"poslano" | "preskoceno" | "napaka"> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.REPORT_EMAIL_TO;
  const from = process.env.REPORT_EMAIL_FROM;

  if (!key || !to || !from) return "preskoceno";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: to.split(",").map((t) => t.trim()),
        subject: `SBN Auto — dnevni pregled ${report.datum}`,
        html: renderReportHtml(report),
      }),
    });
    return res.ok ? "poslano" : "napaka";
  } catch {
    return "napaka";
  }
}
