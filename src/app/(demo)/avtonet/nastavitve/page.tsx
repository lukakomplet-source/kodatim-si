import { redirect } from "next/navigation";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { NastavitveClient } from "./NastavitveClient";

/**
 * A person's own account settings: sign-in address, password, and where
 * notifications should go.
 *
 * Nothing here is administrative — an admin manages other people under
 * Uporabniki. This page only ever edits the account of whoever is signed in.
 */

export const dynamic = "force-dynamic";

export default async function NastavitvePage() {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa("/avtonet/nastavitve"));

  return (
    <NastavitveClient
      email={dostop.email ?? ""}
      obvestilaEmail={dostop.obvestilaEmail ?? ""}
      jeAdmin={dostop.jeAdmin}
    />
  );
}
