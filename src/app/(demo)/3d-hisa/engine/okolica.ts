import * as THREE from "three";
import type { Materiali } from "./materials";

/**
 * Okolica Parmove ulice 4 po Street View posnetkih: ulica sever–jug, čez cesto
 * parkirišče z garažami in dvema blokoma, severno sosed z nadstreškom, južno
 * rumena hiša z vrtno uto in za njo župnijska cerkev z zvonikom, v ozadju
 * hribi. Vse kategorija C (vizualni približek postavitve, ne geodetski posnetek).
 */

export type Okolica = {
  skupina: THREE.Group;
  kolizije: THREE.Box3[];
  lampe: THREE.PointLight[];
  blokMeshi: THREE.Mesh[];
  nebo: THREE.Mesh;
};

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

  g.add(ploskev(mat.tlakovci, 7.7, 11.4, -8.45, 0.1, 0.035, 2.6, 2.6)); // dovoz
  g.add(ploskev(mat.asfalt, 5.4, 170, -15.2, 0, 0.03, 6, 6)); // Parmova ulica
  g.add(ploskev(mat.asfalt, 9, 26, -22.4, -20, 0.03, 6, 6)); // parkirišče pred garažami
  g.add(ploskev(mat.asfalt, 3, 26, -19.4, 22, 0.03, 6, 6)); // parkirni pas J
  g.add(boks(mat.beton, 0.25, 0.14, 170, -12.05, 0.07, 0, false)); // robnik

  // parkirne črte
  const crta = new THREE.MeshBasicMaterial({ color: "#e8e8e8" });
  for (let i = 0; i < 8; i++) g.add(boks(crta, 2.4, 0.012, 0.12, -19.6, 0.075, 12 + i * 2.6, false));

  // ---------- naša parcela ----------
  // živa meja ob cesti (z odprtino za dovoz) + ob južni meji
  const meja = (sx: number, sz: number, x: number, z: number, h = 0.95) => {
    const m = boks(mat.zivaMeja, sx, h, sz, x, h / 2, z);
    g.add(m);
    kolizijaOkoli(m, kolizije);
  };
  meja(1.0, 7.2, -12.9, 3.8);
  meja(1.0, 3.0, -12.9, -7.2);
  meja(9.5, 1.0, -7.5, 10.4, 0.8);
  // gredica S od dovoza: grmi + lesen zaboj
  for (const [gx, gz, r] of [[-10.5, -7.5, 0.7], [-9.2, -8.3, 0.55], [-11.5, -6.2, 0.5]] as const) {
    const grm = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat.zivaMeja);
    grm.position.set(gx, r * 0.8, gz);
    grm.castShadow = true;
    g.add(grm);
  }
  const zaboj = boks(mat.les, 0.9, 0.5, 0.6, -5.6, 0.25, -6.6);
  g.add(zaboj);
  kolizijaOkoli(zaboj, kolizije);
  // zelena stebrička z verigo na J robu dovoza
  for (const pz of [6.2, 8.6] as const) {
    const st = boks(mat.zelenaKovina, 0.08, 0.95, 0.08, -11.6, 0.48, pz);
    g.add(st);
    kolizijaOkoli(st, kolizije);
  }
  const krivulja = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-11.6, 0.9, 6.2),
    new THREE.Vector3(-11.6, 0.55, 7.4),
    new THREE.Vector3(-11.6, 0.9, 8.6)
  );
  const veriga = new THREE.Mesh(new THREE.TubeGeometry(krivulja, 12, 0.02, 5), mat.kovinaTemna);
  g.add(veriga);

  // ---------- preprosta hiša (sosedje) ----------
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

  // sever: sosed z lesenim pasom in nadstreškom za avte
  preprostaHisa({ x: 0.5, z: -16.5, w: 9, d: 10, h: 5.6, strehaH: 2.1, slemeX: true, fasada: mat.belaFasada, streha: mat.opekaStreha, pas: true });
  const nadstresek = new THREE.Group();
  nadstresek.add(boks(mat.kovinaTemna, 5.2, 0.12, 5.4, 0, 2.35, 0));
  for (const [nx, nz] of [[-2.4, -2.5], [2.4, -2.5], [-2.4, 2.5], [2.4, 2.5]] as const) {
    nadstresek.add(boks(mat.kovinaTemna, 0.1, 2.35, 0.1, nx, 1.18, nz));
  }
  nadstresek.position.set(-8.2, 0, -15.5);
  g.add(nadstresek);

  // jug: rumena hiša, vrtna uta, mrežna ograja
  preprostaHisa({ x: 2.5, z: 17.5, w: 10, d: 9, h: 5.4, strehaH: 2.3, slemeX: true, fasada: mat.rumenaFasada, streha: mat.opekaStreha });
  const uta = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const kot = (i / 6) * Math.PI * 2;
    uta.add(boks(mat.les, 0.09, 2.2, 0.09, Math.cos(kot) * 1.7, 1.1, Math.sin(kot) * 1.7));
  }
  const utaStreha = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 6), mat.kovinaTemna);
  utaStreha.position.y = 2.8;
  utaStreha.castShadow = true;
  uta.add(utaStreha);
  uta.position.set(9.5, 0, 20);
  g.add(uta);
  const ograjaJ = boks(mat.ograjaMreza, 24, 1.9, 0.05, 0, 0.95, 11.6);
  g.add(ograjaJ);
  kolizijaOkoli(ograjaJ, kolizije);

  // zahod: vrsta garaž, dva bloka, lope, hala
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
  preprostaHisa({ x: -20, z: 24, w: 4, d: 6, h: 2.4, strehaH: 1.0, fasada: mat.belaFasada, streha: mat.streha });
  const hala = boks(mat.belaFasada, 26, 8, 42, -58, 4, -62);
  g.add(hala);
  kolizije.push(new THREE.Box3(new THREE.Vector3(-71, 0, -83), new THREE.Vector3(-45, 9, -41)));

  // ---------- cerkev z zvonikom (JV) ----------
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
  preprostaHisa({ x: 20, z: -14, w: 9, d: 8, h: 5.2, strehaH: 2.2, fasada: mat.belaFasada, streha: mat.opekaStreha, rotY: 0.15 });
  preprostaHisa({ x: 16, z: 26, w: 8, d: 8, h: 4.8, strehaH: 2.0, slemeX: true, fasada: mat.cerkevFasada, streha: mat.opekaStreha });
  preprostaHisa({ x: 34, z: 6, w: 9, d: 9, h: 5.0, strehaH: 2.2, fasada: mat.rumenaFasada, streha: mat.opekaStreha, rotY: -0.2 });

  // ---------- drevesa ----------
  const drevo = (x: number, z: number, h: number, r: number) => {
    const d = new THREE.Group();
    const deblo = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, h * 0.5, 7), mat.deblo);
    deblo.position.y = h * 0.25;
    deblo.castShadow = true;
    d.add(deblo);
    for (const [ox, oy, oz, or2] of [[0, h * 0.62, 0, r], [r * 0.5, h * 0.52, r * 0.3, r * 0.7], [-r * 0.45, h * 0.55, -r * 0.25, r * 0.65]] as const) {
      const li = new THREE.Mesh(new THREE.SphereGeometry(or2, 10, 8), mat.listje);
      li.position.set(ox, oy, oz);
      li.scale.y = 0.85;
      li.castShadow = true;
      d.add(li);
    }
    d.position.set(x, 0, z);
    g.add(d);
    kolizije.push(new THREE.Box3(new THREE.Vector3(x - 0.25, 0, z - 0.25), new THREE.Vector3(x + 0.25, 3, z + 0.25)));
  };
  drevo(-14.2, 12, 7, 1.9);
  drevo(-14.2, 20, 8, 2.2);
  drevo(-14.2, 29, 7.5, 2.0);
  drevo(-16, -34, 9, 2.6);
  drevo(-2, 13.5, 6.5, 2.0); // obrezano drevo pri rumeni hiši
  drevo(8, -9, 5, 1.5);
  drevo(9, 8.5, 6, 1.8);
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

  return { skupina: g, kolizije, lampe, blokMeshi, nebo };
}
