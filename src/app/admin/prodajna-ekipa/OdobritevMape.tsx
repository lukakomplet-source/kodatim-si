import type { Podrobnosti } from "@/lib/prodajna-ekipa";
import { MapaOdobritve } from "./MapaOdobritve";
import { OdobritevSeznam } from "./OdobritevSeznam";

/**
 * Mape z maili (Hoteli, Panik gumb …) in pod njimi osnutki zunaj map. Isto na strani Maili (/admin/maili)
 * in pri delavcu »Ti — odobritev«, zato je tu enkrat.
 */
export function OdobritevMape({ podrobnosti }: { podrobnosti: Podrobnosti | null }) {
  const mape = podrobnosti?.mape ?? [];
  const seznam = podrobnosti?.seznam ?? [];
  // Brez »Nič ne čaka« pod mapami: to bi veljalo samo za maile zunaj map.
  const ostali = seznam.filter((p) => !p.mapa || !mape.some((m) => m.ime === p.mapa));
  return (
    <div className="space-y-4">
      {mape.map((m) => (
        <div key={m.kljuc} id={`mapa-${m.kljuc}`} className="scroll-mt-6">
          <MapaOdobritve mapa={m} postavke={seznam.filter((p) => p.mapa === m.ime)} />
        </div>
      ))}
      {ostali.length > 0 || !mape.length ? <OdobritevSeznam postavke={ostali} /> : null}
    </div>
  );
}
