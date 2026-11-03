import Link from "next/link";
import { Building2, PhoneCall } from "lucide-react";
import type { MapaOdobritve as Mapa, Podrobnosti, Skrb } from "@/lib/prodajna-ekipa";
import { MapaOdobritve } from "./MapaOdobritve";
import { OdobritevSeznam } from "./OdobritevSeznam";
import { SkrbiSeznam } from "../danes/KontaktOrodja";

/**
 * Mape z maili (Hoteli, Panik gumb …) in pod njimi osnutki zunaj map. Isto v Komunikacija › Pregled (/admin/komunikacija)
 * in pri delavcu »Ti — odobritev«, zato je tu enkrat.
 *
 * Mape so razvrščene pod podjetje, ki promocijo vodi (Luka, 28. 10. 2026: »za booking … mapa, firma KodaTim d.o.o.,
 * pa tisto pod Kompletko varovanje … panic buttoni«; naslednja promocija bo za eskorte pod Kompletkom).
 */

const FIRME: { kljuc: NonNullable<Mapa["lastnik"]>; ime: string }[] = [
  { kljuc: "kodatim", ime: "KodaTim d.o.o." },
  { kljuc: "kompletko", ime: "Kompletko varovanje d.o.o." },
];

/**
 * Faza 4 (3. 11. 2026): klici panik gumba so na Danes › Klici in ne odvisni več od Harveyja KodaTim. Tu ostane
 * kratka povezava in seznam »Kaj jih skrbi« (iz Kompletkovega sledilnika, 5556).
 */
export function PovezavaNaKlice({ skrbi }: { skrbi?: Skrb[] | null }) {
  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
      <Link
        href="/admin/danes/klici"
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-900 underline underline-offset-2"
      >
        <PhoneCall className="h-4 w-4 text-zinc-400" aria-hidden />
        Klici so zdaj na Danes › Klici
      </Link>
      <SkrbiSeznam skrbi={skrbi ?? []} />
    </div>
  );
}

/** `skrbi`: iz Kompletkovega sledilnika (5556), pod mapo panik gumba. */
export function OdobritevMape({
  podrobnosti,
  skrbi,
  samoLijak = false,
}: {
  podrobnosti: Podrobnosti | null;
  skrbi?: Skrb[] | null;
  /** Komunikacija › Pregled: mape brez mailov, ki čakajo (ti so v enotni vrsti). */
  samoLijak?: boolean;
}) {
  const mape = podrobnosti?.mape ?? [];
  const seznam = podrobnosti?.seznam ?? [];
  // Brez »Nič ne čaka« pod mapami: to bi veljalo samo za maile zunaj map.
  const ostali = seznam.filter((p) => !p.mapa || !mape.some((m) => m.ime === p.mapa));
  return (
    <div className="space-y-8">
      {FIRME.map((f) => {
        const njene = mape.filter((m) => (m.lastnik ?? "kodatim") === f.kljuc);
        if (!njene.length) return null;
        return (
          <section key={f.kljuc} aria-labelledby={`firma-${f.kljuc}`}>
            <h2 id={`firma-${f.kljuc}`} className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
              <Building2 className="h-5 w-5 text-zinc-400" aria-hidden />
              {f.ime}
            </h2>
            <div className="mt-3 space-y-4 border-l-2 border-zinc-200 pl-3 sm:pl-5">
              {njene.map((m) => (
                <div key={m.kljuc} id={`mapa-${m.kljuc}`} className="scroll-mt-6">
                  <MapaOdobritve mapa={m} postavke={seznam.filter((p) => p.mapa === m.ime)} samoLijak={samoLijak} />
                </div>
              ))}
              {f.kljuc === "kompletko" ? <PovezavaNaKlice skrbi={skrbi} /> : null}
            </div>
          </section>
        );
      })}
      {!samoLijak && (ostali.length > 0 || !mape.length) ? <OdobritevSeznam postavke={ostali} /> : null}
    </div>
  );
}
