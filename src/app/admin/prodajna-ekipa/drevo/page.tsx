import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { preberiDrevo } from "@/lib/prodajna-ekipa";
import { DrevoSeznam } from "./DrevoSeznam";

/**
 * Drevo panog (Luka, 24. 10. 2026: »drevo biznisov … ta veja, po istem principu vsem podobnim firmam«).
 * Veje z recepti; recept je narejen iz osnutkov, ki jih je Luka pohvalil. »Pripravi« naredi osnutke
 * samo za podjetja te veje, vsak čaka na odobritev.
 */

export const dynamic = "force-dynamic";

export default async function DrevoPage() {
  await requireAdmin();
  const drevo = await preberiDrevo();
  return (
    <div>
      <Link href="/admin/prodajna-ekipa" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Prodajna ekipa
      </Link>
      <h1 className="mt-1 text-3xl font-semibold text-zinc-900">Drevo panog</h1>
      <p className="mt-2 max-w-3xl text-base text-zinc-600">
        Vsaka veja je niša podjetij. Ko ima veja potrjen recept, z gumbom »Pripravi« Harvey naredi osnutke
        samo za podjetja te veje, po istem principu — vsako podjetje dobi svoja preverjena dejstva, vsak mail
        čaka na tvojo odobritev.
      </p>
      {drevo === null ? (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          Harvey ne odgovarja na 127.0.0.1:5555 — plošča KodaTim ne teče.
        </p>
      ) : (
        <DrevoSeznam drevo={drevo} />
      )}
    </div>
  );
}
