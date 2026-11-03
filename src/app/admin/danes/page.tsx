import { redirect } from "next/navigation";

/** /admin/danes nima svoje vsebine: Danes je /admin (zavihek »Za danes«). */
export default function DanesPage() {
  redirect("/admin");
}
