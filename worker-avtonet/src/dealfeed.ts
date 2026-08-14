import type { Db } from "./db.js";

/**
 * The daily Deal Feed email: the top under-priced active adverts, computed by
 * statistika.ts, rendered in the same SBN dress as the daily report. Numbers
 * are read from avtonet_statistika — this file formats and sends, nothing more.
 */

type Deal = {
  avtonetId: string; url: string; naziv: string | null; model: string;
  cena: number; medianaKohorte: number; odstopanjePct: number; vzorec: number;
  letnik: number | null; km: number | null; oglediNaDan: number | null;
  delez14: number | null; kmAnomalija: boolean; tocke: number; razlogi: string[];
};

function eur(v: number | null): string {
  return v === null ? "—" : `${Math.round(v).toLocaleString("sl-SI")} €`;
}

export function renderDealFeedHtml(deals: Deal[], datum: string): string {
  const vrstice = deals
    .map(
      (d, i) => `<tr>
  <td style="padding:10px 12px;vertical-align:top;color:#a1a1aa;font-weight:600">${i + 1}</td>
  <td style="padding:10px 12px;vertical-align:top">
    <a href="${d.url}" style="color:#18181b;font-weight:600;text-decoration:none">${d.naziv ?? d.model}</a><br>
    <span style="color:#71717a;font-size:12px">${d.letnik ?? "?"} · ${d.km === null ? "?" : d.km.toLocaleString("sl-SI") + " km"}</span><br>
    <span style="color:#52525b;font-size:12px">${d.razlogi.join(" · ")}</span>
  </td>
  <td style="padding:10px 12px;vertical-align:top;text-align:right;white-space:nowrap">
    <span style="font-weight:700;color:#18181b">${eur(d.cena)}</span><br>
    <span style="color:#059669;font-size:12px;font-weight:600">−${Math.round(d.odstopanjePct)} % pod mediano</span><br>
    <span style="color:#a1a1aa;font-size:11px">mediana ${eur(d.medianaKohorte)}</span>
  </td>
</tr>`
    )
    .join("");

  return `<!doctype html><html lang="sl"><body style="margin:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;color:#18181b">
<div style="max-width:640px;margin:0 auto;padding:24px 16px">
  <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:16px 16px 0 0;padding:22px 24px">
    <p style="margin:0;color:#c7d2fe;font-size:12px;letter-spacing:.08em;text-transform:uppercase">SBN Auto · Deal Feed</p>
    <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px">🎯 Top posli danes — ${datum}</h1>
  </div>
  <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:8px 4px 16px">
    <table cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">${vrstice}</table>
    <p style="margin:14px 12px 0;color:#a1a1aa;font-size:11px">
      „Pod mediano" pomeni pod sredinsko zahtevano ceno primerljivih aktivnih oglasov — ne pod prodajno ceno, te vir ne objavi.
      Ponovne objave istega vozila so izločene. Preverite vsak oglas pri viru.
    </p>
    <p style="margin:16px 12px 0"><a href="https://www.kodatim.si/avtonet/posli" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:9px;font-weight:600;font-size:14px">Odpri vse posle →</a></p>
  </div>
  <p style="margin:14px 0 0;text-align:center;color:#a1a1aa;font-size:12px">SBN Auto · KodaTim · kodatim.si</p>
</div>
</body></html>`;
}

/** Sends today's feed. Never throws; email trouble must not touch the collector. */
export async function posljiDealFeed(db: Db): Promise<"poslano" | "preskoceno" | "napaka"> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.REPORT_EMAIL_FROM;
  const to = process.env.REPORT_EMAIL_TO;
  if (!key || !from || !to) return "preskoceno";

  try {
    const { data } = await db.from("avtonet_statistika").select("podatki").eq("kljuc", "deal_feed").maybeSingle();
    const deals = ((data as { podatki: { deals: Deal[] } } | null)?.podatki?.deals ?? []).slice(0, 10);
    if (deals.length === 0) return "preskoceno";

    const datum = new Date().toLocaleDateString("sl-SI", { day: "numeric", month: "long" });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `🎯 SBN Deal Feed — ${deals.length} poslov (${datum})`,
        html: renderDealFeedHtml(deals, datum),
      }),
    });
    return res.ok ? "poslano" : "napaka";
  } catch {
    return "napaka";
  }
}
