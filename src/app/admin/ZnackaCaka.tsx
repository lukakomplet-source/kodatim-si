import { preberiCaka, skupajCaka } from "@/lib/komunikacija";

/**
 * Značka »čaka« pri Komunikaciji v meniju (faza 5): ista številka kot na Danes in v Komunikaciji
 * (lib/komunikacija.ts, 30-sekundni spomin). Layout jo izriše v Suspense, zato meni nikoli ne čaka nanjo.
 * 0 = brez značke; vir, ki ne odgovori = »?«.
 */
export async function ZnackaCaka({ kodatim, kompletko }: { kodatim: boolean; kompletko: boolean }) {
  if (!kodatim && !kompletko) return null;
  const n = skupajCaka(await preberiCaka({ kodatim, kompletko }));
  if (n === 0) return null;
  return (
    <span
      title={n === null ? "Število mailov, ki čakajo: ni podatka" : `${n} mailov čaka na človeka`}
      className="min-w-6 rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-xs font-semibold leading-none text-white"
    >
      {n === null ? "?" : n}
    </span>
  );
}
