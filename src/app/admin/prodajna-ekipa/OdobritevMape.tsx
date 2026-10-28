import { Building2 } from "lucide-react";
import type { MapaOdobritve as Mapa, Podrobnosti } from "@/lib/prodajna-ekipa";
import { MapaOdobritve } from "./MapaOdobritve";
import { OdobritevSeznam } from "./OdobritevSeznam";

/**
 * Mape z maili (Hoteli, Panik gumb …) in pod njimi osnutki zunaj map. Isto na strani Maili (/admin/maili)
 * in pri delavcu »Ti — odobritev«, zato je tu enkrat.
 *
 * Mape so razvrščene pod podjetje, ki promocijo vodi (Luka, 28. 10. 2026: »za booking … mapa, firma KodaTim d.o.o.,
 * pa tisto pod Kompletko varovanje … panic buttoni«; naslednja promocija bo za eskorte pod Kompletkom).
 */

const FIRME: { kljuc: NonNullable<Mapa["lastnik"]>; ime: string }[] = [
  { kljuc: "kodatim", ime: "KodaTim d.o.o." },
  { kljuc: "kompletko", ime: "Kompletko varovanje d.o.o." },
];

export function OdobritevMape({ podrobnosti }: { podrobnosti: Podrobnosti | null }) {
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
                  <MapaOdobritve mapa={m} postavke={seznam.filter((p) => p.mapa === m.ime)} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {ostali.length > 0 || !mape.length ? <OdobritevSeznam postavke={ostali} /> : null}
    </div>
  );
}
