import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";

/**
 * KAKOVOST SLIKE — vse se izriše na tukajšnji grafični kartici, nič ne gre ven.
 *
 * Scena je imela ACES tone mapping, mehke sence in odsev neba; kar je manjkalo,
 * sta bili dve stvari, ki jih oko takoj opazi:
 *
 *  1. STIKI. Brez ambientne okluzije se stena in tla dotakneta brez sence, zato
 *     predmeti "lebdijo". GTAO potemni kote, robove in podstavke — to je največji
 *     posamezen prispevek k občutku, da je prizor resničen.
 *
 *  2. TRDE SENCE IN ZOBCI. Ena sličica pomeni eno smer sonca in en vzorec na
 *     piksel: rob sence je oster kot z olfa nožem, diagonale so nazobčane.
 *
 * Drugo rešimo z AKUMULACIJO. Ko se kamera ustavi, se ista slika izriše
 * nekajsto krat — vsakič s podpikselskim zamikom kamere in rahlo premaknjenim
 * soncem — in sličice se povprečijo. Sonce ni točka, ampak disk premera pol
 * stopinje; premikanje po njem naredi natanko tisto, kar dela v resnici:
 * penumbro, ki je pri strehi ostra in pri tleh mehka. Zobci izginejo, ker vsak
 * piksel dobi nekaj sto vzorcev namesto enega.
 *
 * Med premikanjem se ne akumulira nič — takrat šteje odzivnost. Zato je
 * "počakaj sekundo in slika se izostri" in ne "vse je počasno".
 *
 * Cena: nekaj sto izrisov na eno sliko. To je delo grafične kartice in ne stane
 * ničesar drugega; prav zato je ta pot izbrana namesto oblačnega renderiranja.
 */

export type Kakovost = {
  /** En korak izrisa. `premika` = uporabnik premika kamero (takrat brez akumulacije). */
  korak: (premika: boolean) => void;
  /** Začni akumulacijo znova (kamera, čas dneva, varianta, velikost). */
  ponastavi: () => void;
  nastaviVelikost: (w: number, h: number) => void;
  /** Koliko vzorcev je v trenutni sliki (0 = sveže, MAX = izostreno). */
  vzorcev: () => number;
  najvecVzorcev: number;
  /** Izriši do `vzorcev` vzorcev in vrni PNG. Uporablja se za gumb Fotoreal. */
  zajemi: (
    vzorcev: number,
    obNapredku?: (n: number, skupaj: number) => void,
    /** Kolikokrat večja stranica od zaslonske (1 = kot na zaslonu, 2 = štirikrat več pikslov). */
    faktor?: number
  ) => Promise<Blob | null>;
  unici: () => void;
};

/**
 * Haltonovo zaporedje — enakomerno razporejeni vzorci brez gruč.
 *
 * Naključna števila bi se pri stotih vzorcih ponekod nagnetla in drugod pustila
 * luknjo, kar se vidi kot šum, ki noče izginiti. Halton pokrije ploskev
 * enakomerno, zato je slika pri istem številu vzorcev bistveno čistejša.
 */
function halton(indeks: number, osnova: number): number {
  let rezultat = 0;
  let f = 1 / osnova;
  let i = indeks;
  while (i > 0) {
    rezultat += f * (i % osnova);
    i = Math.floor(i / osnova);
    f /= osnova;
  }
  return rezultat;
}

/** Mešalnik: nova sličica se vlije v akumulator z utežjo 1/n. */
const MESALNIK = {
  uniforms: {
    prejsnje: { value: null as THREE.Texture | null },
    novo: { value: null as THREE.Texture | null },
    utez: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D prejsnje;
    uniform sampler2D novo;
    uniform float utez;
    varying vec2 vUv;
    void main() {
      vec4 a = texture2D(prejsnje, vUv);
      vec4 b = texture2D(novo, vUv);
      gl_FragColor = mix(a, b, utez);
    }
  `,
};

const PREPIS = {
  uniforms: { slika: { value: null as THREE.Texture | null } },
  vertexShader: MESALNIK.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D slika;
    varying vec2 vUv;
    void main() { gl_FragColor = texture2D(slika, vUv); }
  `,
};

export function ustvariKakovost(ctx: {
  renderer: THREE.WebGLRenderer;
  scena: THREE.Scene;
  kamera: THREE.PerspectiveCamera;
  sonce: THREE.DirectionalLight;
  /** Največ vzorcev na sliko; nižje na šibkejši grafični. */
  najvec?: number;
}): Kakovost {
  const { renderer, scena, kamera, sonce } = ctx;
  const NAJVEC = ctx.najvec ?? 240;

  const velikost = new THREE.Vector2();
  renderer.getDrawingBufferSize(velikost);

  // ——— veriga učinkov ———
  const composer = new EffectComposer(renderer);
  composer.renderToScreen = false; // izid poberemo sami in ga akumuliramo
  composer.addPass(new RenderPass(scena, kamera));

  const gtao = new GTAOPass(scena, kamera, velikost.x, velikost.y);
  /**
   * Polmer je v METRIH prizora, ne v pikslih: 0,6 m potemni stike sten s tlemi
   * in ostrešje nad okni, ne pa cele fasade. Večji polmer naredi "umazano"
   * sliko, ki je videti kot madež, ne kot senca.
   */
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.0, scale: 1.0, samples: 16 });
  gtao.blendIntensity = 0.85;
  composer.addPass(gtao);

  /**
   * Bloom je namenoma komaj opazen (0,12). Pri arhitekturnem prikazu je močan
   * bloom prvi znak, da gre za računalniško sliko; tu je samo zato, da sonce na
   * belem ometu in odsev v steklu nista ravna ploskev.
   */
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(velikost.x, velikost.y), 0.12, 0.5, 0.92));
  composer.addPass(new OutputPass());

  // ——— akumulacija ———
  const nastavitve: THREE.RenderTargetOptions = {
    type: THREE.HalfFloatType, // 8 bitov bi se pri 240 vzorcih videlo kot pasovi
    depthBuffer: false,
    stencilBuffer: false,
  };
  let akA = new THREE.WebGLRenderTarget(velikost.x, velikost.y, nastavitve);
  let akB = new THREE.WebGLRenderTarget(velikost.x, velikost.y, nastavitve);
  /** LDR kopija za shranjevanje v PNG — iz HalfFloat se piksli berejo slabo. */
  const zaSliko = new THREE.WebGLRenderTarget(velikost.x, velikost.y, { depthBuffer: false, stencilBuffer: false });

  const mesalnik = new THREE.ShaderMaterial(MESALNIK);
  const prepis = new THREE.ShaderMaterial(PREPIS);
  const kvadratMesalnik = new FullScreenQuad(mesalnik);
  const kvadratPrepis = new FullScreenQuad(prepis);

  let vzorec = 0;

  /**
   * Položaj sonca se prebere ob VSAKEM vzorcu, ne enkrat ob zagonu.
   *
   * Prva različica si ga je zapomnila v konstruktorju — takrat pa sonce še stoji
   * v izhodišču, ker ga postavi šele `nastaviCas()`, ki teče pozneje. Vsak
   * vzorec ga je zato vrnil v (0,0,0), usmerjena luč z ničelno smerjo pa ne
   * sveti nič: cela hiša je bila osvetljena samo z neba, bel omet je postal
   * sivo-moder in senc ni bilo nikjer. Brez samodejne preverbe s posnetkom bi
   * to odkril šele uporabnik.
   *
   * Ob vsakem vzorcu prebrana vrednost ima še eno korist: menjava časa dneva
   * (dan/zahod/noč) deluje sama od sebe, brez obveščanja tega modula.
   */
  const osnovaSonca = new THREE.Vector3();

  /**
   * Kotni polmer sonca je 0,265° (premer pol stopinje). Pri razdalji svetila
   * ~85 m to pomeni približno pol metra premika — natanko toliko, da je senca
   * strehe na tleh mehka, senca okenske police pa še vedno ostra. Če to
   * povečamo, dobimo oblačen dan; če damo nič, dobimo trde sence, ki so
   * najbolj zanesljiv znak računalniške slike.
   */
  const TANGENS_SONCA = Math.tan((0.265 * Math.PI) / 180);

  const ponastavi = () => {
    vzorec = 0;
  };

  const izrisiVzorec = () => {
    const i = vzorec + 1;

    // podpikselski zamik kamere — od tod izgine nazobčanost
    const jx = (halton(i, 2) - 0.5) * 1.0;
    const jy = (halton(i, 3) - 0.5) * 1.0;
    kamera.setViewOffset(velikost.x, velikost.y, jx, jy, velikost.x, velikost.y);

    // premik sonca po disku — od tod pride mehka senca
    osnovaSonca.copy(sonce.position);
    const polmer = osnovaSonca.length() * TANGENS_SONCA;
    const kot = halton(i, 5) * Math.PI * 2;
    const r = Math.sqrt(halton(i, 7)) * polmer;
    sonce.position.set(
      osnovaSonca.x + Math.cos(kot) * r,
      osnovaSonca.y + Math.sin(kot) * r * 0.5,
      osnovaSonca.z + Math.sin(kot) * r
    );

    composer.render();

    kamera.clearViewOffset();
    sonce.position.copy(osnovaSonca);

    // izid verige zlij v akumulator (A -> B), nato zamenjaj
    mesalnik.uniforms.prejsnje.value = akA.texture;
    mesalnik.uniforms.novo.value = composer.readBuffer.texture;
    mesalnik.uniforms.utez.value = vzorec === 0 ? 1 : 1 / i;
    renderer.setRenderTarget(akB);
    kvadratMesalnik.render(renderer);
    renderer.setRenderTarget(null);
    const t = akA;
    akA = akB;
    akB = t;

    vzorec = i;
  };

  const prikazi = (cilj: THREE.WebGLRenderTarget | null) => {
    prepis.uniforms.slika.value = akA.texture;
    renderer.setRenderTarget(cilj);
    kvadratPrepis.render(renderer);
    renderer.setRenderTarget(null);
  };

  const korak = (premika: boolean) => {
    if (premika) ponastavi();
    // Med premikanjem se izriše natanko en vzorec in ta je slika: hitro.
    // V mirovanju se dodaja po en vzorec na sličico, dokler slika ni izostrena.
    if (premika || vzorec < NAJVEC) izrisiVzorec();
    prikazi(null);
  };

  const nastaviVelikost = (w: number, h: number) => {
    // Veriga učinkov mora slediti tudi gostoti pikslov, ne le velikosti okna:
    // pri izvozu v 4K se spremeni prav ta.
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    renderer.getDrawingBufferSize(velikost);
    for (const rt of [akA, akB, zaSliko]) rt.setSize(velikost.x, velikost.y);
    ponastavi();
  };

  /**
   * Izostri sliko do `koliko` vzorcev in jo vrni kot PNG.
   *
   * Vmes se preda nadzor brskalniku (requestAnimationFrame), sicer bi se stran
   * med izračunom zamrznila in bi bilo videti kot okvara.
   */
  const zajemi = async (koliko: number, obNapredku?: (n: number, skupaj: number) => void, faktor = 2) => {
    /**
     * IZVOZ JE VEČJI OD ZASLONA.
     *
     * Zaslonska slika ima toliko pikslov, kolikor jih ima okno; na 1600 px
     * široki sliki je okenski okvir tri piksle in ograja ena črta. Izvoz zato
     * začasno poveča gostoto izrisa (privzeto dvakratno stranico, torej
     * štirikrat več pikslov) — drobne stvari, ki jih zaslon ne premore,
     * dobijo prostor, in slika je uporabna tudi natisnjena.
     *
     * Meja 3840 px ni okrasna: nad njo teksture presežejo, kar zna grafična
     * kartica nasloviti (`maxTextureSize`), in izvoz bi tiho vrnil črno sliko.
     */
    const el = renderer.domElement;
    const sirina = el.clientWidth || velikost.x;
    const visina = el.clientHeight || velikost.y;
    const staroRazmerjePikslov = renderer.getPixelRatio();
    const strop = Math.min(3840, renderer.capabilities.maxTextureSize);
    const zeljeno = Math.max(1, Math.min(faktor, strop / Math.max(1, sirina)));

    renderer.setPixelRatio(zeljeno);
    renderer.setSize(sirina, visina, false);
    nastaviVelikost(sirina, visina);

    ponastavi();
    for (let i = 0; i < koliko; i++) {
      izrisiVzorec();
      if (i % 8 === 0) {
        prikazi(null);
        obNapredku?.(i + 1, koliko);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
    }
    prikazi(null);
    prikazi(zaSliko);

    const piksli = new Uint8Array(velikost.x * velikost.y * 4);
    renderer.readRenderTargetPixels(zaSliko, 0, 0, velikost.x, velikost.y, piksli);

    const platno = document.createElement("canvas");
    platno.width = velikost.x;
    platno.height = velikost.y;
    const ctx2d = platno.getContext("2d");
    if (!ctx2d) return null;
    const slika = ctx2d.createImageData(velikost.x, velikost.y);
    // WebGL bere od spodaj navzgor, platno piše od zgoraj navzdol.
    for (let y = 0; y < velikost.y; y++) {
      const od = (velikost.y - 1 - y) * velikost.x * 4;
      slika.data.set(piksli.subarray(od, od + velikost.x * 4), y * velikost.x * 4);
    }
    ctx2d.putImageData(slika, 0, 0);
    const blob = await new Promise<Blob | null>((r) => platno.toBlob(r, "image/png"));

    // Vrni zaslon v prvotno gostoto; brez tega bi stran po enem izvozu do
    // konca seje risala v 4K in bi bila videti pokvarjeno počasna.
    renderer.setPixelRatio(staroRazmerjePikslov);
    renderer.setSize(sirina, visina, false);
    nastaviVelikost(sirina, visina);
    return blob;
  };

  return {
    korak,
    ponastavi,
    nastaviVelikost,
    vzorcev: () => vzorec,
    najvecVzorcev: NAJVEC,
    zajemi,
    unici: () => {
      composer.dispose();
      akA.dispose();
      akB.dispose();
      zaSliko.dispose();
      kvadratMesalnik.dispose();
      kvadratPrepis.dispose();
    },
  };
}
