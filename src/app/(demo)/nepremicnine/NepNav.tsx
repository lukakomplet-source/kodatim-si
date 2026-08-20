import Link from "next/link";

/**
 * Zavihki modula Nepremičnine. Skrivanje admin zavihka je prezentacija —
 * zaščito naredi vsaka stran sama (preberiDostop), kot povsod v (demo).
 */
export function NepNav({ aktiven, jeAdmin }: { aktiven: string; jeAdmin?: boolean }) {
  const zavihki = [
    { pot: "/nepremicnine", oznaka: "Iskalnik" },
    { pot: "/nepremicnine/posli", oznaka: "Posli" },
    { pot: "/nepremicnine/kalkulator", oznaka: "Kalkulator" },
    ...(jeAdmin ? [{ pot: "/nepremicnine/pregled", oznaka: "Konzola" }] : []),
  ];
  return (
    <nav className="mt-4 flex flex-wrap gap-1 rounded-2xl border border-zinc-200 bg-white p-1">
      {zavihki.map((z) => (
        <Link
          key={z.pot}
          href={z.pot}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            aktiven === z.pot ? "bg-accent text-white" : "text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          {z.oznaka}
        </Link>
      ))}
    </nav>
  );
}
