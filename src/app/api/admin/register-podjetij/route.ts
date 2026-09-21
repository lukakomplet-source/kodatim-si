import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { filtriIz, preberiNapredek, preberiPaket } from "@/lib/registerPodjetij";

/**
 * Naslednji paket podjetij za nalaganje ob drsenju.
 *
 * Register ima ~253.000 vrstic; stran jih ne more poslati naenkrat, listanje
 * po straneh pa pomeni, da človek nikoli ne vidi celote. Zato odjemalec ob
 * drsenju pobira pakete po tej poti, kazalec pa je zadnji `id` — ne odmik,
 * ker odmik pri dvesto tisočih vrsticah postaja vse počasnejši.
 *
 * Napredek obogatitve pripnemo vsakemu paketu: tako se vrstica na dnu strani
 * osvežuje kar med drsenjem, brez posebnega klica.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json({ napaka: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }

  // V Route Handlerju poizvedbenih parametrov NI v kontekstu (to velja za
  // strani); tu se berejo iz naslova zahteve in so sinhroni.
  const sp = request.nextUrl.searchParams;
  const filtri = filtriIz((k) => sp.get(k) ?? "");
  // Kazalec mora biti razumno število: "99999999999999999999999" postane 1e+23
  // in Postgres na to odgovori z napako, ki bi po nepotrebnem pricala o tipu
  // stolpca. Karkoli drugega obravnavamo kot "zacni od zacetka".
  const poSurovo = sp.get("po");
  const poStevilka = poSurovo && /^\d{1,15}$/.test(poSurovo) ? Number(poSurovo) : null;
  const poId = poStevilka !== null && Number.isSafeInteger(poStevilka) ? poStevilka : null;

  try {
    // Osvežitev vrstice na dnu ne potrebuje vrstic: brez tega bi stran vsako
    // minuto brez potrebe prenesla dvesto podjetij.
    if (sp.get("samoNapredek") === "1") {
      return NextResponse.json(
        { napredek: await preberiNapredek() },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    // Štetje je poln pregled tabele, zato samo pri prvem paketu — naslednji
    // ga podedujejo od odjemalca. Napredka ob paketih sploh ne beremo: vrstico
    // na dnu osvežuje svoj klic, sicer bi drsenje do desetih tisoč vrstic
    // pomenilo petdeset nepotrebnih pregledov tabele.
    const paket = await preberiPaket(filtri, poId, poId === null);
    return NextResponse.json(paket, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // Sporočilo baze ostane v dnevniku strežnika, odjemalec dobi splošno:
    // besedilo PostgREST-a pove ime stolpca in tip, kar ni za javno pot.
    console.error("[register-podjetij]", err);
    return NextResponse.json({ napaka: "Branje registra ni uspelo." }, { status: 500 });
  }
}
