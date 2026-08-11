import Link from "next/link";
import { AlertTriangle, ArrowRight, HelpCircle, MessageSquarePlus } from "lucide-react";

/**
 * The "how this actually works" panel.
 *
 * Every screen in SBN Auto shows numbers derived from a scrape, and a number
 * whose provenance is invisible is a number nobody can challenge. So each page
 * explains, in the page itself: what you are looking at, where the data came
 * from, how it was computed, what it does NOT mean, and what happens next.
 *
 * The limits section is not a disclaimer bolted on for safety — it is the part
 * that makes the rest trustworthy. A reader who knows that "izginil" is not
 * "prodano", or that the grouping ignores price, can spot a wrong conclusion
 * before acting on it. Which is also why every panel ends with a link to
 * Predlogi: the person reading is the one most likely to notice.
 *
 * A native <details>, so it costs no JavaScript and works before hydration.
 */

export type Korak = { naslov: string; besedilo: React.ReactNode };

export function KakoDeluje({
  naslov = "Kako to deluje",
  uvod,
  koraki,
  omejitve,
  odprto = false,
}: {
  naslov?: string;
  uvod: React.ReactNode;
  koraki: Korak[];
  omejitve?: React.ReactNode[];
  odprto?: boolean;
}) {
  return (
    <details
      open={odprto}
      className="group mt-6 rounded-2xl border border-zinc-200 bg-white shadow-sm [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold text-zinc-900 transition hover:text-accent">
        <HelpCircle className="h-4 w-4 text-accent" />
        {naslov}
        <span className="ml-auto text-xs font-normal text-zinc-400 group-open:hidden">pokaži</span>
        <span className="ml-auto hidden text-xs font-normal text-zinc-400 group-open:inline">skrij</span>
      </summary>

      <div className="border-t border-zinc-100 px-5 py-4">
        <p className="text-sm leading-relaxed text-zinc-600">{uvod}</p>

        <ol className="mt-4 space-y-3">
          {koraki.map((k, i) => (
            <li key={k.naslov} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[11px] font-bold text-accent">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900">{k.naslov}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-zinc-600">{k.besedilo}</p>
              </div>
            </li>
          ))}
        </ol>

        {omejitve && omejitve.length > 0 && (
          <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5" />
              Kaj to NE pomeni / kje so meje
            </p>
            <ul className="mt-2 space-y-1.5">
              {omejitve.map((o, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-amber-900">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link
          href="/avtonet/urejanje"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          Nekaj ne štima ali manjka? Napiši predlog
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </details>
  );
}
