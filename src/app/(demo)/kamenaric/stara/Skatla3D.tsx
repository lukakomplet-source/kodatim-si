"use client";

import { useRef, useState } from "react";

/**
 * Škatla v 3D (čisti CSS), ki se vrti sama ali jo stranka zavrti z miško/prstom.
 * Logotip, ki ga naloži, se izriše na sprednjo, zgornjo in stransko ploskev.
 */
export default function Skatla3D({
  logo,
  barva = "#c69c6d",
  velikost = 220,
  samaSeVrti = true,
  svetelNapis = false,
}: {
  logo?: string | null;
  barva?: string;
  velikost?: number;
  samaSeVrti?: boolean;
  /** Na temni škatli mora biti napis »vaš logo« svetel, sicer se ne vidi. */
  svetelNapis?: boolean;
}) {
  const [kot, setKot] = useState({ x: -22, y: -35 });
  const [vlecem, setVlecem] = useState(false);
  const zadnja = useRef<{ x: number; y: number } | null>(null);

  const s = velikost;
  const g = s * 0.62; // globina
  const v = s * 0.72; // višina

  const ploskev = (transform: string, w: number, h: number, ozadje: string, zLogom: boolean) => (
    <div
      className="absolute left-1/2 top-1/2 flex items-center justify-center border border-black/10"
      style={{
        width: w,
        height: h,
        marginLeft: -w / 2,
        marginTop: -h / 2,
        background: ozadje,
        transform,
        backfaceVisibility: "hidden",
      }}
    >
      {zLogom &&
        (logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="max-h-[55%] max-w-[65%] object-contain" draggable={false} />
        ) : (
          <span className={`text-center text-[11px] font-black uppercase tracking-[0.25em] ${svetelNapis ? "text-white/70" : "text-black/60"}`}>
            Vaš
            <br />
            logo
          </span>
        ))}
    </div>
  );

  return (
    <div
      className="relative select-none touch-none"
      style={{ width: s * 1.5, height: s * 1.5, perspective: 900, cursor: vlecem ? "grabbing" : "grab" }}
      onPointerDown={(e) => {
        setVlecem(true);
        zadnja.current = { x: e.clientX, y: e.clientY };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!vlecem || !zadnja.current) return;
        const dx = e.clientX - zadnja.current.x;
        const dy = e.clientY - zadnja.current.y;
        zadnja.current = { x: e.clientX, y: e.clientY };
        setKot((k) => ({ x: Math.max(-80, Math.min(80, k.x - dy * 0.5)), y: k.y + dx * 0.5 }));
      }}
      onPointerUp={() => setVlecem(false)}
      onPointerCancel={() => setVlecem(false)}
    >
      <div
        className={`absolute inset-0 ${samaSeVrti && !vlecem ? "km-vrtenje" : ""}`}
        style={{ transformStyle: "preserve-3d" }}
      >
        <div
          className="absolute inset-0"
          style={{ transformStyle: "preserve-3d", transform: `rotateX(${kot.x}deg) rotateY(${kot.y}deg)` }}
        >
          {ploskev(`translateZ(${g / 2}px)`, s, v, barva, true)}
          {ploskev(`rotateY(180deg) translateZ(${g / 2}px)`, s, v, shade(barva), false)}
          {ploskev(`rotateY(90deg) translateZ(${s / 2}px)`, g, v, shade(barva), true)}
          {ploskev(`rotateY(-90deg) translateZ(${s / 2}px)`, g, v, shade(barva), false)}
          {ploskev(`rotateX(90deg) translateZ(${v / 2}px)`, s, g, light(barva), true)}
          {ploskev(`rotateX(-90deg) translateZ(${v / 2}px)`, s, g, shade(barva), false)}
        </div>
      </div>
    </div>
  );
}

function shade(c: string) {
  return `color-mix(in srgb, ${c} 82%, black)`;
}
function light(c: string) {
  return `color-mix(in srgb, ${c} 85%, white)`;
}
