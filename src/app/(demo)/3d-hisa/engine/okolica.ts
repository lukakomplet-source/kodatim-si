import * as THREE from "three";
import type { Materiali } from "./materials";

/**
 * Okolica po PZI SITUACIJI (list 15, Arhivitae 281/25) — kategorija A za
 * parcelo, tlakovane površine, parkirišča, vrtove in drevesa; kategorija C za
 * sosednje objekte čez mejo (vizualni približek po Street View).
 *
 * Parcela (A, list 15 + Parcela.pdf): ~25 m v smeri S–J ob cesti (odseki meje
 * 3,13 + 1,00 + 11,07 + 9,67) in 20–21 m v smeri V–Z. Hiša je 4,30 m od
 * severne, ~10,0 m od južne in ~6,3 m od zahodne (cestne) meje. Cesta
 * (parc. 566/1, Parmova) teče ob zahodni meji. Teren se od ceste (kota
 * ~267,6) proti vzhodni meji dvigne na ~269,2 — v modelu terasasto.
 *
 * Tlakovci (A): pas ob severni fasadi z uvozom s ceste (32,5 m²), pas ob
 * vzhodni fasadi/stopnišču (skupaj ~72,5 m²) in JZ parkirišče s 3 parkirnimi
 * mesti 2,50 × 5,00 ob cesti (32,5 m²). Vrt zahodno od hiše pripada
 * pritličju, veliki JV vrt gornjima stanovanjema (napisa na situaciji).
 */

export type Okolica = {
  skupina: THREE.Group;
  kolizije: THREE.Box3[];
  /** Pohodne površine izven hiše (terase vzhodnega vrta ipd.) */
  tla: THREE.Box3[];
  lampe: THREE.PointLight[];
  blokMeshi: THREE.Mesh[];
  nebo: THREE.Mesh;
};

// Meje parcele v svetovnih koordinatah (hiša centrirana na 0,0; X+ vzhod, Z+ jug)
const MEJA_S = -9.68; // severna meja (4,30 m od hiše)
const MEJA_J = 15.38; // južna meja (10,0 m od hiše)
const MEJA_Z = -10.95; // zahodna meja ob cesti (6,3 m od hiše)
const MEJA_V_S = 9.25; // vzhodna meja na severnem koncu (4,60 m od hiše)
const MEJA_V_J = 10.35; // vzhodna meja na južnem koncu (5,70 m od hiše)

function boks(mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, senca = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(x, y, z);
  m.castShadow = senca;
  m.receiveShadow = true;
  return m;
}

function kolizijaOkoli(o: THREE.Object3D, kolizije: THREE.Box3[]) {
  o.updateWorldMatrix(true, true);
  kolizije.push(new THREE.Box3().setFromObject(o));
}

export function zgradiOkolico(mat: Materiali): Okolica {
  const g = new THREE.Group();
  const kolizije: THREE.Box3[] = [];
  const tla: THREE.Box3[] = [];
  const lampe: THREE.PointLight[] = [];
  const blokMeshi: THREE.Mesh[] = [];

  // ---------- tla ----------
  const trava = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), mat.trava);
  (mat.trava.map as THREE.Texture).repeat.set(120, 120);
  trava.rotation.x = -Math.PI / 2;
  trava.receiveShadow = true;
  g.add(trava);

  const ploskev = (m: THREE.MeshStandardMaterial, sx: number, sz: number, x: number, z: number, y = 0.03, wx = 4, wz = 4) => {
    const mm = m.clone();
    if (mm.map) {
      mm.map = mm.map.clone();
      mm.map.needsUpdate = true;
      mm.map.repeat.set(sx / wx, sz / wz);
    }
    const p = boks(mm, sx, 0.06, sz, x, y, z, false);
    p.receiveShadow = true;
    return p;
  };

  // cesta Parmova (parc. 566/1) ob zahodni meji + bankina in robnik
  g.add(ploskev(mat.asfalt, 5.4, 170, -14.4, 0, 0.03, 6, 6));
  g.add(boks(mat.beton, 0.25, 0.14, 170, -11.6, 0.07, 0, false)); // robnik ob parceli
  g.add(ploskev(mat.asfalt, 9, 26, -22.4, -20, 0.03, 6, 6)); // parkirišče pred garažami čez cesto
  const crta = new THREE.MeshBasicMaterial({ color: "#e8e8e8" });

  // ---------- tlakovane površine po situaciji (A) ----------
  // 1) severni pas z uvozom s ceste do vhoda ZV1 in naprej do SV vogala
  g.add(ploskev(mat.tlakovci, 18.4, 2.7, -1.55, -6.95, 0.035, 2.6, 2.6));
  // 2) pas ob vzhodni fasadi in stopniščnem stolpu, do JV vogala hiše
  g.add(ploskev(mat.tlakovci, 3.0, 13.4, 6.15, 0.9, 0.035, 2.6, 2.6));
  // 3) apron ob južnih balkonih
  g.add(ploskev(mat.tlakovci, 7.0, 1.7, 0.5, 6.35, 0.035, 2.6, 2.6));
  // 4) JZ parkirišče: 3 mesta po 2,50 x 5,00 ob cesti + dostopna pot do hiše
  g.add(ploskev(mat.tlakovci, 5.0, 8.1, -8.45, 11.3, 0.035, 2.6, 2.6));
  for (let i = 0; i < 4; i++) {
    g.add(boks(crta, 4.6, 0.012, 0.1, -8.45, 0.075, 7.3 + i * 2.55, false));
  }
  g.add(ploskev(mat.tlakovci, 1.6, 2.4, -5.45, 6.3, 0.035, 2.6, 2.6)); // pot parkirišče–hiša

  // nadstrešek nad parkiriščem (C — predlog, v PZI ga ni): jeklen, antracit
  // pločevina z rahlim naklonom proti cesti, 6 stebrov, spodaj prehodno
  for (const nz of [7.6, 11.3, 15.0]) {
    for (const nx of [-10.7, -6.2]) {
      const steber = boks(mat.jekloAntracit, 0.1, 2.35, 0.1, nx, 1.18, nz);
      g.add(steber);
      kolizijaOkoli(steber, kolizije);
    }
  }
  const nadstresekStreha = boks(mat.prefalz, 4.9, 0.06, 8.0, -8.45, 2.44, 11.3);
  nadstresekStreha.rotation.z = 0.05;
  g.add(nadstresekStreha);
  g.add(boks(mat.jekloAntracit, 4.9, 0.08, 0.1, -8.45, 2.3, 7.55, false));
  g.add(boks(mat.jekloAntracit, 4.9, 0.08, 0.1, -8.45, 2.3, 15.05, false));

  // ---------- teren: terasast dvig proti vzhodni meji (kote 267,6 -> 269,2) ----------
  const terasa = (x0: number, x1: number, z0: number, z1: number, h: number) => {
    const t = ploskev(mat.trava, x1 - x0, z1 - z0, (x0 + x1) / 2, (z0 + z1) / 2, h - 0.03, 4, 4);
    g.add(t);
    tla.push(new THREE.Box3(new THREE.Vector3(x0, h - 0.1, z0), new THREE.Vector3(x1, h, z1)));
  };
  terasa(7.75, 11.6, -9.6, 15.3, 0.35);
  terasa(9.6, 11.6, -9.6, 15.3, 0.7);

  // ---------- meja parcele: ograja in živa meja ----------
  const ograjaPanel = (x0: number, z0: number, x1: number, z1: number, h = 1.2) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const o = boks(mat.ograjaMreza, len, h, 0.05, 0, h / 2 + 0.02, 0);
    o.position.set((x0 + x1) / 2, h / 2 + 0.02, (z0 + z1) / 2);
    o.rotation.y = -Math.atan2(dz, dx);
    g.add(o);
    kolizijaOkoli(o, kolizije);
    for (let i = 0; i <= Math.round(len / 2.5); i++) {
      const t = i / Math.round(len / 2.5);
      g.add(boks(mat.kovinaTemna, 0.06, h + 0.1, 0.06, x0 + dx * t, (h + 0.1) / 2, z0 + dz * t));
    }
  };
  // severna meja: ograja z odprtino za uvoz (uvoz x -10,95..-7,4 je prost)
  ograjaPanel(-7.4, MEJA_S, MEJA_V_S, MEJA_S);
  // vzhodna meja (rahlo poševna po situaciji)
  ograjaPanel(MEJA_V_S, MEJA_S, MEJA_V_J, MEJA_J);
  // južna meja
  ograjaPanel(MEJA_Z, MEJA_J, MEJA_V_J, MEJA_J);
  // zahodna meja ob cesti: živa meja, prekinjena na uvozu (S) in parkirišču (J)
  const meja = (sx: number, sz: number, x: number, z: number, h = 0.95) => {
    const m = boks(mat.zivaMeja, sx, h, sz, x, h / 2, z);
    g.add(m);
    kolizijaOkoli(m, kolizije);
  };
  meja(0.8, 13.2, -10.75, -0.4); // med uvozom in parkiriščem
  meja(0.8, 2.2, -10.75, -8.75); // severni konček ob uvozu

  // ---------- drevesa in grmi po situaciji ----------
  // (pozicije s situacije: veliko drevo SV, niz ob vzhodni meji, JV skupina,
  //  posamezna S sredine vrta in ob cesti)
  const drevo = (x: number, z: number, h: number, r: number, y0 = 0) => {
    const d = new THREE.Group();
    const deblo = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, h * 0.5, 7), mat.deblo);
    deblo.position.y = h * 0.25;
    deblo.castShadow = true;
    d.add(deblo);
    for (const [ox, oy, oz, or2] of [
      [0, h * 0.62, 0, r],
      [r * 0.5, h * 0.52, r * 0.3, r * 0.7],
      [-r * 0.45, h * 0.55, -r * 0.25, r * 0.65],
      [0.1, h * 0.74, -r * 0.35, r * 0.55],
      [-r * 0.2, h * 0.45, r * 0.45, r * 0.5],
    ] as const) {
      const li = new THREE.Mesh(new THREE.SphereGeometry(or2, 10, 8), mat.listje);
      li.position.set(ox, oy, oz);
      li.scale.y = 0.8;
      li.castShadow = true;
      d.add(li);
    }
    d.position.set(x, y0, z);
    g.add(d);
    kolizije.push(new THREE.Box3(new THREE.Vector3(x - 0.25, y0, z - 0.25), new THREE.Vector3(x + 0.25, y0 + 3, z + 0.25)));
  };
  drevo(6.9, -7.5, 8.5, 2.5); // veliko drevo v SV vogalu
  drevo(9.0, -2.0, 5.5, 1.5, 0.35); // niz ob vzhodni meji
  drevo(9.2, 1.6, 5.0, 1.4, 0.35);
  drevo(9.4, 4.8, 5.5, 1.5, 0.35);
  drevo(8.6, 11.8, 6.5, 1.9, 0.35); // JV skupina
  drevo(10.0, 13.6, 6.0, 1.7, 0.7);
  drevo(4.6, 14.2, 6.0, 1.8);
  drevo(2.4, 9.4, 6.0, 1.9); // sredina JV vrta
  drevo(0.0, 12.6, 5.0, 1.5);
  drevo(-8.2, -3.6, 6.5, 1.9); // ob zahodni meji med uvozom in parkiriščem
  drevo(-9.0, 4.4, 5.5, 1.6);

  // grmi ob severnem uvozu
  for (const [gx, gz, r] of [[-9.6, -7.6, 0.6], [-8.5, -8.6, 0.5]] as const) {
    const grm = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat.zivaMeja);
    grm.position.set(gx, r * 0.8, gz);
    grm.castShadow = true;
    g.add(grm);
  }

  // ---------- drvarnica/uta v SV vogalu parcele (situacija: mali objekt) ----------
  const drvarnica = new THREE.Group();
  drvarnica.add(boks(mat.les, 2.2, 2.1, 1.5, 0, 1.05 + 0.35, 0));
  const drvStreha = boks(mat.kovinaTemna, 2.5, 0.07, 1.8, 0, 2.35 + 0.35, 0.05, false);
  drvStreha.rotation.x = 0.1;
  drvarnica.add(drvStreha);
  drvarnica.position.set(8.0, 0, -9.0);
  g.add(drvarnica);
  kolizijaOkoli(drvarnica, kolizije);

  // ---------- preprosta hiša (sosedje čez mejo) ----------
  const preprostaHisa = (opts: {
    x: number; z: number; w: number; d: number; h: number; strehaH: number;
    slemeX?: boolean; fasada: THREE.Material; streha: THREE.Material; pas?: boolean; rotY?: number;
  }) => {
    const hg = new THREE.Group();
    hg.position.set(opts.x, 0, opts.z);
    if (opts.rotY) hg.rotation.y = opts.rotY;
    hg.add(boks(opts.fasada, opts.w, opts.h, opts.d, 0, opts.h / 2, 0));
    if (opts.pas) hg.add(boks(mat.les, opts.w + 0.06, 0.9, opts.d + 0.06, 0, opts.h - 0.65, 0));
    const baza = (opts.slemeX ? opts.d : opts.w) + 0.9;
    const dolzina = (opts.slemeX ? opts.w : opts.d) + 0.9;
    const oblika = new THREE.Shape();
    oblika.moveTo(-baza / 2, 0);
    oblika.lineTo(baza / 2, 0);
    oblika.lineTo(0, opts.strehaH);
    oblika.closePath();
    const geo = new THREE.ExtrudeGeometry(oblika, { depth: dolzina, bevelEnabled: false });
    geo.translate(0, 0, -dolzina / 2);
    const streha = new THREE.Mesh(geo, opts.streha);
    if (opts.slemeX) streha.rotation.y = Math.PI / 2;
    streha.position.y = opts.h;
    streha.castShadow = true;
    hg.add(streha);
    g.add(hg);
    kolizije.push(new THREE.Box3(
      new THREE.Vector3(opts.x - opts.w / 2, 0, opts.z - opts.d / 2),
      new THREE.Vector3(opts.x + opts.w / 2, opts.h + opts.strehaH, opts.z + opts.d / 2)
    ));
    return hg;
  };

  // sever, čez mejo: sosed "Parmova 6a" z lesenim pasom in nadstreškom
  preprostaHisa({ x: 0.5, z: -16.5, w: 9, d: 10, h: 5.6, strehaH: 2.1, slemeX: true, fasada: mat.belaFasada, streha: mat.opekaStreha, pas: true });
  const nadstresek = new THREE.Group();
  nadstresek.add(boks(mat.kovinaTemna, 5.2, 0.12, 5.4, 0, 2.35, 0));
  for (const [nx, nz] of [[-2.4, -2.5], [2.4, -2.5], [-2.4, 2.5], [2.4, 2.5]] as const) {
    nadstresek.add(boks(mat.kovinaTemna, 0.1, 2.35, 0.1, nx, 1.18, nz));
  }
  nadstresek.position.set(-8.2, 0, -15.5);
  g.add(nadstresek);

  // SV, čez mejo: objekt "3" (situacija)
  preprostaHisa({ x: 16.5, z: -13, w: 8, d: 8, h: 5.0, strehaH: 2.1, fasada: mat.belaFasada, streha: mat.opekaStreha, rotY: 0.1 });

  // jug, čez mejo: rumena hiša in vrtna uta (objekt "1" na situaciji je JV)
  preprostaHisa({ x: 2.5, z: 21.5, w: 10, d: 9, h: 5.4, strehaH: 2.3, slemeX: true, fasada: mat.rumenaFasada, streha: mat.opekaStreha });
  const uta = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const kot = (i / 6) * Math.PI * 2;
    uta.add(boks(mat.les, 0.09, 2.2, 0.09, Math.cos(kot) * 1.7, 1.1, Math.sin(kot) * 1.7));
  }
  const utaStreha = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 6), mat.kovinaTemna);
  utaStreha.position.y = 2.8;
  utaStreha.castShadow = true;
  uta.add(utaStreha);
  uta.position.set(10.5, 0, 22);
  g.add(uta);
  preprostaHisa({ x: 15.5, z: 19.5, w: 8, d: 8, h: 4.8, strehaH: 2.0, slemeX: true, fasada: mat.cerkevFasada, streha: mat.opekaStreha });

  // zahod, čez cesto: vrsta garaž, dva bloka, lopa, hala
  const garaze = boks(mat.garaza, 4, 2.6, 24, -28, 1.3, -20);
  g.add(garaze);
  kolizijaOkoli(garaze, kolizije);
  g.add(boks(mat.kovinaTemna, 4.6, 0.12, 24.6, -28, 2.7, -20, false));
  for (const [bx, bz, bw, bd] of [[-40, -18, 13, 30], [-42, 14, 13, 26]] as const) {
    const blok = boks(mat.blokDan, bw, 11.5, bd, bx, 5.75, bz);
    g.add(blok);
    blokMeshi.push(blok);
    kolizije.push(new THREE.Box3(new THREE.Vector3(bx - bw / 2, 0, bz - bd / 2), new THREE.Vector3(bx + bw / 2, 13, bz + bd / 2)));
    const oblika = new THREE.Shape();
    oblika.moveTo(-bw / 2 - 0.4, 0);
    oblika.lineTo(bw / 2 + 0.4, 0);
    oblika.lineTo(0, 1.6);
    oblika.closePath();
    const sg = new THREE.ExtrudeGeometry(oblika, { depth: bd + 0.8, bevelEnabled: false });
    sg.translate(0, 0, -(bd + 0.8) / 2);
    const bs = new THREE.Mesh(sg, mat.streha);
    bs.position.set(bx, 11.5, bz);
    g.add(bs);
  }
  preprostaHisa({ x: -20, z: 26, w: 4, d: 6, h: 2.4, strehaH: 1.0, fasada: mat.belaFasada, streha: mat.streha });
  const hala = boks(mat.belaFasada, 26, 8, 42, -58, 4, -62);
  g.add(hala);
  kolizije.push(new THREE.Box3(new THREE.Vector3(-71, 0, -83), new THREE.Vector3(-45, 9, -41)));

  // ---------- cerkev z zvonikom (JV, čez sosednje parcele) ----------
  const cerkev = new THREE.Group();
  cerkev.add(boks(mat.cerkevFasada, 28, 11, 13, 6, 5.5, 0));
  const co = new THREE.Shape();
  co.moveTo(-7.2, 0);
  co.lineTo(7.2, 0);
  co.lineTo(0, 4.2);
  co.closePath();
  const cg = new THREE.ExtrudeGeometry(co, { depth: 29, bevelEnabled: false });
  cg.translate(0, 0, -14.5);
  const cerkStreha = new THREE.Mesh(cg, mat.opekaStreha);
  cerkStreha.rotation.y = Math.PI / 2;
  cerkStreha.position.set(6, 11, 0);
  cerkStreha.castShadow = true;
  cerkev.add(cerkStreha);
  cerkev.add(boks(mat.cerkevFasada, 6.5, 26, 6.5, -11, 13, 0)); // zvonik
  for (let i = 0; i < 4; i++) {
    const ura = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshStandardMaterial({ color: "#f5f0e0", roughness: 0.6 }));
    const kot = (i * Math.PI) / 2;
    ura.position.set(-11 + Math.sin(kot) * 3.28, 22.5, Math.cos(kot) * 3.28);
    ura.rotation.y = kot;
    cerkev.add(ura);
  }
  const spica = new THREE.Mesh(new THREE.ConeGeometry(4.4, 10, 4), new THREE.MeshStandardMaterial({ color: "#5f7268", roughness: 0.7 }));
  spica.position.set(-11, 31, 0);
  spica.rotation.y = Math.PI / 4;
  spica.castShadow = true;
  cerkev.add(spica);
  cerkev.add(boks(mat.kovinaTemna, 0.08, 1.6, 0.08, -11, 36.6, 0, false));
  cerkev.add(boks(mat.kovinaTemna, 0.6, 0.08, 0.08, -11, 36.9, 0, false));
  cerkev.position.set(34, 0, 44);
  g.add(cerkev);
  kolizije.push(new THREE.Box3(new THREE.Vector3(20, 0, 34), new THREE.Vector3(54, 40, 54)));

  // ---------- vzhod/ozadje: še nekaj hiš ----------
  preprostaHisa({ x: 22, z: -2, w: 9, d: 8, h: 5.2, strehaH: 2.2, fasada: mat.belaFasada, streha: mat.opekaStreha, rotY: 0.15 });
  preprostaHisa({ x: 34, z: 8, w: 9, d: 9, h: 5.0, strehaH: 2.2, fasada: mat.rumenaFasada, streha: mat.opekaStreha, rotY: -0.2 });

  // drevesa izven parcele (ulica, ozadje)
  drevo(-16, -34, 9, 2.6);
  drevo(-14.6, 24, 8, 2.2);
  drevo(24, 38, 8, 2.4);
  drevo(14, 44, 7, 2.2);
  drevo(40, -28, 10, 3);

  // ---------- ulične svetilke ----------
  for (const lz of [-24, 2, 32] as const) {
    const drog = boks(mat.kovinaTemna, 0.12, 7.5, 0.12, -17.6, 3.75, lz);
    g.add(drog);
    kolizijaOkoli(drog, kolizije);
    g.add(boks(mat.kovinaTemna, 1.5, 0.08, 0.08, -16.9, 7.45, lz, false));
    g.add(boks(mat.okvir, 0.5, 0.12, 0.22, -16.2, 7.4, lz, false));
    const luc = new THREE.PointLight("#ffdda6", 0, 26, 1.8);
    luc.position.set(-16.2, 7.1, lz);
    g.add(luc);
    lampe.push(luc);
  }

  // ---------- hribi in nebo ----------
  const hrib = (x: number, z: number, r: number, h: number) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), mat.hrib);
    m.position.set(x, h / 2 - 2, z);
    m.scale.y = 1;
    g.add(m);
  };
  hrib(80, -270, 170, 60);
  hrib(-150, -300, 210, 80);
  hrib(260, -90, 160, 65);
  hrib(210, 200, 180, 55);
  hrib(-280, 110, 190, 50);
  // grič s cerkvico severno (viden s Parmove)
  hrib(35, -175, 70, 48);
  const cerkvica = new THREE.Group();
  cerkvica.add(boks(mat.cerkevFasada, 5, 5, 8, 0, 2.5, 0, false));
  const cs = new THREE.Mesh(new THREE.ConeGeometry(2.2, 6, 4), new THREE.MeshStandardMaterial({ color: "#5f7268" }));
  cs.position.set(0, 9, -2);
  cerkvica.add(cs);
  cerkvica.add(boks(mat.cerkevFasada, 2.5, 7, 2.5, 0, 3.5, -2, false));
  cerkvica.position.set(35, 40, -175);
  g.add(cerkvica);

  const nebo = new THREE.Mesh(
    new THREE.SphereGeometry(380, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        vrh: { value: new THREE.Color("#7fb2e5") },
        dno: { value: new THREE.Color("#e6eef2") },
      },
      vertexShader: `varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 vrh; uniform vec3 dno; varying vec3 p; void main(){ float t = clamp(normalize(p).y * 1.6 + 0.18, 0.0, 1.0); gl_FragColor = vec4(mix(dno, vrh, t), 1.0); }`,
    })
  );
  g.add(nebo);

  return { skupina: g, kolizije, tla, lampe, blokMeshi, nebo };
}
