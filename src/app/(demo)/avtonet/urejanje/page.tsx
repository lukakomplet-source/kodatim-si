import { redirect } from "next/navigation";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { RAZLOG_SAMO_LOKALNO } from "@/lib/avtonet/aiScope";
import { UrejanjeClient, type Predlog, type Seja } from "./UrejanjeClient";

/**
 * Two things on one page, for two audiences.
 *
 * Anyone with access can write a suggestion — that is the whole page for a
 * regular user. An admin additionally gets the AI editor and every suggestion,
 * so a request and the change that answers it live next to each other.
 *
 * The production notice is decided on the server, because only the server knows
 * whether it is running on Vercel; a working-looking input on the deployed site
 * would waste the user's time on a request that cannot succeed.
 */

export const dynamic = "force-dynamic";

export default async function UrejanjePage() {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik || !dostop.userId) redirect(prijavaZa("/avtonet/urejanje"));

  const lokalno = process.env.NODE_ENV !== "production" && !process.env.VERCEL;
  const db = createAvtonetClient();

  // A regular user sees their own suggestions; an admin sees everyone's.
  let predlogiQ = db
    .from("avtonet_predlogi")
    .select(
      "id, ob, besedilo, status, odgovor, avtor, predlog_popravka, predlagano_ob, potrditev, potrjeno_ob, commit_sha"
    )
    .order("ob", { ascending: false })
    .limit(50);
  if (!dostop.jeAdmin) predlogiQ = predlogiQ.eq("avtor", dostop.userId);

  const [predlogiRes, sejeRes] = await Promise.all([
    predlogiQ,
    dostop.jeAdmin
      ? db.from("avtonet_ai_seje").select("*").order("ob", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
  ]);

  return (
    <UrejanjeClient
      jeAdmin={dostop.jeAdmin}
      userId={dostop.userId}
      lokalno={lokalno}
      razlogSamoLokalno={RAZLOG_SAMO_LOKALNO}
      migracijaManjka={sejeRes.error?.code === "PGRST205"}
      predlogiManjkajo={predlogiRes.error?.code === "PGRST205"}
      predlogi={(predlogiRes.data ?? []) as unknown as Predlog[]}
      zgodovina={(sejeRes.data ?? []) as unknown as Seja[]}
    />
  );
}
