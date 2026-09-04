import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { preberiNadzor, preberiDnevnik, preberiTabele } from "@/lib/nadzor";
import { Osvezevanje } from "../Osvezevanje";
import { Kartica } from "../Kartica";

/**
 * En delavec od blizu: ista kartica kot na pregledu, pod njo pa tisto, kar
 * pregled namenoma skriva — zadnji krogi oz. poizvedbe in surov dnevnik,
 * kakor teče v ukazni vrstini. To je pogled za trenutek, ko številka na
 * pregledu ne pove dovolj in bi sicer odprl okno procesa.
 */

export const dynamic = "force-dynamic";

/** Kam še pogledati, kadar kartica sama ne zadošča. */
const POVEZAVE: Record<string, { href: string; oznaka: string }[]> = {
  avtonet: [{ href: "/avtonet/pregled", oznaka: "Research konzola" }],
  pdf: [{ href: "/avtonet/pregled", oznaka: "Research konzola" }],
  vid: [{ href: "/avtonet/vid", oznaka: "Kaj model vidi (in oceni)" }],
  podjetja: [{ href: "/admin/lead-skrejp", oznaka: "Lead skrejp" }],
  nepremicnine: [{ href: "/nepremicnine/pregled", oznaka: "Research konzola" }],
  "nep-pdf": [{ href: "/nepremicnine/pregled", oznaka: "Research konzola" }],
};

export default async function PodrobnostiPage({ params }: { params: Promise<{ kljuc: string }> }) {
  await requireAdmin();
  const { kljuc } = await params;

  const nadzor = await preberiNadzor();
  const skrejper = nadzor.skrejperji.find((s) => s.kljuc === kljuc);
  if (!skrejper) notFound();

  const [dnevnik, tabele] = await Promise.all([preberiDnevnik(kljuc, 200), preberiTabele(kljuc)]);
  const napak = dnevnik.filter((v) => v.napaka).length;

  return (
    <div>
      <Osvezevanje vsakoS={15} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/nadzor" className="text-sm text-zinc-500 hover:text-zinc-900">
            ← Nadzor zbiralnikov
          </Link>
          <h1 className="mt-1 text-3xl font-semibold text-zinc-900">{skrejper.ime}</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          {(POVEZAVE[kljuc] ?? []).map((p) => (
            <Link key={p.href} href={p.href} className="text-zinc-600 underline hover:text-zinc-900">
              {p.oznaka}
            </Link>
          ))}
          <span>osveženo {new Date(nadzor.ob).toLocaleTimeString("sl-SI")} · vsakih 15 s</span>
        </div>
      </div>

      <div className="mt-5">
        <Kartica skrejper={skrejper} />
      </div>

      {tabele.map((t) => (
        <section key={t.naslov} className="mt-8">
          <h2 className="text-sm font-semibold text-zinc-900">{t.naslov}</h2>
          <div className="mt-2 overflow-x-auto rounded-xl bg-white ring-1 ring-zinc-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  {t.glava.map((g) => (
                    <th key={g} className="px-3 py-2 font-medium whitespace-nowrap">
                      {g}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.vrstice.length === 0 && (
                  <tr>
                    <td colSpan={t.glava.length} className="px-3 py-3 text-zinc-400">
                      ni podatkov
                    </td>
                  </tr>
                )}
                {t.vrstice.map((v, i) => (
                  <tr key={i} className="border-t border-zinc-100 text-zinc-800">
                    {v.map((c, j) => (
                      <td key={j} className="px-3 py-1.5 whitespace-nowrap">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Dnevnik</h2>
          <span className="text-xs text-zinc-400">
            zadnjih {dnevnik.length} vrstic{napak > 0 ? ` · ${napak} z napako` : ""}
          </span>
        </div>
        <div className="mt-2 max-h-[32rem] overflow-auto rounded-xl bg-zinc-950 p-3 font-mono text-[11px] leading-5 text-zinc-300 ring-1 ring-zinc-800">
          {dnevnik.length === 0 && <p className="text-zinc-500">Dnevnika ni ali je prazen.</p>}
          {dnevnik.map((v, i) => (
            <div key={i} className={`whitespace-pre-wrap break-all ${v.napaka ? "text-red-400" : ""}`}>
              {v.ob && <span className="text-zinc-500">{v.ob} </span>}
              {v.besedilo}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
