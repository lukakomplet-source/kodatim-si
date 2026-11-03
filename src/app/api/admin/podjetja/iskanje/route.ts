import { NextResponse } from "next/server";
import { requireAdminAli } from "@/lib/require-admin";
import { getCurrentUserPermissions } from "@/lib/permissions/require-permission";
import { danesKontaktiran, preberiPodjetja, ujemaSe, zaPosel, type Podjetje } from "@/lib/podjetja/podatki";

/**
 * Iskanje Ctrl+K (faza 6): do 8 podjetij iz obeh poslov z opozoriloma »danes že kontaktiran« in »odjava«.
 * Prodaja Kompletko najde samo Kompletko podjetja. Stikalo posla tu ne velja: iskanje vedno pregleda vse,
 * kar uporabnik sme videti, da se isto podjetje ne kontaktira dvakrat.
 */

export const dynamic = "force-dynamic";

export type ZadetekIskanja = {
  kljuc: string;
  ime: string;
  pod: string;
  kodatim: boolean;
  kompletko: boolean;
  danes: boolean;
  odjava: boolean;
};

export async function GET(request: Request) {
  try {
    await requireAdminAli("lead_intelligence.view", "kompletko.view");
  } catch (err) {
    return NextResponse.json({ napaka: err instanceof Error ? err.message : "Napaka." }, { status: 403 });
  }
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ zadetki: [], manjka: [] });

  const perms = await getCurrentUserPermissions();
  const aktiven = !!perms && !perms.neaktiven;
  const admin = aktiven && perms.bypassAll;
  const kodatim = admin || (aktiven && perms.granted.has("lead_intelligence.view"));
  const kompletko = admin || (aktiven && perms.granted.has("kompletko.view"));

  const indeks = await preberiPodjetja();
  const najdena = indeks.podjetja
    .map((izvirnik) => zaPosel(izvirnik, kodatim, kompletko))
    .filter((p): p is Podjetje => !!p && ujemaSe(p, q))
    // Companies we are working with first (latest event), then the rest by name.
    .sort((a, b) => b.zadnji.localeCompare(a.zadnji) || a.ime.localeCompare(b.ime, "sl"))
    .slice(0, 8);
  const zadetki: ZadetekIskanja[] = najdena.map((p) => ({
    kljuc: p.kljuc,
    ime: p.ime || p.domene[0] || p.kljuc,
    pod: [p.davcna && `davčna ${p.davcna}`, p.domene[0] ?? p.kompletko?.domena, p.kraj].filter(Boolean).join(", "),
    kodatim: !!p.kodatim,
    kompletko: !!p.kompletko,
    danes: danesKontaktiran(p),
    odjava: p.odjava,
  }));
  return NextResponse.json({ zadetki, manjka: indeks.manjka });
}
