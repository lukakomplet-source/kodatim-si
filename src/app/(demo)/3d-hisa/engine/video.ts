import { ENOTE, PROMO_KADRI, type PromoKader } from "./promo";

/**
 * PROMO VIDEO — isti kadri kot promo slike (promo.ts), povezani v en posnetek.
 *
 * Časovnica je ČISTA funkcija časa: `stanjeVidea(t)` za vsak trenutek pove
 * kamero, prerez, prosojnost volumnov in oznak. Zato se video izriše sličico
 * za sličico (offline, ne v realnem času) in je vsakič enak — počasna sličica
 * ne pokvari tempa, kot bi ga snemanje zaslona.
 *
 * Prelet med kadri gre po loku okoli hiše (valjne koordinate) in se vmes
 * dvigne: ravna črta med kadroma bi šla skozi hišo ali sosedovo streho.
 */

type V3 = [number, number, number];

export const VIDEO_FPS = 30;

type Odsek =
  | { vrsta: "kader"; od: number; do: number; kader: number; uvod?: boolean; zakljucek?: boolean; prerez?: boolean }
  | { vrsta: "prelet"; od: number; do: number; iz: number; v: number };

/** Indeksi v PROMO_KADRI: 0 tri enote, 1 vhod 1, 2 vhoda 2+3, 3 prerez, 4 od zgoraj. */
const ODSEKI: Odsek[] = [
  { vrsta: "kader", od: 0, do: 11, kader: 0, uvod: true },
  { vrsta: "prelet", od: 11, do: 15, iz: 0, v: 1 },
  { vrsta: "kader", od: 15, do: 20, kader: 1 },
  { vrsta: "prelet", od: 20, do: 24, iz: 1, v: 2 },
  { vrsta: "kader", od: 24, do: 29.5, kader: 2 },
  { vrsta: "prelet", od: 29.5, do: 33.5, iz: 2, v: 3 },
  { vrsta: "kader", od: 33.5, do: 42, kader: 3, prerez: true },
  { vrsta: "prelet", od: 42, do: 46, iz: 3, v: 4 },
  { vrsta: "kader", od: 46, do: 57, kader: 4, zakljucek: true },
];

export const VIDEO_DOLZINA = ODSEKI[ODSEKI.length - 1].do;

export type StanjeVidea = {
  cam: V3;
  look: V3;
  fov: number;
  sonce: V3;
  /** Kader, katerega oznake in naslov rišemo (ali null med preletom). */
  kader: PromoKader | null;
  /** Prosojnost oznak 0–1. Pri prerezu po enotah. */
  oznake: number;
  oznakeEnot: [number, number, number];
  /** Prerez: null = brez; sicer položaj ravnine (os z, kot kader 04). */
  prerez: number | null;
  /** Prosojnost obarvanih volumnov enot 0–1. */
  volumni: [number, number, number];
  brezDreves: boolean;
  /** Naslov v spodnjem pasu (prazen = brez pasu). */
  naslov: string;
  pas: number;
  /** Uvodna / zaključna kartica 0–1. */
  uvod: number;
  zakljucek: number;
};

const zgl = (x: number) => x * x * (3 - 2 * x); // smoothstep
const omeji = (x: number) => Math.max(0, Math.min(1, x));
const rampa = (t: number, a: number, b: number) => zgl(omeji((t - a) / (b - a)));
/** 0 → 1 → 0: vklop med a..a+v, izklop med b-v..b. */
const okno = (t: number, a: number, b: number, v = 0.7) => Math.min(rampa(t, a, a + v), 1 - rampa(t, b - v, b));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

const SONCE_PRIVZETO: V3 = [-30, 40, 35];
const sonceKadra = (k: PromoKader): V3 => k.sonce ?? SONCE_PRIVZETO;

/** Prerez kadra 04: od tu (nič odrezanega) do položaja v kadru. */
const PREREZ_ZACETEK = 7.5;

function prelet(a: PromoKader, b: PromoKader, t: number): { cam: V3; look: V3; fov: number } {
  const u = zgl(t);
  const ra = Math.hypot(a.cam[0], a.cam[2]);
  const rb = Math.hypot(b.cam[0], b.cam[2]);
  const ta = Math.atan2(a.cam[2], a.cam[0]);
  let tb = Math.atan2(b.cam[2], b.cam[0]);
  while (tb - ta > Math.PI) tb -= 2 * Math.PI;
  while (tb - ta < -Math.PI) tb += 2 * Math.PI;
  // Polmer se prilagodi hitreje (koren), da kamera ob ožjem kadru ne zaide k sosedu.
  const r = lerp(ra, rb, Math.sqrt(u));
  const th = lerp(ta, tb, u);
  const dvig = 6 * Math.sin(Math.PI * u); // čez krošnje in strehe
  const y = lerp(a.cam[1], b.cam[1], u) + dvig;
  return {
    cam: [r * Math.cos(th), y, r * Math.sin(th)],
    look: lerp3(a.look, b.look, u),
    fov: lerp(a.fov, b.fov, u),
  };
}

export function stanjeVidea(t: number): StanjeVidea {
  const o = ODSEKI.find((x) => t >= x.od && t < x.do) ?? ODSEKI[ODSEKI.length - 1];
  const prazno: StanjeVidea = {
    cam: [0, 0, 0], look: [0, 0, 0], fov: 45, sonce: SONCE_PRIVZETO, kader: null,
    oznake: 0, oznakeEnot: [0, 0, 0], prerez: null, volumni: [0, 0, 0], brezDreves: false,
    naslov: "", pas: 0, uvod: 0, zakljucek: 0,
  };

  if (o.vrsta === "prelet") {
    const a = PROMO_KADRI[o.iz];
    const b = PROMO_KADRI[o.v];
    const u = (t - o.od) / (o.do - o.od);
    const p = prelet(a, b, u);
    const izPrereza = a.prerez !== undefined;
    return {
      ...prazno,
      ...p,
      sonce: lerp3(sonceKadra(a), sonceKadra(b), zgl(u)),
      // Iz prereza: ravnina se v prvi sekundi umakne, volumni zbledijo.
      prerez: izPrereza && u < 0.3 ? lerp(a.prerez!.polozaj, PREREZ_ZACETEK, zgl(u / 0.3)) : null,
      volumni: izPrereza ? (Array(3).fill(1 - rampa(u, 0, 0.15)) as [number, number, number]) : [0, 0, 0],
      brezDreves: (b.brezDreves ?? false) || (izPrereza && u < 0.3),
    };
  }

  const k = PROMO_KADRI[o.kader];
  const d = o.do - o.od;
  const u = (t - o.od) / d;
  // Rahel premik kamere med zadrževanjem — negibna slika v videu deluje zamrznjeno.
  const lebdenje = 0.04 * (u - 0.5);
  const cam: V3 = [k.cam[0] * (1 - lebdenje), k.cam[1], k.cam[2] * (1 - lebdenje)];
  const s: StanjeVidea = {
    ...prazno,
    cam,
    look: k.look,
    fov: k.fov,
    sonce: sonceKadra(k),
    kader: k,
    brezDreves: k.brezDreves ?? false,
    naslov: k.naslov,
    pas: okno(t, o.od + 0.2, o.do),
  };

  if (o.uvod) {
    // Uvod: kamera se z daljave približa, kartica 0–4,5 s, nato oznake.
    const prihod = rampa(t, 0, 5);
    s.cam = lerp3([k.cam[0] * 1.45, k.cam[1] + 5, k.cam[2] * 1.45], cam, prihod);
    s.uvod = okno(t, 0, 4.6, 0.8);
    s.pas = okno(t, 4.8, o.do);
    s.oznake = okno(t, 5.4, o.do);
    s.oznakeEnot = [s.oznake, s.oznake, s.oznake];
    return s;
  }

  if (o.prerez && k.prerez) {
    // Ravnina zdrsne skozi hišo, nato se etaže obarvajo ena za drugo.
    s.prerez = lerp(PREREZ_ZACETEK, k.prerez.polozaj, rampa(t, o.od + 0.2, o.od + 3));
    const z = o.od + 3.2;
    const vol = (i: number) => Math.min(rampa(t, z + i * 0.9, z + i * 0.9 + 0.7), 1);
    s.volumni = [vol(0), vol(1), vol(2)];
    s.oznakeEnot = [vol(0), vol(1), vol(2)].map((x) => x * (1 - rampa(t, o.do - 0.6, o.do))) as [number, number, number];
    s.oznake = 1;
    s.pas = okno(t, o.od + 0.2, o.do);
    return s;
  }

  if (o.zakljucek) {
    s.oznake = okno(t, o.od + 0.5, o.od + 5.5);
    s.oznakeEnot = [s.oznake, s.oznake, s.oznake];
    s.pas = okno(t, o.od + 0.2, o.od + 5.6);
    s.zakljucek = rampa(t, o.od + 5.2, o.od + 6.2);
    // počasen obhod med zaključno kartico
    const kot = 0.25 * rampa(t, o.od, o.do);
    const c = Math.cos(kot);
    const sn = Math.sin(kot);
    s.cam = [cam[0] * c - cam[2] * sn, cam[1], cam[0] * sn + cam[2] * c];
    return s;
  }

  s.oznake = okno(t, o.od + 0.5, o.do);
  s.oznakeEnot = [s.oznake, s.oznake, s.oznake];
  return s;
}

/** Uvodna in zaključna kartica čez sliko. */
export function narisiKartico(ctx: CanvasRenderingContext2D, W: number, H: number, vrsta: "uvod" | "zakljucek", alfa: number) {
  if (alfa <= 0) return;
  const s = W / 1920;
  const pisava = (v: number, deb = 600) => `${deb} ${Math.round(v * s)}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.fillStyle = vrsta === "uvod" ? "rgba(10,12,16,0.55)" : "rgba(10,12,16,0.72)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffffff";
  if (vrsta === "uvod") {
    ctx.font = pisava(30, 600);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText("Parmova ulica 4, Vojnik", 140 * s, H / 2 - 90 * s);
    ctx.fillStyle = "#ffffff";
    ctx.font = pisava(76, 800);
    ctx.fillText("Hiša s tremi stanovanjskimi enotami", 136 * s, H / 2);
    ctx.font = pisava(34, 500);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fillText("Vsaka enota ima svoj vhod · pritličje, nadstropje, mansarda", 140 * s, H / 2 + 62 * s);
  } else {
    ctx.font = pisava(56, 800);
    ctx.fillText("Tri enote, trije ločeni vhodi", 136 * s, 230 * s);
    let y = 360 * s;
    for (const e of ENOTE) {
      ctx.fillStyle = e.barva;
      ctx.beginPath();
      ctx.arc(160 * s, y - 14 * s, 22 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = pisava(24, 800);
      const n = String(e.st);
      ctx.fillText(n, 160 * s - ctx.measureText(n).width / 2, y - 5 * s);
      ctx.font = pisava(36, 700);
      ctx.fillText(`${e.ime} · ${e.etaza}`, 205 * s, y - 2 * s);
      ctx.font = pisava(26, 500);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(`${e.prostori} · ${e.vhod}`, 205 * s, y + 40 * s);
      y += 150 * s;
    }
    ctx.font = pisava(22, 500);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("Vizualizacija po PZI načrtih (Arhivitae, 281/25) · ilustrativni prikaz, ne pogodbena dokumentacija", 140 * s, H - 80 * s);
  }
  ctx.restore();
}
