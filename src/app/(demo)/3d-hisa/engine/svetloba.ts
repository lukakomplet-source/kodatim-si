import * as THREE from "three";
import type { Materiali } from "./materials";

/** Trije časi dneva — vsak preset premakne sonce, nebo, meglo in luči. */
export type Cas = "dan" | "zahod" | "noc";

type Preset = {
  soncePos: [number, number, number];
  sonceBarva: string;
  sonceMoc: number;
  hemiNebo: string;
  hemiTla: string;
  hemiMoc: number;
  neboVrh: string;
  neboDno: string;
  megla: string;
  meglaOd: number;
  meglaDo: number;
  ekspozicija: number;
  lampeMoc: number;
  oknaPrizgana: boolean;
  zvezde: boolean;
};

const PRESETI: Record<Cas, Preset> = {
  dan: {
    soncePos: [-48, 62, 38], sonceBarva: "#fff1d8", sonceMoc: 2.9,
    hemiNebo: "#bdd9f5", hemiTla: "#8b9370", hemiMoc: 0.55,
    neboVrh: "#6fa8dd", neboDno: "#e8eef2",
    megla: "#dfe8ee", meglaOd: 90, meglaDo: 360, ekspozicija: 1.0,
    lampeMoc: 0, oknaPrizgana: false, zvezde: false,
  },
  zahod: {
    soncePos: [-75, 14, 14], sonceBarva: "#ff9a4d", sonceMoc: 2.6,
    hemiNebo: "#dfa06e", hemiTla: "#54493e", hemiMoc: 0.4,
    neboVrh: "#5d5487", neboDno: "#f2ae67",
    megla: "#d9a077", meglaOd: 70, meglaDo: 320, ekspozicija: 0.95,
    lampeMoc: 10, oknaPrizgana: true, zvezde: false,
  },
  noc: {
    soncePos: [55, 60, -35], sonceBarva: "#a9c1e8", sonceMoc: 0.22,
    hemiNebo: "#1e2c48", hemiTla: "#0d1016", hemiMoc: 0.28,
    neboVrh: "#0a1226", neboDno: "#1d2d46",
    megla: "#101a2c", meglaOd: 45, meglaDo: 280, ekspozicija: 0.92,
    lampeMoc: 16, oknaPrizgana: true, zvezde: true,
  },
};

export type Svetloba = {
  sonce: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  zvezde: THREE.Points;
  nastaviCas: (cas: Cas) => void;
};

export function ustvariSvetlobo(ctx: {
  scena: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  nebo: THREE.Mesh;
  lampe: THREE.PointLight[];
  luckeHise: THREE.PointLight[];
  stekla: THREE.Mesh[];
  blokMeshi: THREE.Mesh[];
  mat: Materiali;
}): Svetloba {
  const sonce = new THREE.DirectionalLight("#ffffff", 3);
  sonce.castShadow = true;
  sonce.shadow.mapSize.set(2048, 2048);
  sonce.shadow.camera.left = -48;
  sonce.shadow.camera.right = 48;
  sonce.shadow.camera.top = 48;
  sonce.shadow.camera.bottom = -48;
  sonce.shadow.camera.far = 400;
  sonce.shadow.bias = -0.0002;
  sonce.shadow.normalBias = 0.6;
  ctx.scena.add(sonce);
  ctx.scena.add(sonce.target);

  const hemi = new THREE.HemisphereLight("#bdd9f5", "#8b9370", 0.55);
  ctx.scena.add(hemi);

  // zvezde — točke na kupoli, vidne samo ponoči
  const zvezdePoz: number[] = [];
  for (let i = 0; i < 700; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = Math.asin(Math.random() * 0.95 + 0.05);
    const r = 360;
    zvezdePoz.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
  }
  const zvezdeGeo = new THREE.BufferGeometry();
  zvezdeGeo.setAttribute("position", new THREE.Float32BufferAttribute(zvezdePoz, 3));
  const zvezde = new THREE.Points(
    zvezdeGeo,
    new THREE.PointsMaterial({ color: "#cfe0ff", size: 1.6, sizeAttenuation: false, fog: false })
  );
  zvezde.visible = false;
  ctx.scena.add(zvezde);

  const originalSteklo = ctx.stekla.map((s) => s.material);

  // okoljski odsev iz neba — steklo in kovina odsevata nebo, ne črnine;
  // regenerira se ob vsaki menjavi časa dneva
  const pmrem = new THREE.PMREMGenerator(ctx.renderer);
  const neboScena = new THREE.Scene();
  neboScena.add(new THREE.Mesh(ctx.nebo.geometry, ctx.nebo.material));
  let okolje: THREE.WebGLRenderTarget | null = null;

  const nastaviCas = (cas: Cas) => {
    const p = PRESETI[cas];
    sonce.position.set(...p.soncePos);
    sonce.color.set(p.sonceBarva);
    sonce.intensity = p.sonceMoc;
    hemi.color.set(p.hemiNebo);
    hemi.groundColor.set(p.hemiTla);
    hemi.intensity = p.hemiMoc;
    const uni = (ctx.nebo.material as THREE.ShaderMaterial).uniforms;
    uni.vrh.value.set(p.neboVrh);
    uni.dno.value.set(p.neboDno);
    ctx.scena.fog = new THREE.Fog(p.megla, p.meglaOd, p.meglaDo);
    ctx.renderer.toneMappingExposure = p.ekspozicija;
    ctx.lampe.forEach((l) => (l.intensity = p.lampeMoc));
    ctx.luckeHise.forEach((l) => (l.intensity = p.oknaPrizgana ? 5 : 0));
    ctx.stekla.forEach((s, i) => {
      // prižgana so vsaka druga okna — stalen, ne naključen izbor
      s.material = p.oknaPrizgana && i % 2 === 0 ? ctx.mat.oknoNoc : originalSteklo[i];
    });
    ctx.blokMeshi.forEach((b) => (b.material = p.oknaPrizgana ? ctx.mat.blokNoc : ctx.mat.blokDan));
    zvezde.visible = p.zvezde;
    okolje?.dispose();
    okolje = pmrem.fromScene(neboScena);
    ctx.scena.environment = okolje.texture;
    ctx.scena.environmentIntensity = 0.35;
  };

  return { sonce, hemi, zvezde, nastaviCas };
}
