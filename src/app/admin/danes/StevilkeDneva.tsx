import Link from "next/link";
import type { StevilkeDneva as Stevilke } from "@/lib/danes";

/** Številka ali »ni podatka«, ko vir ne odgovori (nikoli 0 namesto manjkajočega podatka). */
export function NiPodatka({ vrednost, cilj }: { vrednost: number | null | undefined; cilj?: number }) {
  if (vrednost == null) return <span className="text-base font-medium text-zinc-400">ni podatka</span>;
  return (
    <span className="text-2xl font-semibold text-zinc-900">
      {vrednost}
      {cilj ? <span className="text-base font-medium text-zinc-400"> / {cilj}</span> : null}
    </span>
  );
}

function Vrsta({ naslov, s, povezavaMaili }: { naslov: string; s: Stevilke | null; povezavaMaili?: string }) {
  const polja: { oznaka: string; vrednost: number | null | undefined; cilj?: number; povezava?: string }[] = [
    { oznaka: "klicev", vrednost: s?.klici, cilj: s?.cilj },
    { oznaka: "dvignjenih", vrednost: s?.dvignjeni },
    { oznaka: "sestankov", vrednost: s?.sestanki },
    { oznaka: "poslanih mailov", vrednost: s?.poslaniMaili, cilj: s?.cilj, povezava: povezavaMaili },
  ];
  return (
    <div>
      <p className="text-sm font-semibold text-zinc-900">{naslov}</p>
      <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {polja.map((p) =>
          p.povezava ? (
            // Luka 6. 11. 2026: klik odpre današnje poslane maile, vsak z »Poglej mail«
            <Link
              key={p.oznaka}
              href={p.povezava}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm hover:border-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
            >
              <NiPodatka vrednost={p.vrednost} cilj={p.cilj} />
              <span className="block text-sm text-zinc-500 underline decoration-zinc-300 underline-offset-2">{p.oznaka}</span>
            </Link>
          ) : (
            <div key={p.oznaka} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm">
              <NiPodatka vrednost={p.vrednost} cilj={p.cilj} />
              <span className="block text-sm text-zinc-500">{p.oznaka}</span>
            </div>
          ),
        )}
      </div>
      {s?.moje ? (
        <p className="mt-1 text-sm text-zinc-500">
          Ti ({s.moje.ime}): {s.moje.klici} klicev, {s.moje.dvignjeni} dvignjenih, {s.moje.sestanki} sestankov.
        </p>
      ) : null}
    </div>
  );
}

/** Štiri številke dneva proti cilju 10 + 10, za vsak prikazan posel svoja vrsta. */
export function StevilkeDneva({
  kodatim,
  kompletko,
  kompletkoMaili,
}: {
  kodatim?: Stevilke | null | false;
  kompletko?: Stevilke | null | false;
  /** Kam vodi klik na »poslanih mailov« pri Kompletku (administrator: Pregled, sicer Poslano). */
  kompletkoMaili?: string;
}) {
  return (
    <div className="mt-6 space-y-3">
      {kompletko !== undefined && kompletko !== false ? (
        <Vrsta naslov="Kompletko danes" s={kompletko} povezavaMaili={kompletkoMaili} />
      ) : null}
      {kodatim !== undefined && kodatim !== false ? <Vrsta naslov="KodaTim danes" s={kodatim} /> : null}
    </div>
  );
}
