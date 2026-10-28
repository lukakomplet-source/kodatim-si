import { redirect } from "next/navigation";

/**
 * Stara stran E-pošta (števci iz Odobritve in povezava na Listmonk) je od 28. 10. 2026 del strani Maili,
 * kjer sta tudi mape in povezava na Listmonk. Stari zaznamki pridejo tja.
 */
export default function EPostaPage() {
  redirect("/admin/maili");
}
