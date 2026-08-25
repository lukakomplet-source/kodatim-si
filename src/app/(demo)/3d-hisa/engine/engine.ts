import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ustvariMateriale } from "./materials";
import { zgradiHiso } from "./hisa";
import { zgradiOkolico } from "./okolica";
import { ustvariSvetlobo, type Cas } from "./svetloba";
import { Sprehod } from "./kontrole";

export type { Cas };
export type Nacin = "sprehod" | "ogled";

export type Motor = {
  nastaviCas: (cas: Cas) => void;
  nastaviNacin: (nacin: Nacin) => void;
  zahtevajSprehod: () => void;
  obLockChange: (cb: (zaklenjen: boolean) => void) => void;
  unici: () => void;
};

export type ZacetneNastavitve = {
  cas?: Cas;
  nacin?: Nacin;
  cam?: [number, number, number];
  look?: [number, number, number];
};

export function ustvariMotor(canvas: HTMLCanvasElement, zacetek: ZacetneNastavitve = {}): Motor {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scena = new THREE.Scene();
  const kamera = new THREE.PerspectiveCamera(68, 1, 0.1, 900);

  const mat = ustvariMateriale();
  const hisa = zgradiHiso(mat);
  const okolica = zgradiOkolico(mat);
  scena.add(hisa.skupina);
  scena.add(okolica.skupina);
  const kolizije = [...hisa.kolizije, ...okolica.kolizije];

  const svetloba = ustvariSvetlobo({
    scena,
    renderer,
    nebo: okolica.nebo,
    lampe: okolica.lampe,
    luckeHise: hisa.lucke,
    stekla: hisa.stekla,
    blokMeshi: okolica.blokMeshi,
    mat,
  });

  // --- načina kamere ---
  const orbit = new OrbitControls(kamera, canvas);
  orbit.target.set(0, 3.2, 0);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.maxPolarAngle = 1.52;
  orbit.minDistance = 4;
  orbit.maxDistance = 120;

  const sprehod = new Sprehod();
  let nacin: Nacin = zacetek.nacin ?? "ogled";

  kamera.position.set(...(zacetek.cam ?? [-26, 9, 16]));
  if (zacetek.look) orbit.target.set(...zacetek.look);
  orbit.update();

  // --- pointer lock za sprehod ---
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

  // --- velikost ---
  const nastaviVelikost = () => {
    const el = canvas.parentElement;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    renderer.setSize(w, h, false);
    kamera.aspect = w / h;
    kamera.updateProjectionMatrix();
  };
  nastaviVelikost();
  const opazovalec = new ResizeObserver(nastaviVelikost);
  if (canvas.parentElement) opazovalec.observe(canvas.parentElement);

  // --- zanka ---
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
      sprehod.update(dt, kolizije);
      kamera.position.copy(sprehod.polozaj);
      sprehod.smerPogleda(smer);
      kamera.lookAt(cilj.copy(sprehod.polozaj).add(smer));
    }
    renderer.render(scena, kamera);
  };

  svetloba.nastaviCas(zacetek.cas ?? "dan");
  zanka();

  return {
    nastaviCas: svetloba.nastaviCas,
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
