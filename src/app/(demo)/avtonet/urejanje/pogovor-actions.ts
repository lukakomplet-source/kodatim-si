"use server";

import { revalidatePath } from "next/cache";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop } from "@/lib/avtonet/dostop";

/**
 * The three steps between "this is broken" and a change in the code.
 *
 *   1. the user writes what should be fixed        (predlogi-actions.ts)
 *   2. whoever will fix it writes WHAT they would do   → predlagajPopravek
 *   3. the person who asked confirms or refuses it     → odgovoriNaPredlog
 *
 * Step 2 is the one that was missing, and it is the one that matters: without it
 * the fix is built on someone's reading of one sentence, and the usual result is
 * the wrong thing implemented perfectly. Step 3 belongs to the author, not to the
 * admin — a confirmation you give yourself is not a confirmation.
 *
 * None of this touches code. The gate in front of the editor stays exactly where
 * it was: changes run locally, deliberately, by a person.
 */

export type Izid = { error?: string; success?: string };

/** Admin: "this is what I would change." Puts the suggestion up for confirmation. */
export async function predlagajPopravek(id: string, besedilo: string): Promise<Izid> {
  const dostop = await preberiDostop();
  if (!dostop.jeAdmin) return { error: "Nimate dovoljenja za to dejanje." };

  const cist = besedilo.trim();
  if (cist.length < 5) return { error: "Napišite, kaj bi popravili." };
  if (cist.length > 4000) return { error: "Predolgo (največ 4000 znakov)." };

  const db = createAvtonetClient();
  const { error } = await db
    .from("avtonet_predlogi")
    .update({
      predlog_popravka: cist,
      predlagano_ob: new Date().toISOString(),
      potrditev: "caka",
      status: "predlagano",
    })
    .eq("id", id);

  if (error) {
    if (error.code === "PGRST204" || error.code === "42703") {
      return { error: "Poženite supabase/migration_avtonet_predlogi_pogovor.sql." };
    }
    return { error: `Ni bilo mogoče shraniti: ${error.message}` };
  }

  revalidatePath("/avtonet/urejanje");
  return { success: "Predlog popravka je poslan v potrditev." };
}

/**
 * The author's answer. An admin may answer too — they are often the author, and
 * somebody has to be able to move a suggestion whose author has left.
 */
export async function odgovoriNaPredlog(id: string, potrdi: boolean): Promise<Izid> {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik || !dostop.userId) return { error: "Niste prijavljeni." };

  const db = createAvtonetClient();
  const { data } = await db.from("avtonet_predlogi").select("avtor, predlog_popravka").eq("id", id).maybeSingle();
  const vrstica = data as { avtor: string | null; predlog_popravka: string | null } | null;
  if (!vrstica) return { error: "Predloga ni več." };
  if (!vrstica.predlog_popravka) return { error: "Ni še predloga popravka, ki bi ga potrdili." };
  if (!dostop.jeAdmin && vrstica.avtor !== dostop.userId) {
    return { error: "Potrdi lahko samo tisti, ki je predlog napisal." };
  }

  const { error } = await db
    .from("avtonet_predlogi")
    .update({
      potrditev: potrdi ? "potrjeno" : "zavrnjeno",
      potrdil: dostop.userId,
      potrjeno_ob: new Date().toISOString(),
      status: potrdi ? "potrjeno" : "novo",
    })
    .eq("id", id);

  if (error) return { error: `Ni bilo mogoče shraniti: ${error.message}` };

  revalidatePath("/avtonet/urejanje");
  return {
    success: potrdi
      ? "Potrjeno — popravek je na vrsti."
      : "Zavrnjeno — predlog se vrne v obravnavo, napišite, kaj naj bo drugače.",
  };
}

/** Admin: mark which commit actually resolved this, so the tree can show it. */
export async function zakljuciPredlog(id: string, commitSha: string): Promise<Izid> {
  const dostop = await preberiDostop();
  if (!dostop.jeAdmin) return { error: "Nimate dovoljenja za to dejanje." };

  const sha = commitSha.trim();
  if (sha && !/^[0-9a-f]{7,40}$/i.test(sha)) {
    return { error: "Commit naj bo git sha (7–40 šestnajstiških znakov)." };
  }

  const db = createAvtonetClient();
  const { error } = await db
    .from("avtonet_predlogi")
    .update({ status: "reseno", commit_sha: sha || null })
    .eq("id", id);
  if (error) return { error: `Ni bilo mogoče shraniti: ${error.message}` };

  revalidatePath("/avtonet/urejanje");
  return { success: "Označeno kot rešeno." };
}

/**
 * "Something broke — put it back."
 *
 * Records a request; it does not revert anything. Reverting rewrites files and
 * needs a build, which is exactly what the browser is not allowed to trigger —
 * the same boundary the AI editor draws. What this buys is that the request
 * survives: it is written down, visible, and gets handled, instead of depending
 * on catching someone by phone.
 */
export async function zahtevajPovrnitev(
  commitSha: string,
  naslov: string,
  razlog: string
): Promise<Izid> {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik || !dostop.userId) return { error: "Niste prijavljeni." };

  const sha = commitSha.trim();
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) return { error: "Neveljaven commit." };

  const db = createAvtonetClient();
  const { error } = await db.from("avtonet_povrnitve").insert({
    commit_sha: sha,
    naslov: naslov.trim().slice(0, 300) || null,
    razlog: razlog.trim().slice(0, 2000) || null,
    zahteval: dostop.userId,
    stanje: "zahtevano",
  });

  if (error) {
    if (error.code === "PGRST205") {
      return { error: "Poženite supabase/migration_avtonet_predlogi_pogovor.sql." };
    }
    return { error: `Zahteve ni bilo mogoče shraniti: ${error.message}` };
  }

  revalidatePath("/avtonet/urejanje");
  return { success: "Zahteva za povrnitev je zabeležena." };
}

/** Admin: close a revert request once it has been carried out (or refused). */
export async function zakljuciPovrnitev(
  id: string,
  stanje: "izvedeno" | "zavrnjeno",
  opomba: string
): Promise<Izid> {
  const dostop = await preberiDostop();
  if (!dostop.jeAdmin) return { error: "Nimate dovoljenja za to dejanje." };

  const db = createAvtonetClient();
  const { error } = await db
    .from("avtonet_povrnitve")
    .update({
      stanje,
      izvedeno_ob: new Date().toISOString(),
      opomba: opomba.trim().slice(0, 2000) || null,
    })
    .eq("id", id);
  if (error) return { error: `Ni bilo mogoče shraniti: ${error.message}` };

  revalidatePath("/avtonet/urejanje");
  return { success: stanje === "izvedeno" ? "Označeno kot izvedeno." : "Zahteva zavrnjena." };
}
