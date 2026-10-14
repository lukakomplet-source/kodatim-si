"use client";

import type { Izdelek } from "./podatki";

/**
 * Risbe izdelkov namesto fotografij: njihove obstoječe slike so majhne in
 * jih brez dovoljenja ne prenašamo. Logotip stranke (če ga naloži) se izriše
 * na izdelek, da vidi, kako bo izgledalo.
 */
export default function Ilustracija({
  oblika,
  barva,
  logo,
  className = "",
}: {
  oblika: Izdelek["oblika"];
  barva: string;
  logo?: string | null;
  className?: string;
}) {
  const temna = isTemna(barva);
  const crta = temna ? "#ffffff22" : "#00000022";
  const napis = temna ? "#ffffffcc" : "#111111cc";

  const logoEl = (x: number, y: number, w: number, h: number) =>
    logo ? (
      <image href={logo} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid meet" />
    ) : (
      <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize={h * 0.32} fontWeight={900} fill={napis} letterSpacing="1">
        VAŠ LOGO
      </text>
    );

  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-hidden>
      <ellipse cx="100" cy="186" rx="64" ry="7" fill="#00000030" />
      {oblika === "vrecka" && (
        <g>
          <path d="M70 52 C70 22 130 22 130 52" fill="none" stroke={temna ? "#9ca3af" : "#3f3f46"} strokeWidth="5" />
          <polygon points="46,52 154,52 162,182 38,182" fill={barva} />
          <polygon points="154,52 170,62 176,176 162,182" fill={shade(barva, -0.18)} />
          <line x1="46" y1="64" x2="154" y2="64" stroke={crta} strokeWidth="2" />
          {logoEl(62, 96, 76, 46)}
        </g>
      )}
      {oblika === "skatla" && (
        <g>
          <polygon points="40,70 120,50 170,74 90,96" fill={shade(barva, 0.12)} />
          <polygon points="40,70 90,96 90,178 40,152" fill={shade(barva, -0.15)} />
          <polygon points="90,96 170,74 170,156 90,178" fill={barva} />
          <line x1="40" y1="70" x2="170" y2="74" stroke={crta} />
          <g transform="matrix(1,-0.27,0,1,0,0)">
            {logoEl(100, 152, 60, 40)}
          </g>
        </g>
      )}
      {oblika === "trak" && (
        <g>
          <circle cx="100" cy="104" r="66" fill={barva} />
          <circle cx="100" cy="104" r="50" fill={shade(barva, -0.12)} />
          <circle cx="100" cy="104" r="22" fill="#f5f5f4" />
          <path d="M150 140 L186 180 L160 182 Z" fill={barva} />
          <text x="100" y="62" textAnchor="middle" fontSize="11" fontWeight={900} fill="#ffffffcc">
            {logo ? "★ ★ ★" : "VAŠ LOGO · VAŠ LOGO"}
          </text>
        </g>
      )}
      {oblika === "koledar" && (
        <g>
          <rect x="44" y="30" width="112" height="150" fill={barva} stroke="#00000020" />
          {Array.from({ length: 9 }).map((_, i) => (
            <circle key={i} cx={56 + i * 11} cy="30" r="3" fill="#3f3f46" />
          ))}
          <rect x="52" y="42" width="96" height="62" fill="#c69c6d" />
          {logoEl(60, 50, 80, 46)}
          {Array.from({ length: 20 }).map((_, i) => (
            <rect key={i} x={54 + (i % 5) * 19} y={114 + Math.floor(i / 5) * 15} width="14" height="9" fill="#00000014" />
          ))}
        </g>
      )}
      {oblika === "pisalo" && (
        <g transform="rotate(-35 100 100)">
          <rect x="30" y="90" width="130" height="20" rx="10" fill={barva} />
          <polygon points="160,92 184,100 160,108" fill="#a1a1aa" />
          <rect x="40" y="84" width="40" height="6" rx="3" fill="#a1a1aa" />
          <text x="112" y="104" textAnchor="middle" fontSize="9" fontWeight={900} fill="#ffffffcc">
            {logo ? "● LOGO ●" : "VAŠ LOGO"}
          </text>
        </g>
      )}
      {oblika === "majica" && (
        <g>
          <path d="M70 34 L50 40 L20 70 L42 92 L56 80 L56 180 L144 180 L144 80 L158 92 L180 70 L150 40 L130 34 C124 46 76 46 70 34 Z" fill={barva} />
          <path d="M88 38 L100 62 L112 38" fill="none" stroke="#ffffff55" strokeWidth="3" />
          {logoEl(108, 78, 30, 22)}
        </g>
      )}
    </svg>
  );
}

function hex(c: string) {
  const h = c.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function isTemna(c: string) {
  const [r, g, b] = hex(c);
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}
function shade(c: string, f: number) {
  const [r, g, b] = hex(c).map((v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))));
  return `rgb(${r},${g},${b})`;
}
