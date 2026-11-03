import { notFound } from "next/navigation";
import { zahtevajStran } from "@/lib/require-admin";
import { kampanjaVPripravi, preberiPodjetjaKampanje } from "@/lib/kompletko-kampanje";
import { DodajPodjetje } from "./DodajPodjetje";

/**
 * Kompletko › kampanja v pripravi (Spremstvo tovora, Monitoring; 3. 11. 2026). Brez seznamov in mailov, dokler
 * Luka ne potrdi ponudbe; tu je samo, komu bomo prodajali, kaj manjka in podjetja, dodana ročno.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ kampanja: string }> }) {
  const k = kampanjaVPripravi((await params).kampanja);
  return { title: k?.ime ?? "Kampanja" };
}

export default async function KampanjaPage({ params }: { params: Promise<{ kampanja: string }> }) {
  await zahtevajStran("kompletko.view");
  const k = kampanjaVPripravi((await params).kampanja);
  if (!k) notFound();
  const podjetja = await preberiPodjetjaKampanje(k.kljuc);

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold text-zinc-900">{k.ime}</h1>
        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-sm text-amber-900 ring-1 ring-amber-200">
          Kampanja v pripravi
        </span>
      </div>
      <p className="mt-2 text-base text-zinc-600">{k.kaj}</p>
      <p className="mt-1 text-sm text-zinc-500">Nič se ne pošilja. Vseh 10 mailov na dan ostane panik gumbu.</p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-900">Komu prodajamo</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
          {k.komu.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-900">Kaj manjka pred zagonom</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
          {k.manjka.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-900">Podjetja</h2>
        {podjetja === null ? (
          <p className="mt-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
            Harvey Kompletko ne odgovarja na 127.0.0.1:5556.
          </p>
        ) : podjetja.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            Še nobeno. Dodaj podjetje, ki ga srečaš ali ti ga kdo priporoči.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-2xl bg-white ring-1 ring-zinc-200">
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500">
                <tr className="border-b border-zinc-200">
                  <th className="px-3 py-2 text-left font-medium">Podjetje</th>
                  <th className="px-3 py-2 text-left font-medium">Davčna</th>
                  <th className="px-3 py-2 text-left font-medium">Stran</th>
                  <th className="px-3 py-2 text-left font-medium">Opomba</th>
                  <th className="px-3 py-2 text-left font-medium">Dodano</th>
                </tr>
              </thead>
              <tbody>
                {podjetja.map((p) => (
                  <tr key={`${p.ime}-${p.dodano}`} className="border-b border-zinc-100 last:border-0">
                    <td className="px-3 py-2 text-zinc-900">{p.ime}</td>
                    <td className="px-3 py-2 tabular-nums text-zinc-600">{p.davcna || "–"}</td>
                    <td className="px-3 py-2 text-zinc-600">{p.domena || "–"}</td>
                    <td className="px-3 py-2 text-zinc-600">{p.opomba || "–"}</td>
                    <td className="px-3 py-2 text-zinc-500">
                      {p.dodano ? new Date(p.dodano.replace(" ", "T") + "Z").toLocaleDateString("sl-SI") : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {podjetja !== null ? (
          <div className="mt-4">
            <DodajPodjetje kampanja={k.kljuc} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
