import type { Db } from "./db.js";

/**
 * The daily Deal Feed email: the top under-priced active adverts, computed by
 * statistika.ts, rendered in the same SBN dress as the daily report. Numbers
 * are read from avtonet_statistika — this file formats and sends, nothing more.
 */

type Deal = {
  avtonetId: string; url: string; naziv: string | null; model: string;
  cena: number; odstopanjePct: number; vzorec: number;
  letnik: number | null; km: number | null; oglediNaDan: number | null;
  delez14: number | null; kmAnomalija: boolean; tocke: number; razlogi: string[];
  /**
   * Trzna vrednost, kot jo izracuna v2 (dealfeed2.ts).
   *
   * Prej je bilo tu `medianaKohorte`. Dokler je racunal v1, je bilo polje
   * polno; v2 ga ne pise vec, zato je bilo pri VSEH poslih null in porocilo je
   * 23. 9. 2026 pri vsaki vrstici izpisalo "mediana NaN EUR" (posnetek zaslona
   * uporabnika). Stara polja pustimo neobvezna samo zato, da starejsi zapisi v
   * avtonet_statistika ne razbijejo izrisa.
   */
  trznaVrednost?: number | null;
  medianaTrgovcev?: number | null;
  medianaKohorte?: number | null;
  /** true = trgovec, false = fizicna oseba, null = ne vemo. */
  jeDealer?: boolean | null;
};

/**
 * Kaj v porocilu pomeni "mediana".
 *
 * Vrstni red je namenski: trzna vrednost je tisto, s cimer v2 primerja ceno,
 * mediana trgovcev je najblizji nadomestek, ce je prva kdaj prazna, staro polje
 * pa je zadnja bergla za zapise izpred prehoda na v2.
 */
function primerjalnaVrednost(d: Deal): number | null {
  return d.trznaVrednost ?? d.medianaTrgovcev ?? d.medianaKohorte ?? null;
}

function eur(v: number | null): string {
  return v === null ? "—" : `${Math.round(v).toLocaleString("sl-SI")} €`;
}

/**
 * The deals as a block that can live inside another email.
 *
 * The feed used to be its own message. Two mails a day for one market — the
 * numbers and the opportunities — is one mail too many, and they are read at the
 * same moment anyway, so the table moved into the daily report.
 */
export function odsekPoslov(deals: Deal[], odVseh?: number): string {
  // Prazen odsek je doslej pomenil, da iz poste tiho izgine cela tabela. Po
  // uvedbi filtra na fizicne osebe je to verjetnejse (23. 9. 2026: 45 od 343
  // poslov), pri okvari razclenjevalnika prodajalca pa bi bilo trajno in
  // neopazno. Zato tudi prazen izid nekaj pove.
  if (deals.length === 0) {
    return `<div style="background:#ffffff;border-radius:16px;padding:16px;margin-top:16px">
  <h2 style="margin:0 0 4px;font-size:17px;color:#18181b">🎯 Top posli danes — samo fizične osebe</h2>
  <p style="margin:0;color:#71717a;font-size:12px">Danes ni nobenega posla fizične osebe${
    typeof odVseh === "number" ? ` (pregledanih ${odVseh} poslov, vsi od trgovcev)` : ""
  }.</p>
</div>`;
  }
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
    <span style="color:#059669;font-size:12px;font-weight:600">−${Math.round(d.odstopanjePct)} % pod tržno vrednostjo</span><br>
    <span style="color:#a1a1aa;font-size:11px">tržna vrednost ${eur(primerjalnaVrednost(d))}</span>
  </td>
</tr>`
    )
    .join("");

  return `<div style="background:#ffffff;border-radius:16px;padding:4px 4px 16px;margin-top:16px">
  <h2 style="margin:16px 12px 4px;font-size:17px;color:#18181b">🎯 Top posli danes — samo fizične osebe</h2>
  <p style="margin:0 12px 8px;color:#71717a;font-size:12px">Aktivni oglasi fizičnih oseb, vsaj 10 % pod tržno vrednostjo primerljivih, razvrščeni po tem, kje je največ denarja na mizi.</p>
  <table cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">${vrstice}</table>
  <p style="margin:14px 12px 0;color:#a1a1aa;font-size:11px">
    Tržna vrednost je sredinska zahtevana cena primerljivih aktivnih oglasov, prilagojena na kilometre in letnik — ne prodajna cena, te vir ne objavi.
    V seznamu so samo oglasi fizičnih oseb; oglas, pri katerem prodajalca ne moremo z gotovostjo določiti, ni uvrščen.
    Ponovne objave istega vozila so izločene. Preverite vsak oglas pri viru.
  </p>
  <p style="margin:16px 12px 0"><a href="https://www.kodatim.si/avtonet/posli" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:9px;font-weight:600;font-size:14px">Odpri vse posle →</a></p>
</div>`;
}

/** Today's scored deals, as the statistics step left them. */
/**
 * Danasnji posli FIZICNIH OSEB.
 *
 * Zakaj filter tu: 23. 9. 2026 je bilo v deal_feed 343 poslov, od tega 298 od
 * trgovcev (87 %) - porocilo je bilo skoraj v celoti oglasnik trgovcev, kar je
 * uporabnik tudi opazil. Posel pri trgovcu je drugacna stvar: cena vkljucuje
 * mazro in pogosto DDV, avto pa je ze enkrat sel skozi odkup.
 *
 * `jeDealer === false` in nic drugega: null pomeni, da razclenjevalnik
 * prodajalca ni prebral (23. 9. po dopolnitvi dokazov: 80 aktivnih oglasov), in tak oglas ne sme v
 * seznam "fizicne osebe" - ce ne vemo, ne trdimo.
 */
/** Posli fizicnih oseb IN koliko poslov je bilo danes sploh ocenjenih. */
export async function preberiPosleZStevilom(db: Db, koliko = 10): Promise<{ posli: Deal[]; odVseh: number }> {
  try {
    const { data } = await db
      .from("avtonet_statistika")
      .select("podatki")
      .eq("kljuc", "deal_feed")
      .maybeSingle();
    const vsi = (data as { podatki: { deals: Deal[] } } | null)?.podatki?.deals ?? [];
    return { posli: vsi.filter((d) => d.jeDealer === false).slice(0, koliko), odVseh: vsi.length };
  } catch {
    return { posli: [], odVseh: 0 };
  }
}

export async function preberiPosle(db: Db, koliko = 10): Promise<Deal[]> {
  try {
    const { data } = await db
      .from("avtonet_statistika")
      .select("podatki")
      .eq("kljuc", "deal_feed")
      .maybeSingle();
    const vsi = (data as { podatki: { deals: Deal[] } } | null)?.podatki?.deals ?? [];
    return vsi.filter((d) => d.jeDealer === false).slice(0, koliko);
  } catch {
    return [];
  }
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
    <span style="color:#a1a1aa;font-size:11px">tržna vrednost ${eur(primerjalnaVrednost(d))}</span>
  </td>
</tr>`
    )
    .join("");

  return `<!doctype html><html lang="sl"><body style="margin:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;color:#18181b">
<div style="max-width:640px;margin:0 auto;padding:24px 16px">
  <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:16px 16px 0 0;padding:22px 24px">
    <p style="margin:0;color:#c7d2fe;font-size:12px;letter-spacing:.08em;text-transform:uppercase">SBN Auto · Deal Feed</p>
    <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px">🎯 Top posli danes (fizične osebe) — ${datum}</h1>
  </div>
  <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:8px 4px 16px">
    <table cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">${vrstice}</table>
    <p style="margin:14px 12px 0;color:#a1a1aa;font-size:11px">
      Tržna vrednost je sredinska zahtevana cena primerljivih aktivnih oglasov, prilagojena na kilometre in letnik — ne prodajna cena, te vir ne objavi.
    V seznamu so samo oglasi fizičnih oseb; oglas, pri katerem prodajalca ne moremo z gotovostjo določiti, ni uvrščen.
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
    // Ena sama pot do podatkov: sicer je filter na fizicne osebe mogoce
    // pozabiti prav tu, kjer ga nihce ne gleda (ta funkcija danes ni v rabi).
    const deals = await preberiPosle(db, 10);
    if (deals.length === 0) return "preskoceno";

    const datum = new Date().toLocaleDateString("sl-SI", { day: "numeric", month: "long" });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        // Several recipients, comma-separated, exactly as the daily report
        // already accepts them — the feed used to go to one address only, so
        // everyone else on the team simply never saw it.
        to: to.split(",").map((t) => t.trim()).filter(Boolean),
        subject: `🎯 SBN Deal Feed — ${deals.length} poslov (${datum})`,
        html: renderDealFeedHtml(deals, datum),
      }),
    });
    return res.ok ? "poslano" : "napaka";
  } catch {
    return "napaka";
  }
}
