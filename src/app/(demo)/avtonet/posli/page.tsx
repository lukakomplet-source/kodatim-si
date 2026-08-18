import { redirect } from "next/navigation";
import { Target } from "lucide-react";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { preberiStatistike } from "@/lib/avtonet/statistikaBranje";
import { PosliClient, type Deal } from "./PosliClient";

/**
 * The Deal Feed: the most under-priced active adverts right now, scored by the
 * worker after every sweep (price vs cohort median, segment speed, views/day,
 * mileage-anomaly penalty). Every card says WHY it is here — a deal without a
 * reason is a guess.
 *
 * The page only fetches; brand/model/year/price filtering and sorting live in
 * the client component, because the whole feed arrives in one aggregate row.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Posli — SBN Auto" };

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
        Aktivni oglasi, katerih cena je vsaj 10 % pod mediano <strong>primerljivih</strong>{" "}
        (isti model, gorivo, menjalnik in karoserija, nato še isti motor in podobna oprema).
        Preračunano po vsakem pregledu trga ({(feed?.pregledanih ?? 0).toLocaleString("sl-SI")}{" "}
        pregledanih oglasov). Na vrhu so privzeto tisti, pri katerih je največ denarja na mizi in se
        model hitro proda — ne zgolj največji odstotek popusta. S kljukico{" "}
        <strong>„Samo od fizičnih oseb“</strong> dobiš avte zasebnikov, primerjane s ceno trgovcev.
      </p>

      {deals.length === 0 ? (
        <p className="mt-8 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Trenutno noben oglas ne izpolnjuje pogojev — poglejte po naslednjem pregledu trga.
        </p>
      ) : (
        <PosliClient deals={deals} />
      )}

      <p className="mt-8 border-t border-zinc-200 pt-4 text-xs text-zinc-400">
        Vse cene so <strong>z DDV</strong> — torej to, kar plača navaden kupec. Kjer vir ponuja tudi
        neto ceno („oz. X € + DDV“), je ta izpisana posebej kot „z odbitkom DDV“ in se v primerjave
        ne šteje; drugače bi bila taka vozila videti petino cenejša od ostalih.{" "}
        „Pod mediano&ldquo; = pod sredinsko <strong>zahtevano</strong> ceno primerljivih aktivnih
        oglasov. Primerljiv pomeni isti model, gorivo, menjalnik in karoserija ter letnik ±2; kadar
        je takih vozil dovolj, še isti motor (moč ±12 %) in podobna oprema (vsaj 60 % ujemanja
        značilk). Če primerljivih ni dovolj, se pogoji sproti rahljajo in pri vsakem poslu piše,
        kako stroga je bila primerjava. Ni prodajna cena, zato „razlika&ldquo; ni zajamčen zaslužek —
        je razpon, znotraj katerega se pogajate. Oglasi, več kot 45 % pod mediano, so izločeni — pri
        takih je praviloma nekaj narobe. Vsak posel preverite pri viru.
      </p>
    </div>
  );
}
