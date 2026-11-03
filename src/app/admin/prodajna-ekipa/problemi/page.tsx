import Link from "next/link";
import { zahtevajStran } from "@/lib/require-admin";
import { preberiProbleme } from "@/lib/prodajna-ekipa";
import { ProblemiPregled } from "./ProblemiPregled";

/**
 * Problemi za potrditev (Luka, 24. 10. 2026: »step by step … prvo potrdim te tvoje probleme, ko
 * si jih našel pri podjetjih … eno pa eno podjetje potrdim ali zavrnem«). Agent pri podjetju najde
 * samo problem; šele potrjen gre naprej v iskanje rešitev, zavrnjen uči diagnozo.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Problemi za potrditev" };

/** »pred 5 dnevi« iz časa v bazi (UTC »YYYY-MM-DD HH:MM:SS«). */
function dniOd(cas: string): string {
  const d = new Date(`${cas.replace(" ", "T").slice(0, 19)}Z`);
  if (Number.isNaN(d.getTime())) return cas.slice(0, 10);
  const dni = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return dni <= 0 ? "danes" : dni === 1 ? "včeraj" : dni === 2 ? "pred 2 dnevoma" : `pred ${dni} dnevi`;
}

export default async function ProblemiPage() {
  await zahtevajStran();
  const podatki = await preberiProbleme();
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/prodajna-ekipa" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Harvey
      </Link>
      <h1 className="mt-1 text-3xl font-semibold text-zinc-900">Problemi za potrditev</h1>
      <p className="mt-2 text-base text-zinc-600">
        Problem in rešitev na prvi pogled. Potrjeno Harvey zgradi do konca in ti mail pokaže v Komunikaciji.
      </p>
      {podatki === null ? (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          Harvey ne odgovarja na 127.0.0.1:5555 — plošča KodaTim ne teče.
        </p>
      ) : (
        <>
          {podatki.potrjeniBrezOsnutka?.length ? (
            <section className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <p className="font-semibold">
                Potrjeni, a še brez maila: {podatki.potrjeniBrezOsnutka.length}
              </p>
              <ul className="mt-1 space-y-0.5">
                {podatki.potrjeniBrezOsnutka.map((p) => (
                  <li key={p.id}>
                    {p.podjetje}
                    {p.odloceno ? `, potrjen ${dniOd(p.odloceno)}` : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-amber-800">
                Harvey novih mailov ne gradi, dokler jih 10 čaka nate (tudi Hoteli v Outlooku). Obdelaj jih v{" "}
                <Link href="/admin/komunikacija?posel=kodatim" className="underline underline-offset-2">
                  Komunikaciji
                </Link>
                .
              </p>
            </section>
          ) : null}
          <ProblemiPregled caka={podatki.caka} odloceni={podatki.odloceni} />
        </>
      )}
    </div>
  );
}
