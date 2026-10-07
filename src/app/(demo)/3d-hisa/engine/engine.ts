import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PROMO_KADRI, narisiOznake, volumniEnot, type Oznaka } from "./promo";
import { stanjeVidea, narisiKartico } from "./video";
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
  /** Promo slike (3 enote, ločeni vhodi) v 3840×2160 z vžganimi oznakami. */
  promo: (obKadru?: (opravljeno: number, skupaj: number, ime: string, odstotek: number) => void, vzorcev?: number) => Promise<void>;
  /**
   * Ena sličica promo videa (engine/video.ts) v času `t` sekund. Video se
   * izriše offline sličico za sličico (scripts/video-hisa.mjs) — po prvem
   * klicu zaslonska zanka miruje do ponovnega nalaganja strani.
   */
  videoSlicica: (t: number, w?: number, h?: number, vzorcev?: number) => Promise<Blob | null>;
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

  // Promo video: ravnina in volumni enot se ustvarijo ob prvi sličici.
  const videoRavnina = new THREE.Plane(new THREE.Vector3(0, 0, -1), 99);
  let videoVolumni: THREE.Group | null = null;

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
    promo: async (obKadru, vzorcev = 320) => {
      /**
       * Vsak kader: kamera in (po potrebi) prerez, izostritev v 3840×2160,
       * nato oznake na 2D platno. Točke oznak projicira ISTA kamera z istim
       * razmerjem stranic kot izvoz — sicer bi puščice zgrešile vrata.
       */
      izrisPavziran = true;
      const W = 3840;
      const H = 2160;
      const stara = { pos: kamera.position.clone(), fov: kamera.fov, aspect: kamera.aspect, cilj: orbit.target.clone() };
      const ravnina = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
      try {
        let i = 0;
        for (const k of PROMO_KADRI) {
          i++;
          rezanje.nastaviEtazo("vse");
          rezanje.nastaviPrerez(k.prerez ?? { vklopljen: false, os: "z", polozaj: 0, obrnjen: false });
          let volumni: THREE.Group | null = null;
          if (k.volumni && k.prerez) {
            ravnina.normal.set(k.prerez.os === "x" ? -1 : 0, 0, k.prerez.os === "z" ? -1 : 0);
            ravnina.constant = k.prerez.polozaj;
            volumni = volumniEnot(ravnina);
            scena.add(volumni);
          }
          const staroSonce = svetloba.sonce.position.clone();
          if (k.sonce) svetloba.sonce.position.set(...k.sonce);
          const skrita = k.brezDreves ? okolica.drevesa.filter((d) => d.position.length() < 18) : [];
          for (const d of skrita) d.visible = false;
          kamera.fov = k.fov;
          kamera.aspect = W / H;
          kamera.position.set(...k.cam);
          kamera.lookAt(...k.look);
          kamera.updateProjectionMatrix();
          kamera.updateMatrixWorld();
          const blob = await kakovost.zajemi(vzorcev, (n, skupaj) => obKadru?.(i, PROMO_KADRI.length, k.ime, Math.round((n / skupaj) * 100)), 1, { w: W, h: H });
          svetloba.sonce.position.copy(staroSonce);
          for (const d of skrita) d.visible = true;
          if (volumni) {
            scena.remove(volumni);
            volumni.traverse((o) => {
              if (o instanceof THREE.Mesh) {
                o.geometry.dispose();
                (o.material as THREE.Material).dispose();
              }
            });
          }
          if (!blob) continue;
          const slika = await createImageBitmap(blob);
          const platno = document.createElement("canvas");
          platno.width = slika.width;
          platno.height = slika.height;
          const c2 = platno.getContext("2d");
          if (!c2) continue;
          c2.drawImage(slika, 0, 0);
          kamera.aspect = slika.width / slika.height;
          kamera.updateProjectionMatrix();
          const v = new THREE.Vector3();
          const zarek = new THREE.Raycaster();
          narisiOznake(c2, slika.width, slika.height, k, (o) => {
            const tocka = new THREE.Vector3(...o.tocka);
            if (!o.skozi) {
              // Je točka res vidna? Žarek od kamere do točke ne sme prej zadeti česa drugega.
              const smer = tocka.clone().sub(kamera.position);
              const razdalja = smer.length();
              zarek.set(kamera.position, smer.normalize());
              zarek.far = razdalja - 0.3;
              const zadetek = zarek
                .intersectObjects([prenova.skupina, okolica.skupina], true)
                .find((z) => z.object.visible && z.object !== okolica.nebo);
              if (zadetek) return null;
            }
            v.copy(tocka).project(kamera);
            if (v.z > 1 || v.z < -1) return null;
            return { x: ((v.x + 1) / 2) * slika.width, y: ((1 - v.y) / 2) * slika.height };
          });
          const izhod = await new Promise<Blob | null>((r) => platno.toBlob(r, "image/png"));
          if (izhod) {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(izhod);
            a.download = `promo_${k.ime}.png`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          }
          await new Promise((r) => setTimeout(r, 400)); // da brskalnik požre prenos
        }
      } finally {
        rezanje.nastaviPrerez({ vklopljen: false, os: "z", polozaj: 0, obrnjen: false });
        rezanje.nastaviEtazo("vse");
        kamera.fov = stara.fov;
        kamera.aspect = stara.aspect;
        kamera.position.copy(stara.pos);
        orbit.target.copy(stara.cilj);
        kamera.updateProjectionMatrix();
        orbit.update();
        izrisPavziran = false;
        nastaviVelikost();
        kakovost.ponastavi();
      }
    },
    videoSlicica: async (t, W = 1920, H = 1080, vzorcev = 12) => {
      izrisPavziran = true;
      const st = stanjeVidea(t);
      rezanje.nastaviEtazo("vse");
      // Prerez kot v kadru 04: os z, ohranjeno vse z ≤ položaj.
      rezanje.nastaviPrerez(
        st.prerez === null ? { vklopljen: false, os: "z", polozaj: 0, obrnjen: false } : { vklopljen: true, os: "z", polozaj: st.prerez, obrnjen: false }
      );
      if (!videoVolumni) {
        videoVolumni = volumniEnot(videoRavnina);
        scena.add(videoVolumni);
      }
      videoRavnina.normal.set(0, 0, -1);
      videoRavnina.constant = st.prerez ?? 99;
      videoVolumni.children.forEach((m, i) => {
        const mat = (m as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = 0.38 * st.volumni[i];
        m.visible = st.volumni[i] > 0.01;
      });
      svetloba.sonce.position.set(...st.sonce);
      for (const d of okolica.drevesa) if (d.position.length() < 18) d.visible = !st.brezDreves;
      kamera.fov = st.fov;
      kamera.aspect = W / H;
      kamera.position.set(...st.cam);
      kamera.lookAt(...st.look);
      kamera.updateProjectionMatrix();
      kamera.updateMatrixWorld();
      const blob = await kakovost.zajemi(vzorcev, undefined, 1, { w: W, h: H });
      if (!blob) return null;
      const slika = await createImageBitmap(blob);
      const platno = document.createElement("canvas");
      platno.width = slika.width;
      platno.height = slika.height;
      const c2 = platno.getContext("2d");
      if (!c2) return null;
      c2.drawImage(slika, 0, 0);
      kamera.aspect = slika.width / slika.height;
      kamera.updateProjectionMatrix();
      if (st.kader) {
        const v = new THREE.Vector3();
        const zarek = new THREE.Raycaster();
        narisiOznake(
          c2,
          slika.width,
          slika.height,
          st.kader,
          (o: Oznaka) => {
            const tocka = new THREE.Vector3(...o.tocka);
            if (!o.skozi) {
              const smer = tocka.clone().sub(kamera.position);
              const razdalja = smer.length();
              zarek.set(kamera.position, smer.normalize());
              zarek.far = razdalja - 0.3;
              const zadetek = zarek
                .intersectObjects([prenova.skupina, okolica.skupina], true)
                .find((z) => z.object.visible && z.object !== okolica.nebo);
              if (zadetek) return null;
            }
            v.copy(tocka).project(kamera);
            if (v.z > 1 || v.z < -1) return null;
            return { x: ((v.x + 1) / 2) * slika.width, y: ((1 - v.y) / 2) * slika.height };
          },
          { alfa: (o) => (o.enota ? st.oznakeEnot[o.enota - 1] : st.oznake), pas: st.pas }
        );
      }
      narisiKartico(c2, slika.width, slika.height, "uvod", st.uvod);
      narisiKartico(c2, slika.width, slika.height, "zakljucek", st.zakljucek);
      return await new Promise<Blob | null>((r) => platno.toBlob(r, "image/jpeg", 0.93));
    },
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
