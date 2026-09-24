import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { seznamNalog, stanjeDelavca } from "@/lib/render";
import type { RenderNaloga } from "@/lib/renderOznake";
import RenderKonzola from "./RenderKonzola";

/**
 * Render — obnova starih fotografij, nekoč/danes, 2,5D gibanje.
 *
 * Stran samo nalaga in prikazuje; računa worker-render na grafični tega
 * računalnika. Izdelki ostanejo tu, dokler za fotografijo nista urejena vir in
 * licenca — javna /render pokaže samo objavljene.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Render" };

export default async function RenderPage() {
  await requireAdmin();
  let naloge: RenderNaloga[] = [];
  let napaka: string | null = null;
  try {
    naloge = await seznamNalog();
  } catch (e) {
    napaka = e instanceof Error ? e.message : String(e);
  }
  const delavec = await stanjeDelavca();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900">Render</h1>
          <p className="mt-2 max-w-3xl text-base text-zinc-500">
            Obnova starih fotografij, nekoč/danes in 2,5D gibanje. Vse se računa lokalno na grafični tega računalnika
            (RTX 3060) — v oblak ne gre nič. Izvirniki ostanejo nespremenjeni, vsak izdelek je nova datoteka.
          </p>
        </div>
        <Link href="/render" target="_blank" className="text-sm font-medium text-accent hover:underline">
          Javna stran kodatim.si/render →
        </Link>
      </div>
      {napaka ? (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          Vrste nalog ni bilo mogoče prebrati: {napaka}
        </p>
      ) : (
        <RenderKonzola zacetne={naloge} zacetnoStanje={delavec} />
      )}
    </div>
  );
}
