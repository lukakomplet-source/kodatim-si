import { NextResponse, type NextRequest } from "next/server";
import { preberiDostop } from "@/lib/avtonet/dostop";
import { createAvtonetClient } from "@/lib/avtonet/db";

/**
 * "Pojdi" — what happens after a plan is confirmed.
 *
 * Two different things, depending on who pressed it, and the difference is the
 * security model rather than a limitation:
 *
 *  - an admin runs the edit. The client calls the AI editor itself (admin + PIN +
 *    one-at-a-time + path allowlist + revert on a red build); this route only
 *    records the confirmation and, afterwards, the outcome.
 *
 *  - anyone else turns the plan into a CONFIRMED suggestion. It lands in the
 *    same list the admin already works from, marked as agreed by its author, so
 *    nothing is lost and nobody needs to retype it. What it does not do is write
 *    files: a browser session must not be a way to change code, and that holds
 *    for a chat bubble exactly as it holds for the editor.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik || !dostop.userId) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  let sporociloId = "";
  let izid: string | null = null;
  let opis: string | null = null;
  try {
    const body = await request.json();
    sporociloId = typeof body?.id === "string" ? body.id : "";
    izid = typeof body?.izid === "string" ? body.izid.slice(0, 40) : null;
    opis = typeof body?.opis === "string" ? body.opis.slice(0, 4000) : null;
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }
  if (!sporociloId) return NextResponse.json({ error: "Manjka sporočilo." }, { status: 400 });

  const db = createAvtonetClient();
  const { data } = await db
    .from("avtonet_klepet")
    .select("id, nit, besedilo, uporabnik, vrsta")
    .eq("id", sporociloId)
    .maybeSingle();
  const plan = data as { id: string; nit: string; besedilo: string; uporabnik: string | null; vrsta: string } | null;
  if (!plan || plan.vrsta !== "plan") return NextResponse.json({ error: "Načrta ni." }, { status: 404 });
  if (!dostop.jeAdmin && plan.uporabnik !== dostop.userId) {
    return NextResponse.json({ error: "To ni vaš pogovor." }, { status: 403 });
  }

  await db.from("avtonet_klepet").update({ potrjeno: true }).eq("id", plan.id);

  // The outcome of an edit the client already ran: only record it.
  if (izid) {
    await db.from("avtonet_klepet").insert({
      nit: plan.nit,
      uporabnik: dostop.userId,
      vloga: "ai",
      vrsta: "izvedba",
      besedilo: opis ?? "Urejanje je zaključeno.",
      izid,
    });
    return NextResponse.json({ ok: true });
  }

  // Nobody ran anything: turn the plan into a suggestion that is already agreed.
  const { error } = await db.from("avtonet_predlogi").insert({
    besedilo: plan.besedilo,
    avtor: dostop.userId,
    status: "potrjeno",
    predlog_popravka: plan.besedilo,
    predlagano_ob: new Date().toISOString(),
    potrditev: "potrjeno",
    potrdil: dostop.userId,
    potrjeno_ob: new Date().toISOString(),
  });
  if (error) {
    return NextResponse.json({ error: `Predloga ni bilo mogoče shraniti: ${error.message}` }, { status: 500 });
  }

  await db.from("avtonet_klepet").insert({
    nit: plan.nit,
    uporabnik: dostop.userId,
    vloga: "ai",
    vrsta: "obvestilo",
    besedilo:
      "Potrjeno. Popravka ne morem zagnati iz brskalnika (to lahko samo skrbnik z geslom za urejanje), " +
      "zato je načrt shranjen kot potrjen predlog — pojavi se v „AI urejanje“ in bo izveden od tam. " +
      "V drevesu popravkov boš videl, kdaj je bil narejen.",
  });

  return NextResponse.json({ ok: true, predlog: true });
}
