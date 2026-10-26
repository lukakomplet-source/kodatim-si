import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { preberiPosiljanja } from "@/lib/prodajna-ekipa";
import { PosiljanjaPregled } from "./PosiljanjaPregled";

/**
 * Kompletko: hladni maili prevoznikom (Luka, 26. 10. 2026: »komu sem že poslal, komu še nisem, komu bi
 * še lahko poslal, katere je treba follow-upati, katere so že zaključene«). Podatke vodi Harvey Kompletko
 * iz predala luka@kompletko.com (harvey/posiljanja.py).
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Kompletko: prevozniki" };

export default async function KompletkoPage() {
  await requireAdmin();
  const podatki = await preberiPosiljanja();
  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/prodajna-ekipa" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Prodajna ekipa
      </Link>
      <h1 className="mt-1 text-3xl font-semibold text-zinc-900">Kompletko: prevozniki</h1>
      <p className="mt-2 text-base text-zinc-600">
        Komu je šel mail za panik gumb, kdo je odgovoril in komu je danes treba pisati ali ga poklicati. Poslani
        maili in odgovori se vpišejo sami iz predala luka@kompletko.com.
      </p>
      {podatki === null ? (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          Harvey Kompletko ne odgovarja na 127.0.0.1:5556.
        </p>
      ) : (
        <PosiljanjaPregled podatki={podatki} />
      )}
    </div>
  );
}
