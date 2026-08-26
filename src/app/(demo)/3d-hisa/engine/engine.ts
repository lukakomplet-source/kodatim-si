import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ustvariMateriale } from "./materials";
import { zgradiHiso } from "./hisa";
import { zgradiPrenovo } from "./prenova";
import { zgradiOkolico } from "./okolica";
import { ustvariSvetlobo, type Cas } from "./svetloba";
import { Sprehod } from "./kontrole";

export type { Cas };
export type Nacin = "sprehod" | "ogled";
export type Varianta = "obstojece" | "prenova";

export type Motor = {
  nastaviCas: (cas: Cas) => void;
  nastaviNacin: (nacin: Nacin) => void;
  nastaviVarianto: (v: Varianta) => void;
  zahtevajSprehod: () => void;
  obLockChange: (cb: (zaklenjen: boolean) => void) => void;
  /** Izvozi kadre za lokalni AI render (beauty + globina + normale za vsak kader). */
  izvoziKadre: (obKadru?: (opravljeno: number, skupaj: number, ime: string) => void) => Promise<void>;
  unici: () => void;
};

/** Kadri za lokalni AI render pipeline (render-pipeline/README.md). */
const RENDER_KADRI: { ime: string; cam: [number, number, number]; look: [number, number, number] }[] = [
  { ime: "EXTERIOR_FRONT", cam: [-13.5, 5.5, 0.5], look: [0, 3.5, 0] }, // z zahoda (ulica)
  { ime: "EXTERIOR_BACK", cam: [11, 5, -4], look: [0, 3.5, 0] }, // z vzhoda (stopnišče)
  { ime: "EXTERIOR_SIDE", cam: [-7, 4, 13], look: [0, 3.5, 0] }, // z juga
  { ime: "EXTERIOR_TOP", cam: [0.5, 42, 3], look: [0, 0, 2.9] }, // situacija od zgoraj
  { ime: "GROUND_FLOOR", cam: [-2.2, 1.65, 2.6], look: [2.5, 1.2, -0.5] }, // dnevni → kuhinja
  { ime: "FIRST_FLOOR", cam: [-2.8, 4.35, 2.8], look: [2, 3.9, -1.5] }, // dnevni 1N
  { ime: "ATTIC", cam: [-2.6, 7.05, 3.2], look: [2, 6.6, -2] }, // podstreha
  { ime: "LIVING_ROOM", cam: [1.2, 1.7, 4.4], look: [-3.5, 1.1, 0.5] }, // dnevni pritličje
  { ime: "KITCHEN", cam: [0.6, 1.7, 0.4], look: [4.2, 1.1, 0.3] }, // kuhinja pritličje
  { ime: "STAIRCASE", cam: [5.6, 1.6, -2.0], look: [6.6, 3.2, 2.2] }, // jekleno stopnišče
  { ime: "BATHROOM", cam: [2.2, 1.65, -1.1], look: [4.2, 1.2, -2.4] }, // kopalnica pritličje
  { ime: "BEDROOM", cam: [-4.0, 1.65, -0.9], look: [-2.5, 1.1, -4.5] }, // spalnica pritličje
];

export type ZacetneNastavitve = {
  cas?: Cas;
  nacin?: Nacin;
  varianta?: Varianta;
  cam?: [number, number, number];
  look?: [number, number, number];
  spawn?: [number, number, number];
};

const pavza = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export async function ustvariMotor(
  canvas: HTMLCanvasElement,
  zacetek: ZacetneNastavitve = {},
  obNapredku?: (odstotek: number, korak: string) => void
): Promise<Motor> {
  const javi = (p: number, k: string) => obNapredku?.(p, k);

  javi(5, "Priprava prikazovalnika");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scena = new THREE.Scene();
  const kamera = new THREE.PerspectiveCamera(68, 1, 0.1, 900);
  await pavza();

  javi(18, "Materiali (Prefalz, travertin, granitogres …)");
  const mat = ustvariMateriale();
  await pavza();

  javi(34, "Obstoječe stanje (Street View)");
  const hisa = zgradiHiso(mat);
  scena.add(hisa.skupina);
  await pavza();

  javi(55, "Prenova po PZI načrtih (etaže, stopnišče, frčada)");
  const prenova = zgradiPrenovo(mat);
  scena.add(prenova.skupina);
  await pavza();

  javi(76, "Okolica (Parmova ulica, sosedje, cerkev)");
  const okolica = zgradiOkolico(mat);
  scena.add(okolica.skupina);
  await pavza();

  javi(90, "Svetloba in sence");
  const svetloba = ustvariSvetlobo({
    scena,
    renderer,
    nebo: okolica.nebo,
    lampe: okolica.lampe,
    luckeHise: [...hisa.lucke, ...prenova.lucke],
    stekla: [...hisa.stekla, ...prenova.stekla],
    blokMeshi: okolica.blokMeshi,
    mat,
  });

  const orbit = new OrbitControls(kamera, canvas);
  orbit.target.set(0, 3.2, 0);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.maxPolarAngle = 1.52;
  orbit.minDistance = 4;
  orbit.maxDistance = 120;

  const sprehod = new Sprehod();
  let nacin: Nacin = zacetek.nacin ?? "ogled";
  let varianta: Varianta = zacetek.varianta ?? "prenova";

  const uporabiVarianto = () => {
    hisa.skupina.visible = varianta === "obstojece";
    prenova.skupina.visible = varianta === "prenova";
    const kolizije =
      varianta === "obstojece"
        ? [...hisa.kolizije, ...okolica.kolizije]
        : [...prenova.kolizije, ...okolica.kolizije];
    const tla =
      varianta === "prenova" ? [...prenova.tla, ...okolica.tla] : [...okolica.tla];
    sprehod.nastaviSvet(kolizije, tla);
  };
  uporabiVarianto();

  // Podatki za avtomatski QA prehodnosti (scripts/qa-sprehod.mjs) — samo prenova.
  const box3 = (b: THREE.Box3) => [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z];
  (window as unknown as { __hisaQA?: object }).__hisaQA = {
    kolizije: [...prenova.kolizije, ...okolica.kolizije].map(box3),
    tla: [...prenova.tla, ...okolica.tla].map(box3),
  };

  if (zacetek.spawn) sprehod.polozaj.set(...zacetek.spawn);
  kamera.position.set(...(zacetek.cam ?? [-26, 9, 16]));
  if (zacetek.look) orbit.target.set(...zacetek.look);
  orbit.update();

  let obLock: ((z: boolean) => void) | null = null;
  const lockChange = () => {
    const zaklenjen = document.pointerLockElement === canvas;
    if (!zaklenjen) sprehod.spustiVse();
    obLock?.(zaklenjen);
  };
  const premikMiske = (e: MouseEvent) => {
    if (nacin === "sprehod" && document.pointerLockElement === canvas) {
      sprehod.premakniMisko(e.movementX, e.movementY);
    }
  };
  const tipkaDol = (e: KeyboardEvent) => {
    if (nacin !== "sprehod") return;
    sprehod.tipka(e.code, true);
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  };
  const tipkaGor = (e: KeyboardEvent) => sprehod.tipka(e.code, false);
  document.addEventListener("pointerlockchange", lockChange);
  document.addEventListener("mousemove", premikMiske);
  window.addEventListener("keydown", tipkaDol);
  window.addEventListener("keyup", tipkaGor);

  const nastaviVelikost = () => {
    const el = canvas.parentElement;
    if (!el) return;
    renderer.setSize(el.clientWidth, el.clientHeight, false);
    kamera.aspect = el.clientWidth / el.clientHeight;
    kamera.updateProjectionMatrix();
  };
  nastaviVelikost();
  const opazovalec = new ResizeObserver(nastaviVelikost);
  if (canvas.parentElement) opazovalec.observe(canvas.parentElement);

  const ura = new THREE.Clock();
  const smer = new THREE.Vector3();
  const cilj = new THREE.Vector3();
  let ziv = true;
  const zanka = () => {
    if (!ziv) return;
    requestAnimationFrame(zanka);
    const dt = Math.min(ura.getDelta(), 0.05);
    if (nacin === "ogled") {
      orbit.update();
    } else {
      sprehod.update(dt);
      kamera.position.copy(sprehod.polozaj);
      sprehod.smerPogleda(smer);
      kamera.lookAt(cilj.copy(sprehod.polozaj).add(smer));
    }
    renderer.render(scena, kamera);
  };

  svetloba.nastaviCas(zacetek.cas ?? "dan");
  javi(100, "Pripravljeno");
  zanka();

  // Izvoz kadrov za lokalni AI render: za vsak kader beauty + globina + normale.
  // Vse teče lokalno v brskalniku (toBlob + prenos), brez strežnika.
  const izvoziKadre = async (obKadru?: (opravljeno: number, skupaj: number, ime: string) => void) => {
    const W = 1600;
    const H = 900;
    const staraVelikost = new THREE.Vector2();
    renderer.getSize(staraVelikost);
    const staroRazmerje = kamera.aspect;
    renderer.setSize(W, H, false);
    kamera.aspect = W / H;
    kamera.updateProjectionMatrix();
    // linearna globina (bela = blizu, razpon 1..35 m) — uporabno za ControlNet
    const globinaMat = new THREE.ShaderMaterial({
      vertexShader: `varying float vz; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vz = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vz; void main(){ float d = clamp(1.0 - (vz - 1.0) / 34.0, 0.0, 1.0); gl_FragColor = vec4(vec3(d), 1.0); }`,
    });
    const normaleMat = new THREE.MeshNormalMaterial();
    const prenesi = (ime: string) =>
      new Promise<void>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = ime;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          }
          resolve();
        }, "image/png");
      });
    let i = 0;
    for (const k of RENDER_KADRI) {
      i++;
      obKadru?.(i, RENDER_KADRI.length, k.ime);
      kamera.position.set(...k.cam);
      kamera.lookAt(...k.look);
      kamera.updateMatrixWorld();
      renderer.render(scena, kamera);
      await prenesi(`${k.ime}_beauty.png`);
      scena.overrideMaterial = globinaMat;
      renderer.render(scena, kamera);
      await prenesi(`${k.ime}_depth.png`);
      scena.overrideMaterial = normaleMat;
      renderer.render(scena, kamera);
      await prenesi(`${k.ime}_normal.png`);
      scena.overrideMaterial = null;
      await new Promise((r) => setTimeout(r, 350)); // da brskalnik požre prenose
    }
    renderer.setSize(staraVelikost.x, staraVelikost.y, false);
    kamera.aspect = staroRazmerje;
    kamera.updateProjectionMatrix();
    nastaviVelikost();
  };

  return {
    nastaviCas: svetloba.nastaviCas,
    izvoziKadre,
    nastaviNacin: (n) => {
      nacin = n;
      orbit.enabled = n === "ogled";
      if (n === "ogled") {
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        kamera.position.set(-26, 9, 16);
        orbit.target.set(0, 3.2, 0);
        orbit.update();
      }
    },
    nastaviVarianto: (v) => {
      varianta = v;
      uporabiVarianto();
    },
    zahtevajSprehod: () => {
      if (nacin === "sprehod") canvas.requestPointerLock();
    },
    obLockChange: (cb) => {
      obLock = cb;
    },
    unici: () => {
      ziv = false;
      opazovalec.disconnect();
      document.removeEventListener("pointerlockchange", lockChange);
      document.removeEventListener("mousemove", premikMiske);
      window.removeEventListener("keydown", tipkaDol);
      window.removeEventListener("keyup", tipkaGor);
      orbit.dispose();
      renderer.dispose();
    },
  };
}
