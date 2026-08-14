import { redirect } from "next/navigation";
import { AlertTriangle, Store } from "lucide-react";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { preberiStatistike } from "@/lib/avtonet/statistikaBranje";
import { eur } from "@/lib/avtonet/analiza";

/**
 * Dealer intelligence: who sells how much, how fast, with how much discounting
 * — and who RESETS adverts (relist rate), which nobody else measures. For
 * signed-in users; this is the competitive dataset, not the public demo.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Trgovci — SBN Auto" };

type Trgovec = {
  naziv: string; aktivnih: number; vrednostZaloge: number; povprStarostDni: number | null;
  prodanih90: number; medianaDni: number | null; medSpustPct: number | null;
  relistPct: number | null; oblezanih: number; oblezanihVrednost: number;
};

export default async function TrgovciPage() {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa("/avtonet/trgovci"));

  const s = await preberiStatistike(["trgovci"]);
  const t = s.trgovci as { vrstice: Trgovec[]; skupajTrgovcev: number } | null;
  const vrstice = t?.vrstice ?? [];

  const oblezani = [...vrstice]
    .filter((v) => v.oblezanih >= 3)
    .sort((a, b) => b.oblezanihVrednost - a.oblezanihVrednost)
    .slice(0, 10);

  return (
    <div>
      <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-zinc-900 sm:text-3xl">
        <Store className="h-6 w-6 text-accent" />
        Trgovci
      </h1>
      <p className="mt-1.5 max-w-2xl text-sm text-zinc-500">
        Kdo prodaja, kako hitro, koliko spušča — in kdo ponovno objavlja iste avte
        (svežina njegovih oglasov je zavajajoča). Prodaje izločajo ponovne objave.
      </p>

      {vrstice.length === 0 ? (
        <p className="mt-8 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          📊 Podatki o trgovcih se zbirajo z detajlnimi pregledi oglasov — lestvica se napolni,
          ko faza 2 obdela dovolj oglasov (teče samodejno).
        </p>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Trgovec</th>
                  <th className="px-4 py-2.5 text-right font-medium">Zaloga</th>
                  <th className="px-4 py-2.5 text-right font-medium">Vrednost</th>
                  <th className="px-4 py-2.5 text-right font-medium">Prodanih (90 dni)</th>
                  <th className="px-4 py-2.5 text-right font-medium">Mediana dni</th>
                  <th className="px-4 py-2.5 text-right font-medium">Spust cene</th>
                  <th className="px-4 py-2.5 text-right font-medium">Ponovne objave</th>
                  <th className="px-4 py-2.5 text-right font-medium">Obležanih 90+</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {vrstice.slice(0, 60).map((v) => (
                  <tr key={v.naziv} className="hover:bg-zinc-50">
                    <td className="max-w-56 truncate px-4 py-2.5 font-medium text-zinc-900" title={v.naziv}>
                      {v.naziv}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{v.aktivnih}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{eur(v.vrednostZaloge)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{v.prodanih90}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{v.medianaDni ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">
                      {v.medSpustPct === null ? "—" : `${v.medSpustPct} %`}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {v.relistPct === null ? (
                        <span className="text-zinc-400">—</span>
                      ) : v.relistPct >= 20 ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {v.relistPct} %
                        </span>
                      ) : (
                        <span className="text-zinc-600">{v.relistPct} %</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{v.oblezanih}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Prikazanih {Math.min(60, vrstice.length)} od {t?.skupajTrgovcev ?? vrstice.length} trgovcev
            (min 5 aktivnih ali 5 zaključenih). ⚠️ pri „Ponovne objave&ldquo; = 20 %+ oglasov trgovec
            umakne in objavi znova — njegovi oglasi so na videz mlajši, kot so v resnici.
          </p>

          {oblezani.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-zinc-900">💤 Največ obležane zaloge</h2>
              <p className="mt-0.5 text-sm text-zinc-500">
                Avti, ki stojijo 90+ dni, vežejo denar — ti trgovci so najbolj motivirani za pogajanja
                ali paketni odkup.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {oblezani.map((v) => (
                  <div key={v.naziv} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                    <p className="truncate font-medium text-zinc-900" title={v.naziv}>{v.naziv}</p>
                    <p className="mt-0.5 text-sm text-zinc-600">
                      {v.oblezanih} avtov 90+ dni · skupaj {eur(v.oblezanihVrednost)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
