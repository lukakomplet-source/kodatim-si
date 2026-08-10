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

export function renderReportHtml(r: DailyReport): string {
  const vrstice =
    r.najhitrejsi.length > 0
      ? r.najhitrejsi
          .map(
            (m, i) =>
              `<tr><td>${i + 1}. ${m.model}</td><td align="right">${m.medianaDni} dni</td><td align="right">${m.vzorec} oglasov</td></tr>`
          )
          .join("")
      : `<tr><td colspan="3">Za zanesljivo statistiko je potrebnih vsaj ${MIN_VZOREC} zaključenih oglasov na model. Zbiranje še teče.</td></tr>`;

  return `<!doctype html><html lang="sl"><body style="font-family:system-ui,sans-serif;color:#18181b">
<h2>SBN Auto — dnevni pregled trga</h2>
<p style="color:#71717a">${r.datum}</p>
<ul>
  <li><strong>${r.novihOglasov}</strong> novih oglasov (24 h)</li>
  <li><strong>${r.aktivnih}</strong> aktivnih oglasov v bazi</li>
  <li><strong>${r.izginilih}</strong> izginilo z oglasnika</li>
  <li><strong>${r.prodanih}</strong> označenih kot prodano</li>
  <li><strong>${r.znizanihCen}</strong> oglasov z znižano ceno</li>
</ul>
<p style="color:#71717a;font-size:13px">„Izginilo" ni isto kot „prodano" — oglas je lahko umaknjen. Kot prodano šteje le tisto, kar vir izrecno označi.</p>
<h3>Najhitreje zapuščajo oglasnik</h3>
<table cellpadding="6" style="border-collapse:collapse">${vrstice}</table>
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
