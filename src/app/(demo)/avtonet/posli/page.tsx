import { redirect } from "next/navigation";
import { AlertTriangle, ExternalLink, Target } from "lucide-react";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { preberiStatistike } from "@/lib/avtonet/statistikaBranje";
import { eur } from "@/lib/avtonet/analiza";

/**
 * The Deal Feed: the most under-priced active adverts right now, scored by the
 * worker after every sweep (price vs cohort median, segment speed, views/day,
 * mileage-anomaly penalty). Every card says WHY it is here — a deal without a
 * reason is a guess.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Posli — SBN Auto" };

type Deal = {
  avtonetId: string; url: string; naziv: string | null; model: string;
  cena: number; medianaKohorte: number; odstopanjePct: number; vzorec: number;
  letnik: number | null; km: number | null; jeDealer: boolean | null;
  oglediNaDan: number | null; delez14: number | null; kmAnomalija: boolean;
  tocke: number; razlogi: string[];
};

export default async function PosliPage() {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa("/avtonet/posli"));

  const s = await preberiStatistike(["deal_feed"]);
  const feed = s.deal_feed as { deals: Deal[]; pregledanih: number } | null;
  const deals = feed?.deals ?? [];

  return (
    <div>
      <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-zinc-900 sm:text-3xl">
        <Target className="h-6 w-6 text-accent" />
        Posli
      </h1>
      <p className="mt-1.5 max-w-2xl text-sm text-zinc-500">
        Aktivni oglasi, katerih cena je vsaj 10 % pod mediano primerljivih. Preračunano po vsakem
        pregledu trga ({(feed?.pregledanih ?? 0).toLocaleString("sl-SI")} pregledanih oglasov);
        razvrščeno po kombinaciji odstopanja cene, hitrosti segmenta in zanimanja (ogledi).
      </p>

      {deals.length === 0 ? (
        <p className="mt-8 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Trenutno noben oglas ne izpolnjuje pogojev — poglejte po naslednjem pregledu trga.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {deals.map((d, i) => (
            <div key={d.avtonetId} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-900">
                    <span className="mr-2 text-zinc-400">#{i + 1}</span>
                    {d.naziv ?? d.model}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-500">
                    {d.letnik ?? "?"} · {d.km === null ? "?" : `${d.km.toLocaleString("sl-SI")} km`} ·{" "}
                    {d.jeDealer === false ? "zasebnik" : d.jeDealer === true ? "trgovec" : "prodajalec neznan"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-semibold text-zinc-900">{eur(d.cena)}</p>
                  <p className="text-sm font-semibold text-emerald-600">
                    −{Math.round(d.odstopanjePct)} % pod mediano ({eur(d.medianaKohorte)})
                  </p>
                </div>
              </div>

              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                {d.razlogi.map((r, j) => (
                  <li key={j} className={r.startsWith("⚠️") ? "font-medium text-amber-700" : ""}>
                    {r.startsWith("⚠️") ? (
                      <span className="inline-flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {r.replace("⚠️ ", "")}
                      </span>
                    ) : (
                      <>• {r}</>
                    )}
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex items-center gap-4">
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
                >
                  Odpri oglas <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <a
                  href={`/avtonet/cenilnik`}
                  className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
                >
                  Oceni v cenilniku →
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-8 border-t border-zinc-200 pt-4 text-xs text-zinc-400">
        „Pod mediano&ldquo; = pod sredinsko zahtevano ceno primerljivih aktivnih oglasov (isti model,
        gorivo, letnik ±2). Ni prodajna cena. Oglasi, več kot 45 % pod mediano, so izločeni — pri
        takih je praviloma nekaj narobe. Vsak posel preverite pri viru.
      </p>
    </div>
  );
}
