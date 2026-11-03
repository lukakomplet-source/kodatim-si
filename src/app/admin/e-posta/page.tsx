import { redirect } from "next/navigation";

/**
 * Stara stran E-pošta (števci iz Odobritve in povezava na Listmonk) je del Komunikacija › Pregled (faza 5),
 * kjer sta tudi mape in povezava na Listmonk. Stari zaznamki pridejo tja.
 */
export default function EPostaPage() {
  redirect("/admin/komunikacija");
}
