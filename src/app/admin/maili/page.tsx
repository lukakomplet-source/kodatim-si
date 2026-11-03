import { redirect } from "next/navigation";

/**
 * Stara stran Maili je od faze 5 (3. 11. 2026) Komunikacija › Pregled: ista vrsta, mape z lijakom in Listmonk.
 * Stari zaznamki (tudi /admin/maili#mapa-…) pridejo tja; zapora je na novi strani (kompletko.view).
 */
export default function MailiPage() {
  redirect("/admin/komunikacija");
}
