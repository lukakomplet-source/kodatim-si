import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { preberiProbleme } from "@/lib/prodajna-ekipa";
import { ProblemiPregled } from "./ProblemiPregled";

/**
 * Problemi za potrditev (Luka, 24. 10. 2026: »step by step … prvo potrdim te tvoje probleme, ko
 * si jih našel pri podjetjih … eno pa eno podjetje potrdim ali zavrnem«). Agent pri podjetju najde
 * samo problem; šele potrjen gre naprej v iskanje rešitev, zavrnjen uči diagnozo.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Problemi za potrditev" };

export default async function ProblemiPage() {
  await requireAdmin();
  const podatki = await preberiProbleme();
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/prodajna-ekipa" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Prodajna ekipa
      </Link>
      <h1 className="mt-1 text-3xl font-semibold text-zinc-900">Problemi za potrditev</h1>
      <p className="mt-2 text-base text-zinc-600">
        Problem in rešitev na prvi pogled. Potrjeno Harvey zgradi do konca in ti mail pošlje v Odobritev.
      </p>
      {podatki === null ? (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          Harvey ne odgovarja na 127.0.0.1:5555 — plošča KodaTim ne teče.
        </p>
      ) : (
        <ProblemiPregled caka={podatki.caka} odloceni={podatki.odloceni} />
      )}
    </div>
  );
}
