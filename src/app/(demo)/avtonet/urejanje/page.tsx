import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { RAZLOG_SAMO_LOKALNO } from "@/lib/avtonet/aiScope";
import { UrejanjeClient, type Seja } from "./UrejanjeClient";

/**
 * AI urejanje — a development tool for SBN Auto, admin only and local only.
 *
 * The production notice is decided on the server, because only the server knows
 * whether it is running on Vercel. Showing a working-looking input on the
 * deployed site would waste the user's time on a request that cannot succeed.
 */

export const dynamic = "force-dynamic";

export default async function UrejanjePage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/prijava?redirect=/avtonet/urejanje");
  }

  const lokalno = process.env.NODE_ENV !== "production" && !process.env.VERCEL;

  const db = createAdminClient();
  const { data, error } = await db
    .from("avtonet_ai_seje")
    .select("*")
    .order("ob", { ascending: false })
    .limit(20);

  return (
    <UrejanjeClient
      lokalno={lokalno}
      razlogSamoLokalno={RAZLOG_SAMO_LOKALNO}
      migracijaManjka={error?.code === "PGRST205"}
      zgodovina={(data ?? []) as unknown as Seja[]}
    />
  );
}
