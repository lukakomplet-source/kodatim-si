"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createLeadClient } from "@/lib/leadDb";
import {
  datum,
  jeIzid,
  naslednjiDelavnikLj,
  preveriDogovorInSestanek,
  type IzidKlica,
  type SestanekKlica,
} from "@/lib/klicPanik";
import type { CallStatus } from "@/lib/promocije/types";
import { updateCallInfo, updateTaskStatus } from "../promocije/actions";

/** Izid klica na Danes › Klici → stanje klica v Promocijah (KodaTim). */
const STANJE_KLICA: Record<IzidKlica, CallStatus> = {
  sestanek: "meeting_scheduled",
  poslji_mail: "interested",
  ni_dvignil: "no_answer",
  ne_zanima: "lost",
  poklici_kasneje: "called",
};

/** Kot Harvey Kompletko (KLIC_POSKUSI): po tretjem »Ni dvignil« lead ne pride več sam na seznam. */
const KLIC_POSKUSI = 3;

/** Kolikokrat je bil lead že zapisan kot »Se ni oglasil« (zgodovina leada); null, če baza ne odgovori. */
async function poskusiBrezOdgovora(leadId: string): Promise<number | null> {
  try {
    const { count, error } = await createLeadClient()
      .from("intel_lead_activity")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadId)
      .eq("type", "call")
      .like("content", "Klic: Se ni oglasil%");
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

/**
 * KodaTim klic z Danes › Klici (samo administrator, Promocije so samo njegove): zapiše izid v Promocije
 * (updateCallInfo, ki ga tudi zabeleži v zgodovino leada) in zapre nalogo »Pokliči«. »Pokliči kasneje« nastavi
 * datum naslednjega klica, »Ni dvignil« naslednji delavnik (največ KLIC_POSKUSI poskusov, potem nič več); vsi drugi
 * izidi datum počistijo.
 */
export async function zabeleziKlicKodaTimAkcija(
  targetId: string,
  taskId: string | null,
  izid: IzidKlica,
  opomba: string,
  dogovor = "",
  sestanek: SestanekKlica = {},
): Promise<{ ok: boolean; napaka?: string }> {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false, napaka: err instanceof Error ? err.message : "Napaka." };
  }
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(targetId) || (taskId && !uuid.test(taskId))) return { ok: false, napaka: "Neznano podjetje." };
  if (!jeIzid(izid)) return { ok: false, napaka: "Neznan izid." };
  const preverjeno = preveriDogovorInSestanek(izid, dogovor, sestanek);
  if ("napaka" in preverjeno) return { ok: false, napaka: preverjeno.napaka };

  const admin = createAdminClient();
  const { data: cilj } = await admin
    .from("promo_campaign_targets")
    .select("campaign_id, lead_id")
    .eq("id", targetId)
    .maybeSingle();
  if (!cilj) return { ok: false, napaka: "Podjetja ni v Promocijah." };

  const deli: string[] = [];
  if (izid === "sestanek" && preverjeno.sestanek.sestanek_kdaj) {
    const [dan, ura] = preverjeno.sestanek.sestanek_kdaj.split(" ");
    deli.push(
      `Sestanek ${datum(dan)}${ura ? ` ob ${ura}` : ""}${preverjeno.sestanek.sestanek_kraj ? `, ${preverjeno.sestanek.sestanek_kraj}` : ""}.`,
    );
  }
  if (opomba.trim()) deli.push(opomba.trim().slice(0, 500));

  let naslednji: string | null = izid === "poklici_kasneje" ? preverjeno.dogovor : null;
  if (izid === "ni_dvignil") {
    // ta poskus še ni zapisan: prejšnji + 1; ko baza ne odgovori, raje še en poskus kot nobenega
    const prej = cilj.lead_id ? await poskusiBrezOdgovora(cilj.lead_id as string) : null;
    naslednji = (prej ?? 0) + 1 < KLIC_POSKUSI ? naslednjiDelavnikLj() : null;
  }
  const r = await updateCallInfo(cilj.campaign_id as string, targetId, {
    call_status: STANJE_KLICA[izid],
    call_notes: deli.join(" "),
    call_duration_seconds: null,
    next_call_date: naslednji,
  });
  if (r.error) return { ok: false, napaka: r.error };

  if (taskId) await updateTaskStatus(cilj.campaign_id as string, taskId, "done");
  revalidatePath("/admin");
  revalidatePath("/admin/danes/klici");
  revalidatePath("/admin/danes/naslednji");
  return { ok: true };
}
