import * as THREE from "three";
import { NACRT } from "./nacrt";
import type { NastavitvePrereza } from "./rezanje";

/**
 * PROMO SLIKE — hiša kot TRI STANOVANJSKE ENOTE, vsaka s svojim vhodom.
 *
 * Vsebina je iz PZI (Arhivitae 281/25): etaže, prostori po tlorisih, vhodi
 * ZV1 (sever, pritličje) ter ZV4a/ZV4b z zunanjega stopnišča (vzhod). Kvadratur
 * namenoma NI: v tlorisu podstrehe dnevni prostor nima kote, ki bi jo bilo mogoče
 * zanesljivo prebrati, napačna kvadratura v oglasu pa je slabša od nobene.
 *
 * Oznake se rišejo na 2D platno PO izrisu, točke pa projicira ista kamera —
 * zato puščica vedno kaže na prava vrata, ne glede na kader.
 */

type V3 = [number, number, number];

const polS = NACRT.sirinaSJ / 2;
const polG = NACRT.globinaVZ / 2;

export type Enota = {
  st: 1 | 2 | 3;
  ime: string;
  etaza: string;
  barva: string;
  prostori: string;
  vhod: string;
  /** Spodnja in zgornja kota prostornine (za obarvan volumen v prerezu). */
  od: number;
  do: number;
};

export const ENOTE: Enota[] = [
  {
    st: 1,
    ime: "Enota 1",
    etaza: "pritličje",
    barva: "#2f7fd8",
    prostori: "dnevni prostor s kuhinjo · 2 sobi · kopalnica",
    vhod: "lasten vhod s severa",
    od: 0.05,
    do: NACRT.pritlicjeStrop,
  },
  {
    st: 2,
    ime: "Enota 2",
    etaza: "1. nadstropje",
    barva: "#23a35a",
    prostori: "dnevni prostor s kuhinjo · 2 sobi · kopalnica · balkon",
    vhod: "lasten vhod z zunanjega stopnišča",
    od: NACRT.nadstropjeTla,
    do: NACRT.nadstropjeStrop,
  },
  {
    st: 3,
    ime: "Enota 3",
    etaza: "mansarda",
    barva: "#e2832b",
    prostori: "dnevni prostor s kuhinjo · 2 sobi · kopalnica · balkon",
    vhod: "lasten vhod z zunanjega stopnišča",
    od: NACRT.podstrehaTla,
    do: NACRT.podstrehaTla + 2.6,
  },
];

export type Oznaka = {
  /** Točka v svetu, na katero kaže oznaka. */
  tocka: V3;
  /** Kam postaviti okvir, relativno na točko, v deležu širine slike. */
  odmik: [number, number];
  enota?: 1 | 2 | 3;
  naslov: string;
  podnapis?: string;
  /** Vhod: pri točki nariše puščico namesto pike. */
  vhod?: boolean;
  /**
   * Točka je namenoma za oblogo ali v prerezu (vrata za lamelami stopnišča,
   * prostori v prerezu) — brez preverbe vidnosti. Sicer se oznaka, katere
   * točke kamera ne vidi, izpusti: puščica „Vhod enote 1“ je v prvi različici
   * kazala na streho, ker so bila vrata na drugi strani hiše.
   */
  skozi?: boolean;
};

export type PromoKader = {
  ime: string;
  naslov: string;
  cam: V3;
  look: V3;
  fov: number;
  prerez?: NastavitvePrereza;
  /** Obarvani volumni enot (samo v prerezu — od zunaj bi prekrili fasado). */
  volumni?: boolean;
  /** Položaj sonca za ta kader (privzeto „dan“, ki osvetli zahod in jug). */
  sonce?: V3;
  /** Skrij drevesa okoli hiše (samo prerez — diagram, ne posnetek kraja). */
  brezDreves?: boolean;
  oznake: Oznaka[];
};

const ZV1: V3 = [0.3, 1.15, -polS - 0.05];
const ZV4a: V3 = [polG + 0.05, NACRT.nadstropjeTla + 1.15, -1.57];
const ZV4b: V3 = [polG + 0.05, NACRT.podstrehaTla + 1.15, -1.57];
const naslovEnote = (e: Enota) => `${e.ime} · ${e.etaza}`;

export const PROMO_KADRI: PromoKader[] = [
  {
    ime: "01-tri-enote",
    naslov: "Tri stanovanjske enote, vsaka s svojim vhodom",
    cam: [-20, 8.5, 9.5],
    look: [0, 4.3, 0.6],
    fov: 42,
    oznake: [
      { tocka: [-polG - 0.05, 1.4, -2.2], odmik: [-0.12, 0.08], enota: 1, naslov: naslovEnote(ENOTE[0]), podnapis: ENOTE[0].prostori },
      { tocka: [-polG - 1.2, 3.9, 2.6], odmik: [-0.16, -0.02], enota: 2, naslov: naslovEnote(ENOTE[1]), podnapis: ENOTE[1].prostori },
      { tocka: [-polG - 0.05, 7.3, -0.2], odmik: [-0.12, -0.1], enota: 3, naslov: naslovEnote(ENOTE[2]), podnapis: ENOTE[2].prostori },
    ],
  },
  {
    ime: "02-vhod-enote-1",
    naslov: "Enota 1 (pritličje) — vhod s severa",
    // znotraj parcele (severni pas je širok 4,2 m); prej je kamera stala v
    // sosedovi hiši čez mejo
    cam: [5.6, 1.9, -9.3],
    look: [0.0, 1.9, -5.45],
    fov: 62,
    sonce: [-50, 34, -40], // poletni večer s severozahoda — sicer je severna fasada v senci
    oznake: [
      { tocka: ZV1, odmik: [-0.13, -0.12], enota: 1, naslov: "Vhod enote 1", podnapis: "pritličje · lasten vhod", vhod: true },
    ],
  },
  {
    ime: "03-vhoda-enot-2-in-3",
    naslov: "Enoti 2 in 3 — ločena vhoda z zunanjega stopnišča",
    // med sosednjima hišama (vzhodna stoji na x 12,5–20,5, z −17…−9), dovolj
    // visoko, da pogled gre čez krošnje ob vzhodni meji
    cam: [15.5, 8.6, -3.8],
    look: [5.6, 4.4, -0.9],
    fov: 50,
    sonce: [45, 40, 25], // dopoldne z vzhoda — sicer je stolp v senci
    oznake: [
      { tocka: ZV4b, odmik: [-0.13, -0.11], enota: 3, naslov: "Vhod enote 3", podnapis: "mansarda · lasten vhod", vhod: true, skozi: true },
      { tocka: ZV4a, odmik: [-0.14, 0.06], enota: 2, naslov: "Vhod enote 2", podnapis: "1. nadstropje · lasten vhod", vhod: true, skozi: true },
    ],
  },
  {
    ime: "04-prerez-etaze",
    naslov: "Prerez — tri ločene etaže",
    cam: [7.5, 5.6, 15.5],
    look: [0.4, 4.0, 0.4],
    fov: 46,
    prerez: { vklopljen: true, os: "z", polozaj: 0.4, obrnjen: false },
    volumni: true,
    brezDreves: true,
    oznake: [
      { tocka: [-2.0, 1.2, 0.4], odmik: [-0.17, 0.05], enota: 1, naslov: naslovEnote(ENOTE[0]), podnapis: ENOTE[0].vhod, skozi: true },
      { tocka: [-2.0, 3.9, 0.4], odmik: [-0.19, 0.0], enota: 2, naslov: naslovEnote(ENOTE[1]), podnapis: ENOTE[1].vhod, skozi: true },
      { tocka: [-1.8, 6.6, 0.4], odmik: [-0.19, -0.05], enota: 3, naslov: naslovEnote(ENOTE[2]), podnapis: ENOTE[2].vhod, skozi: true },
    ],
  },
  {
    ime: "05-pogled-od-zgoraj",
    naslov: "Parmova 4, Vojnik — tri enote, trije vhodi",
    // s severozahoda: vidni so severni vhod, zahodna frčada in dvig strehe nad stopniščem
    cam: [-15.5, 15.5, -17.5],
    look: [0.8, 3.4, -0.8],
    fov: 42,
    sonce: [-45, 58, -30],
    oznake: [
      { tocka: ZV1, odmik: [0.11, 0.07], enota: 1, naslov: "Vhod enote 1", podnapis: "pritličje · sever", vhod: true },
      { tocka: [polG + 2.2, 8.75, 0.0], odmik: [0.13, 0.05], naslov: "Zunanje stopnišče", podnapis: "vhoda enot 2 in 3 (vzhod)" },
      { tocka: [-polG - 0.05, 7.4, -0.2], odmik: [-0.14, 0.04], enota: 3, naslov: "Enota 3 · mansarda", podnapis: "frčada z oknom na zahod" },
    ],
  },
];

/** Prosojni volumni enot za kader s prerezom; rezani z isto ravnino kot hiša. */
export function volumniEnot(ravnina: THREE.Plane): THREE.Group {
  const g = new THREE.Group();
  const DEB = 0.32;
  for (const e of ENOTE) {
    /**
     * Prekrivni sloj čez prerezano etažo. Samo zadnje ploskve in brez testa
     * globine: pri rezu odpade sprednja ploskev, notranje stene pa bi zadnjo
     * skrile — prva različica se zato v sliki sploh ni videla. Zadnje ploskve
     * konveksne škatle pokrijejo njen obris natanko enkrat, brez dvojnega
     * mešanja.
     */
    const m = new THREE.MeshBasicMaterial({
      color: e.barva,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      depthTest: false,
      side: THREE.BackSide,
      clippingPlanes: [ravnina],
    });
    const w = NACRT.globinaVZ - 2 * DEB - 0.1;
    const d = NACRT.sirinaSJ - 2 * DEB - 0.1;
    const h = e.do - e.od - 0.05;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(0, (e.od + e.do) / 2, 0);
    b.renderOrder = 10;
    g.add(b);
  }
  return g;
}

/** Zaobljen pravokotnik na platnu. */
function zaobljen(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Nariše oznake in pas z naslovom na izrisano sliko.
 * `projiciraj` vrne piksel na sliki za točko v svetu (ali null za kamero).
 */
export function narisiOznake(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  kader: PromoKader,
  projiciraj: (o: Oznaka) => { x: number; y: number } | null,
  /** Za video: prosojnost posamezne oznake in spodnjega pasu (0 = ne riši). */
  moznosti: { alfa?: (o: Oznaka) => number; pas?: number } = {}
) {
  const s = W / 1920; // merilo pisave in debelin
  ctx.textBaseline = "alphabetic";
  const pisava = (velikost: number, debelina = 600) => `${debelina} ${Math.round(velikost * s)}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;

  for (const o of kader.oznake) {
    const alfa = moznosti.alfa?.(o) ?? 1;
    if (alfa <= 0.01) continue;
    const p = projiciraj(o);
    if (!p) continue;
    ctx.save();
    ctx.globalAlpha = alfa;
    const enota = ENOTE.find((e) => e.st === o.enota);
    const barva = enota?.barva ?? "#2b2f36";
    const bx = p.x + o.odmik[0] * W;
    const by = p.y + o.odmik[1] * W;

    // okvir z besedilom
    ctx.font = pisava(26, 700);
    const sirNaslova = ctx.measureText(o.naslov).width;
    ctx.font = pisava(18, 500);
    const sirPod = o.podnapis ? ctx.measureText(o.podnapis).width : 0;
    const pad = 18 * s;
    const ow = Math.max(sirNaslova, sirPod) + pad * 2 + (enota ? 46 * s : 0);
    const oh = (o.podnapis ? 74 : 50) * s;
    const ox = bx - ow / 2;
    const oy = by - oh / 2;

    // povezovalna črta (od roba okvirja do točke)
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();

    if (o.vhod) {
      // puščica do vrat
      const kot = Math.atan2(p.y - by, p.x - bx);
      const L = 26 * s;
      ctx.fillStyle = barva;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - L * Math.cos(kot - 0.45), p.y - L * Math.sin(kot - 0.45));
      ctx.lineTo(p.x - L * Math.cos(kot + 0.45), p.y - L * Math.sin(kot + 0.45));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = barva;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 18 * s;
    ctx.shadowOffsetY = 4 * s;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    zaobljen(ctx, ox, oy, ow, oh, 14 * s);
    ctx.fill();
    ctx.restore();
    // barvni trak enote na levem robu
    ctx.fillStyle = barva;
    zaobljen(ctx, ox, oy, 10 * s, oh, 5 * s);
    ctx.fill();

    let tx = ox + pad + 4 * s;
    if (enota) {
      // značka s številko enote
      ctx.fillStyle = barva;
      ctx.beginPath();
      ctx.arc(tx + 15 * s, oy + oh / 2, 17 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = pisava(20, 800);
      const t = String(enota.st);
      ctx.fillText(t, tx + 15 * s - ctx.measureText(t).width / 2, oy + oh / 2 + 7 * s);
      tx += 46 * s;
    }
    ctx.fillStyle = "#16181d";
    ctx.font = pisava(26, 700);
    ctx.fillText(o.naslov, tx, oy + (o.podnapis ? 33 : 34) * s);
    if (o.podnapis) {
      ctx.fillStyle = "#4b5160";
      ctx.font = pisava(18, 500);
      ctx.fillText(o.podnapis, tx, oy + 60 * s);
    }
    ctx.restore();
  }

  const pasAlfa = moznosti.pas ?? 1;
  if (pasAlfa <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = pasAlfa;

  // pas z naslovom spodaj
  const pasH = 104 * s;
  const grad = ctx.createLinearGradient(0, H - pasH * 1.6, 0, H);
  grad.addColorStop(0, "rgba(10,12,16,0)");
  grad.addColorStop(0.38, "rgba(10,12,16,0.62)");
  grad.addColorStop(1, "rgba(10,12,16,0.82)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, H - pasH * 1.6, W, pasH * 1.6);
  ctx.fillStyle = "#ffffff";
  ctx.font = pisava(40, 700);
  ctx.fillText(kader.naslov, 56 * s, H - 52 * s);
  ctx.font = pisava(19, 500);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillText("Parmova ulica 4, Vojnik · vizualizacija po PZI načrtih (Arhivitae, 281/25)", 58 * s, H - 20 * s);

  // legenda enot desno spodaj
  let lx = W - 56 * s;
  ctx.font = pisava(20, 600);
  for (const e of [...ENOTE].reverse()) {
    const t = `${e.ime} · ${e.etaza}`;
    const w = ctx.measureText(t).width;
    lx -= w;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(t, lx, H - 40 * s);
    lx -= 24 * s;
    ctx.fillStyle = e.barva;
    ctx.beginPath();
    ctx.arc(lx + 9 * s, H - 47 * s, 9 * s, 0, Math.PI * 2);
    ctx.fill();
    lx -= 30 * s;
  }
  ctx.restore();
}
