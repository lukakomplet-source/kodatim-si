import "server-only";
import { redirect } from "next/navigation";
import { zahtevajStran } from "@/lib/require-admin";
import { getCurrentUserPermissions } from "@/lib/permissions/require-permission";
import { RAZDELKI, dovoljenjaRazdelka, meniZa, praviceIz } from "@/lib/admin-meni";

/**
 * Kratke poti razdelkov (/admin/komunikacija, /admin/iskanje …): ista zapora kot na drugih straneh, nato
 * preusmeritev na prvo stran razdelka, ki jo uporabnik sme videti. Dovoljenja v meniju so ista kot zapore
 * strani (src/lib/admin-meni.ts), zato cilj ne vrne na »Nimate dovoljenja«.
 */
export async function preusmeriNaRazdelek(kljuc: string): Promise<never> {
  const razdelek = RAZDELKI.find((r) => r.kljuc === kljuc);
  if (!razdelek) redirect("/admin");
  await zahtevajStran(...dovoljenjaRazdelka(razdelek));
  const perms = await getCurrentUserPermissions();
  const zame = meniZa(praviceIz(perms)).find((r) => r.kljuc === kljuc);
  redirect(zame?.href ?? "/admin/ni-dovoljenja");
}
