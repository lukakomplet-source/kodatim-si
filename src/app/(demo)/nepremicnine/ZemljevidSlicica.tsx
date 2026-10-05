/**
 * Zemljevid lokacije NAMESTO fotografije — za vire, ki prikaza fotografij ne
 * dovolijo (pravna presoja 28.–29. 9. 2026: c21, KW, 100m2 platforma,
 * croatia-estate, immozentral, thinkslovenia, acasa). Slike tam ne kažemo niti
 * po referenci; kartica pa ni prazna in pove, kje objekt je.
 *
 * 3 × 3 ploščice OpenStreetMap okoli točke (ista podlaga kot Zemljevid.tsx),
 * zamaknjene tako, da je točka na sredini kartice pri vsaki širini do 512 px.
 * Ploščice se nalagajo lenobno (loading="lazy"), zato zemljevide naloži samo
 * vidni del seznama. Koordinate so večinoma središče kraja, ne hiše.
 */
export function ZemljevidSlicica({ lat, lng, z = 13 }: { lat: number; lng: number; z?: number }) {
  const n = 2 ** z;
  const xf = ((lng + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const tx = Math.floor(xf);
  const ty = Math.floor(yf);
  // Točka v mreži 768 × 768: osrednja ploščica + odmik znotraj nje.
  const gx = 256 + (xf - tx) * 256;
  const gy = 256 + (yf - ty) * 256;
  const ploscice: [number, number][] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) ploscice.push([dx, dy]);

  return (
    <span className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <span
        className="absolute"
        style={{ left: `calc(50% - ${gx.toFixed(1)}px)`, top: `calc(50% - ${gy.toFixed(1)}px)`, width: 768, height: 768 }}
      >
        {ploscice.map(([dx, dy]) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${dx},${dy}`}
            src={`https://tile.openstreetmap.org/${z}/${tx + dx}/${ty + dy}.png`}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute h-64 w-64 max-w-none"
            style={{ left: (dx + 1) * 256, top: (dy + 1) * 256 }}
          />
        ))}
      </span>
      <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-accent shadow-md" />
      <span className="absolute bottom-1 right-1 rounded bg-white/85 px-1 text-[9px] text-zinc-600">© OpenStreetMap</span>
    </span>
  );
}
