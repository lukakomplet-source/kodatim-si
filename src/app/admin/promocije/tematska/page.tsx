import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/require-admin";
import ThemedCampaignClient from "./ThemedCampaignClient";

export const metadata = { title: "Tematska kampanja" };

export default async function ThemedCampaignPage() {
  await requireAdmin();

  return (
    <div>
      <Link
        href="/admin/promocije"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Nazaj na Promocije
      </Link>

      <h1 className="mt-4 text-3xl font-semibold text-zinc-900">Tematska kampanja</h1>
      <p className="mt-2 max-w-3xl text-base text-zinc-500">
        Opišite, komu in kaj želite prodati. AI iz tega sestavi iskalni profil, poišče ustrezna podjetja v
        vaši bazi, pojasni, zakaj se ujemajo, in napiše osnutek maila za vsako posebej.
      </p>

      <ThemedCampaignClient />
    </div>
  );
}
