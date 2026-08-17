import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { preberiDostop } from "@/lib/avtonet/dostop";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { chatJSON } from "@/lib/openai";
import { DOSEG, DOSEG_PREDPONE } from "@/lib/avtonet/aiScope";
import { preveriZmoznost } from "@/lib/avtonet/aiZmoznost";

/**
 * The floating chat: say what should change, get a plan, say "pojdi".
 *
 * This endpoint deliberately CANNOT change code. It reads the request, answers
 * with a plan, and stores both — nothing else. Running the plan is a separate
 * request to the AI editor, which has its own gates (admin, PIN, one at a time,
 * path allowlist, revert on a failed build). Keeping the two apart is what makes
 * the chat safe to put on every page: the worst a stranger with a session could
 * do here is fill a table with text.
 *
 * The plan is the product of this step, not a formality. A change described in
 * one sentence is almost always ambiguous, and the cheapest place to discover
 * that is before the files are written.
 */

export const dynamic = "force-dynamic";

type Sporocilo = {
  id: string;
  ob: string;
  vloga: "uporabnik" | "ai";
  vrsta: "zahteva" | "plan" | "izvedba" | "obvestilo";
  besedilo: string;
  pot: string | null;
  potrjeno: boolean | null;
  izid: string | null;
  nit: string;
};

const SISTEM = `Si razvijalec, ki načrtuje spremembe na projektu SBN Auto (pot /avtonet) v kodni bazi KodaTim.si.
Tehnologija: Next.js 16 (App Router), React 19, Tailwind v4, Supabase, TypeScript.

Tvoja naloga TUKAJ je SAMO načrt — kode ne spreminjaš in datotek ne pišeš.

Spremeniti je mogoče izključno datoteke pod:
${DOSEG.map((d) => `- ${d}`).join("\n")}
- ${DOSEG_PREDPONE.join(", ")}* (samo nove migracije)

Pravila:
- Odgovarjaj v slovenščini, kratko in konkretno: 2–5 povedi ali do 5 alinej.
- Napiši, KAJ boš spremenil in KJE (katera stran ali del vmesnika), v jeziku uporabnika, ne v imenih datotek — razen če uporabnik sam sprašuje po datotekah.
- Če zahteva ni jasna, NAJPREJ postavi eno konkretno vprašanje in ne izmišljuj rešitve.
- Če zahteva zadeva del, ki ga ni dovoljeno spreminjati (KodaTim admin, druge strani, konfiguracija, avtentikacija), to jasno povej in predlagaj, kaj je znotraj dosega mogoče.
- Nikoli ne obljubljaj podatkov, ki jih v bazi ni. Če podatka ni, povej, da bi ga bilo treba najprej zbirati.
- Ne izmišljuj si, da je nekaj že narejeno.

Odgovori IZKLJUČNO z JSON:
{ "plan": "besedilo načrta", "vprasanje": true|false }
"vprasanje" je true, kadar je tvoj odgovor vprašanje in ne načrt za izvedbo.`;

/** History for the signed-in person: their own thread, oldest first. */
export async function GET(request: NextRequest) {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik || !dostop.userId) {
    // Not an error: the widget asks on every page, including for visitors, and
    // renders nothing when the answer is "not signed in".
    return NextResponse.json({ prijavljen: false, sporocila: [] });
  }

  const nit = request.nextUrl.searchParams.get("nit");
  const db = createAvtonetClient();

  let q = db
    .from("avtonet_klepet")
    .select("id, ob, vloga, vrsta, besedilo, pot, potrjeno, izid, nit")
    .eq("uporabnik", dostop.userId)
    .order("ob", { ascending: true })
    .limit(200);
  if (nit) q = q.eq("nit", nit);

  const { data, error } = await q;
  if (error?.code === "PGRST205") {
    return NextResponse.json({
      prijavljen: true,
      jeAdmin: dostop.jeAdmin,
      sporocila: [],
      migracijaManjka: true,
    });
  }

  const zmoznost = await preveriZmoznost();
  return NextResponse.json({
    prijavljen: true,
    jeAdmin: dostop.jeAdmin,
    smeZagnati: dostop.jeAdmin && zmoznost.zmore,
    razlogBrezZagona: zmoznost.zmore ? null : zmoznost.razlog,
    sporocila: (data ?? []) as unknown as Sporocilo[],
  });
}

/** A message, and the plan that answers it. */
export async function POST(request: NextRequest) {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik || !dostop.userId) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  let besedilo = "";
  let pot: string | null = null;
  let nit: string | null = null;
  try {
    const body = await request.json();
    besedilo = typeof body?.besedilo === "string" ? body.besedilo.trim() : "";
    pot = typeof body?.pot === "string" ? body.pot.slice(0, 200) : null;
    nit = typeof body?.nit === "string" && body.nit.length > 10 ? body.nit : null;
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }
  if (besedilo.length < 3) return NextResponse.json({ error: "Napišite, kaj naj se spremeni." }, { status: 400 });
  if (besedilo.length > 3000) return NextResponse.json({ error: "Predolgo sporočilo." }, { status: 400 });

  const db = createAvtonetClient();
  const nitId = nit ?? randomUUID();

  const zapisi = async (v: Partial<Sporocilo> & { vloga: string; vrsta: string; besedilo: string }) => {
    const { data, error } = await db
      .from("avtonet_klepet")
      .insert({ nit: nitId, uporabnik: dostop.userId, pot, ...v })
      .select("id, ob, vloga, vrsta, besedilo, pot, potrjeno, izid, nit")
      .maybeSingle();
    if (error && error.code === "PGRST205") throw new Error("MIGRACIJA");
    return data as unknown as Sporocilo | null;
  };

  try {
    const moje = await zapisi({ vloga: "uporabnik", vrsta: "zahteva", besedilo });

    // The rest of the thread, so "ne, raje tako" means something.
    const { data: prej } = await db
      .from("avtonet_klepet")
      .select("vloga, besedilo")
      .eq("nit", nitId)
      .order("ob", { ascending: true })
      .limit(20);
    const zgodovina = ((prej ?? []) as { vloga: string; besedilo: string }[])
      .map((s) => `${s.vloga === "ai" ? "Načrt" : "Uporabnik"}: ${s.besedilo}`)
      .join("\n\n")
      .slice(-8000);

    let plan = "";
    let vprasanje = false;
    try {
      const ai = await chatJSON<{ plan?: string; vprasanje?: boolean }>(
        SISTEM,
        `Stran, na kateri je uporabnik: ${pot ?? "neznana"}\n\nPogovor:\n\n${zgodovina}`,
        { temperature: 0.2 }
      );
      plan = (ai.plan ?? "").trim();
      vprasanje = ai.vprasanje === true;
    } catch (err) {
      plan = `Načrta nisem mogel sestaviti (${err instanceof Error ? err.message : "napaka"}). Poskusi znova ali napiši zahtevo drugače.`;
      vprasanje = true;
    }
    if (!plan) plan = "Nisem razumel zahteve — napiši, katero stran in kaj natanko naj spremenim.";

    const odgovor = await zapisi({
      vloga: "ai",
      vrsta: "plan",
      besedilo: plan,
      // A question is not something to confirm, so it does not get a "pojdi".
      potrjeno: vprasanje ? null : false,
    });

    return NextResponse.json({ nit: nitId, moje, odgovor, vprasanje });
  } catch (err) {
    if (err instanceof Error && err.message === "MIGRACIJA") {
      return NextResponse.json(
        { error: "Poženite supabase/migration_avtonet_klepet.sql." },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Zahteva ni uspela." },
      { status: 500 }
    );
  }
}
