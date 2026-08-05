import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildTargetProfile, findMatchingLeads, rankCandidates } from "@/lib/promocije/targeting";
import type { IntelLead } from "@/lib/lead-intelligence/types";

/**
 * Semantic search over the lead base.
 *
 * The old AI search turned a question into URL filters and redirected — so
 * "avtovleka" found a lead only if that exact word appeared in a field, and a
 * towing company registered as "Spremljajoče storitvene dejavnosti v kopenskem
 * prevozu" was invisible. This reads the meaning instead: the question becomes
 * a profile, the profile narrows the base cheaply in SQL, and the model ranks
 * what is left and says why each one matches.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

/** Below this, the whole base goes to the model — no prefilter can beat that. */
const SMALL_BASE = 120;

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }

  let query: string;
  try {
    const body = await request.json();
    query = typeof body?.query === "string" ? body.query.trim() : "";
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }
  if (!query) return NextResponse.json({ error: "Vnesite iskalni pojem." }, { status: 400 });

  const admin = createAdminClient();

  try {
    const { count } = await admin.from("intel_leads").select("id", { count: "exact", head: true });
    const total = count ?? 0;

    let pool: IntelLead[];
    let note: string;

    if (total <= SMALL_BASE) {
      // A small base is cheaper to rank whole than to prefilter — and
      // prefiltering here is exactly what loses the matches worth finding.
      const { data } = await admin.from("intel_leads").select("*").limit(SMALL_BASE);
      pool = (data ?? []) as unknown as IntelLead[];
      note = `Pregledanih vseh ${pool.length} leadov v bazi.`;
    } else {
      const profile = await buildTargetProfile(query);
      pool = await findMatchingLeads(admin, profile, 200);
      note = `Iz ${total} leadov ožje izbranih ${pool.length} (SKD: ${profile.skdCodes.slice(0, 6).join(", ") || "—"}).`;
      if (pool.length === 0) {
        return NextResponse.json({ results: [], note: `${note} Nobeden ne ustreza temu opisu.` });
      }
    }

    const ranked = await rankCandidates(pool, query, 60);
    const results = ranked
      .filter((r) => r.score > 0)
      .slice(0, 30)
      .map((r) => ({
        id: r.lead.id,
        company_name: r.lead.company_name,
        industry: r.lead.industry,
        email: r.lead.email,
        phone: r.lead.phone,
        address_city: r.lead.address_city,
        contact_person: r.lead.contact_person,
        score: r.score,
        reason: r.reason,
      }));

    return NextResponse.json({
      results,
      note: results.length === 0 ? `${note} Noben lead se ne ujema z opisom.` : note,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Iskanje ni uspelo." },
      { status: 500 }
    );
  }
}
