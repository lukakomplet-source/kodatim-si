import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { preberiPanoge } from "@/lib/prodajna-ekipa";
import { PanogeSeznam } from "./PanogeSeznam";

/**
 * Profili panog: kaj lastnike v posamezni panogi muči, kot so to prebrali
 * agenti na forumih in v člankih, vsaka bolečina z virom. Prodajni agent piše
 * podjetjem iz panoge šele, ko Luka profil potrdi; njegov popravek velja bolj
 * kot kateri koli vir.
 */

export const dynamic = "force-dynamic";

export default async function PanogePage() {
  await requireAdmin();
  const panoge = await preberiPanoge();

  return (
    <div>
      <Link href="/admin/prodajna-ekipa" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Prodajna ekipa
      </Link>
      <h1 className="mt-1 text-3xl font-semibold text-zinc-900">Panoge</h1>
      <p className="mt-2 max-w-3xl text-base text-zinc-600">
        Preden agent piše podjetju, razume njegovo panogo: kaj lastnike res muči, z viri s
        forumov in iz člankov. Preberi profil, po potrebi napiši popravek in ga potrdi. Podjetjem
        iz nepotrjene panoge agent ne piše.
      </p>

      {panoge === null ? (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          Harvey ne odgovarja na 127.0.0.1:5555 — plošča KodaTim ne teče.
        </p>
      ) : panoge.length === 0 ? (
        <p className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-700 ring-1 ring-zinc-200">
          Še ni nobenega profila. Agent ga naredi sam, ko pride na vrsto podjetje iz nove panoge.
        </p>
      ) : (
        <PanogeSeznam panoge={panoge} />
      )}
    </div>
  );
}
