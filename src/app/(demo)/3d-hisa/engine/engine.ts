import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ustvariMateriale } from "./materials";
import { zgradiHiso } from "./hisa";
import { zgradiPrenovo } from "./prenova";
import { zgradiOkolico } from "./okolica";
import { ustvariSvetlobo, type Cas } from "./svetloba";
import { Sprehod } from "./kontrole";
import { ustvariKakovost } from "./kakovost";
import { izrisiSSledilnikom } from "./sledilnik";
import { ustvariRezanje, type IzbranaEtaza, type NastavitvePrereza } from "./rezanje";
import { NACRT } from "./nacrt";

export type { Cas };
export type { IzbranaEtaza, NastavitvePrereza };
export type Nacin = "sprehod" | "ogled";
export type Varianta = "obstojece" | "prenova";

export type Motor = {
  nastaviCas: (cas: Cas) => void;
  nastaviNacin: (nacin: Nacin) => void;
  nastaviVarianto: (v: Varianta) => void;
  zahtevajSprehod: () => void;
  /** Odreži vse nad izbrano etažo (hiša za lutke). */
  nastaviEtazo: (e: IzbranaEtaza) => void;
  /** Navpičen prerez skozi hišo, kot v SolidWorksu. */
  nastaviPrerez: (n: NastavitvePrereza) => void;
  /** Razpon drsnika prereza v metrih modela. */
  mejePrereza: () => { x: [number, number]; z: [number, number] };
  /**
   * Fotoreal: izostri trenutni pogled z veliko vzorci in shrani PNG.
   * Vse izriše tukajšnja grafična kartica — nič ne gre v oblak.
   */
  fotoreal: (vzorcev?: number, obNapredku?: (n: number, skupaj: number) => void) => Promise<void>;
  /**
   * Sledilnik poti: pravi izračun svetlobe z odboji. Traja minute, teče na
   * tukajšnji grafični kartici in vrne PNG.
   */
  sledilnik: (
    vzorcev?: number,
    obNapredku?: (n: number, skupaj: number, korak: string) => void
  ) => Promise<void>;
  /** Koliko vzorcev ima trenutna slika (za napis "izostrujem …"). */
  vzorcev: () => { zdaj: number; najvec: number };
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
  /**
   * `preserveDrawingBuffer` je nujen, ker sliko s platna beremo (izvoz kadrov,
   * sledilnik poti). Brez njega brskalnik vsebino platna po izrisu zavrže in
   * `toBlob` vrne prazno sliko — ne vedno, ampak odvisno od trenutka, kar je
   * najslabša vrsta napake.
   */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
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

  /**
   * Kakovost slike (ambientna okluzija + akumulacija vzorcev). Ustvari se za
   * svetlobo, ker potrebuje sonce: mehka senca nastane tako, da se sonce med
   * vzorci premika po svojem disku.
   */
  const kakovost = ustvariKakovost({ renderer, scena, kamera, sonce: svetloba.sonce });

  /**
   * Rezanje modela. Materiale hiše dobi PO tem, ko sta obe varianti zgrajeni,
   * ker si ob zagonu naredi kopije tistih, ki jih uporablja tudi okolica.
   */
  const rezanje = ustvariRezanje({
    renderer,
    hisa: [hisa.skupina, prenova.skupina],
    okolica: okolica.skupina,
    kote: {
      pritlicjeStrop: NACRT.pritlicjeStrop,
      nadstropjeStrop: NACRT.nadstropjeStrop,
      kapY: NACRT.podstrehaTla + NACRT.kolencna,
    },
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
    kakovost.nastaviVelikost(el.clientWidth, el.clientHeight);
  };
  nastaviVelikost();
  const opazovalec = new ResizeObserver(nastaviVelikost);
  if (canvas.parentElement) opazovalec.observe(canvas.parentElement);

  const prejsnjaLega = new THREE.Matrix4();
  const ura = new THREE.Clock();
  const smer = new THREE.Vector3();
  const cilj = new THREE.Vector3();
  let ziv = true;
  /**
   * Med izvozom (Fotoreal, sledilnik poti) zanka miruje. Sicer bi si zanka in
   * izvoz podajala isto platno: zanka bi vsak drugi izris povozila z zaslonsko
   * različico, izvoz pa bi tekel v 4K pri vsaki sličici — počasneje in narobe.
   */
  let izrisPavziran = false;
  const zanka = () => {
    if (!ziv) return;
    requestAnimationFrame(zanka);
    if (izrisPavziran) return;
    const dt = Math.min(ura.getDelta(), 0.05);
    if (nacin === "ogled") {
      orbit.update();
    } else {
      sprehod.update(dt);
      kamera.position.copy(sprehod.polozaj);
      sprehod.smerPogleda(smer);
      kamera.lookAt(cilj.copy(sprehod.polozaj).add(smer));
    }
    /**
     * Ali se je kamera premaknila, ugotovimo iz njene matrike, ne iz dogodkov
     * kontrol: dušenje (damping) premika kamero še sekundo po tem, ko miška
     * obmiruje, in dogodkovni pristop bi akumulacijo začel prezgodaj — slika bi
     * se izostrila okoli položaja, ki ga kamera šele zapušča, in bi se ob
     * ustavitvi vidno "prelomila".
     */
    kamera.updateMatrixWorld();
    const premika = !kamera.matrixWorld.equals(prejsnjaLega);
    prejsnjaLega.copy(kamera.matrixWorld);
    kakovost.korak(premika);
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
      /**
       * Beauty gre skozi isto akumulacijo kot pogled v brskalniku — kader za
       * nadaljnjo obdelavo mora biti najboljši, kar zna ta stroj, sicer se
       * njegove pomanjkljivosti prenesejo naprej. Globina in normale pa gresta
       * skozi surov izris: tam je vsak filter napaka, ne izboljšava.
       */
      const izostrena = await kakovost.zajemi(96);
      if (izostrena) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(izostrena);
        a.download = `${k.ime}_beauty.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
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
    nastaviCas: (c) => {
      svetloba.nastaviCas(c);
      kakovost.ponastavi(); // druga svetloba = druga slika, stari vzorci ne veljajo
    },
    izvoziKadre,
    fotoreal: async (vzorcev = 400, obNapredku) => {
      izrisPavziran = true;
      let blob: Blob | null = null;
      try {
        blob = await kakovost.zajemi(vzorcev, obNapredku);
      } finally {
        izrisPavziran = false;
        kakovost.ponastavi();
      }
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `fotoreal_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    },
    vzorcev: () => ({ zdaj: kakovost.vzorcev(), najvec: kakovost.najvecVzorcev }),
    nastaviEtazo: (e) => {
      rezanje.nastaviEtazo(e);
      kakovost.ponastavi(); // druga slika, stari vzorci ne veljajo
    },
    nastaviPrerez: (n) => {
      rezanje.nastaviPrerez(n);
      kakovost.ponastavi();
    },
    mejePrereza: () => rezanje.meje,
    sledilnik: async (vzorcev = 300, obNapredku) => {
      izrisPavziran = true;
      let izid: { blob: Blob | null; vzorcev: number } = { blob: null, vzorcev: 0 };
      try {
        izid = await izrisiSSledilnikom({
          renderer,
          scena,
          kamera,
          // Nebo in zvezde imata lasten senčilnik, ki ga sledilnik ne pozna.
          skrij: [okolica.nebo, svetloba.zvezde],
          nebo: okolica.nebo,
          vzorcev,
          faktor: 2,
          obNapredku,
        });
      } finally {
        izrisPavziran = false;
        // Sledilnik je zamenjal velikost in ozadje; akumulacija mora začeti znova.
        nastaviVelikost();
        kakovost.ponastavi();
      }
      if (!izid.blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(izid.blob);
      a.download = `sledilnik_${izid.vzorcev}vz_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    },
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
      kakovost.ponastavi();
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
      rezanje.unici();
      kakovost.unici();
      renderer.dispose();
    },
  };
}
