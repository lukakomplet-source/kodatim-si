import type { NextRequest } from "next/server";

/**
 * Odjava iz prodajnih mailov (List-Unsubscribe, 24. 10. 2026). GET pokaže stran z gumbom (pregledovalniki
 * povezav v pošti torej nikogar ne odjavijo), POST — klik na gumb ali »odjava z enim klikom« iz Gmaila
 * (RFC 8058) — Harveyju sporoči odjavo: naslov ne dobi nobenega maila več.
 */

export const dynamic = "force-dynamic";

const HARVEY = process.env.HARVEY_KODATIM_URL ?? "http://127.0.0.1:5555";
const VELJA = /^[A-Za-z0-9_-]{6,64}$/;

function stran(naslov: string, besedilo: string, gumb = ""): Response {
  const html = `<!doctype html><html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${naslov} · KodaTim</title>
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#EEF4F2;color:#0E1B2C;display:grid;place-items:center;min-height:100vh}
main{background:#fff;max-width:420px;margin:16px;padding:32px;border-radius:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:22px;margin:0 0 12px}p{line-height:1.5;color:#374151}button{margin-top:16px;background:#0F9D8A;color:#fff;border:0;border-radius:12px;padding:12px 20px;font-size:16px;font-weight:600;cursor:pointer}</style>
</head><body><main><h1>${naslov}</h1><p>${besedilo}</p>${gumb}</main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!VELJA.test(id)) return stran("Povezava ni veljavna", "Za odjavo nam lahko tudi samo odpišete.");
  return stran(
    "Odjava",
    "Ne želite več prejemati mailov od KodaTim? Kliknite spodaj in vam ne pišemo več.",
    `<form method="post"><button type="submit">Odjavi me</button></form>`,
  );
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!VELJA.test(id)) return stran("Povezava ni veljavna", "Za odjavo nam lahko tudi samo odpišete.");
  try {
    const r = await fetch(`${HARVEY}/api/odjava/${id}`, { method: "POST", signal: AbortSignal.timeout(8000) });
    if (r.ok) return stran("Odjavljeni ste", "Ne bomo vam več pisali. Hvala in lep pozdrav, Luka Komplet, KodaTim.");
  } catch {
    // spodaj: prosimo za odgovor na mail
  }
  return stran("Odjava ni uspela", "Prosimo, odgovorite na naš mail z besedo »odjava« in vam ne pišemo več.");
}
