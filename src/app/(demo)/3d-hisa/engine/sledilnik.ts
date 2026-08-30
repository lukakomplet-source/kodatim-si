import * as THREE from "three";

/**
 * SLEDILNIK POTI — pravi izračun svetlobe, ne njena posnema.
 *
 * Rasterizacija (vse, kar dela zaslonski prikaz) računa vsak trikotnik zase in
 * svetlobo, ki se odbije od stene na strop, mora nekdo posebej dodati — od tod
 * ambientna okluzija, "fill" luči in podobne bergle. Sledilnik poti namesto
 * tega izstreli iz vsakega piksla žarke in jim sledi po odbojih, dokler ne
 * najdejo svetila. Kar iz tega pride samo od sebe:
 *
 *   - odboj barve (rdeča streha obarva belo steno pod njo),
 *   - resnična mehka senca, ker je sonce disk in ne točka,
 *   - odsevi v steklu, ki vidijo dejansko sceno in ne le okoljske sličice,
 *   - zatemnitev v kotih, ki ni ocena, ampak izračun.
 *
 * Cena je čas: slika je sestavljena iz več sto prehodov in vsak je cel izris.
 * Zato to ni način prikaza, ampak gumb — pritisneš in počakaš.
 *
 * TRI OMEJITVE, KI JIH JE TREBA POZNATI (in jih ta datoteka obide pošteno):
 *
 *  1. MEGLE ne zna. Če ostane vklopljena, jo tiho ignorira in daljave so videti
 *     drugače kot na zaslonu. Zato jo za čas izračuna odklopimo.
 *  2. LASTNIH SENČILNIKOV ne zna. Naša nebesna kupola in zvezde so ShaderMaterial;
 *     zanj so nevidne oziroma črne. Zato kupolo skrijemo in za ozadje uporabimo
 *     okoljsko sliko, ki je iz nje narejena — ker je nebo pri nas gladek preliv,
 *     se pri tem ne izgubi nič.
 *  3. NEVIDNIH predmetov ne vključi (preverjeno v izvorni kodi), zato varianta,
 *     ki ni izbrana, v izračun ne pride — obstoječe stanje in prenova stojita
 *     na istem mestu in bi se sicer prepletla v kašo.
 *
 * Knjižnica se naloži šele ob kliku (dinamični `import`): javna stran je ne sme
 * nositi s seboj, ker jo bo uporabil malokdo, teža pa bi bila na vsakem obisku.
 */

export type IzidSledilnika = { blob: Blob | null; vzorcev: number };

/**
 * Sledilnik pozna samo standardne in fizikalne materiale — druge tiho zgreši
 * ali pa se ob njih zlomi z nerazumljivim sporočilom ("Cannot read properties
 * of undefined"), ker v njih išče lastnosti, ki jih ti materiali nimajo
 * (hrapavost, kovinskost). To se je zgodilo ob prvem zagonu: cel izračun je
 * padel zaradi bele črte na cesti, ki je MeshBasicMaterial.
 *
 * Zato pred izračunom vsak nepodprt material ZAČASNO zamenjamo z enakovrednim
 * standardnim (ista barva, ista slika, ista prosojnost), predmete brez ploskev
 * (točke, črte, napisi) pa skrijemo. Vrnjena funkcija vse postavi nazaj —
 * zaslonski prikaz mora po izračunu izgledati natanko tako kot prej.
 */
function pripraviMateriale(scena: THREE.Scene): () => void {
  const vrni: (() => void)[] = [];

  const nadomesti = (m: THREE.Material): THREE.Material | null => {
    const kot = m as THREE.Material & {
      isMeshStandardMaterial?: boolean;
      isMeshPhysicalMaterial?: boolean;
      color?: THREE.Color;
      map?: THREE.Texture | null;
    };
    if (kot.isMeshStandardMaterial || kot.isMeshPhysicalMaterial) return null;
    return new THREE.MeshStandardMaterial({
      color: kot.color ? kot.color.clone() : new THREE.Color("#ffffff"),
      map: kot.map ?? null,
      transparent: m.transparent,
      opacity: m.opacity,
      side: m.side,
      roughness: 0.9,
      metalness: 0,
    });
  };

  scena.traverse((o) => {
    const p = o as THREE.Points & THREE.Line & THREE.Mesh;
    if ((p.isPoints || p.isLine || (o as THREE.Sprite).isSprite) && o.visible) {
      o.visible = false;
      vrni.push(() => (o.visible = true));
      return;
    }
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    if (Array.isArray(mesh.material)) {
      const prej = mesh.material;
      const novi = prej.map((m) => nadomesti(m) ?? m);
      if (novi.some((m, i) => m !== prej[i])) {
        mesh.material = novi;
        vrni.push(() => {
          (mesh.material as THREE.Material[]).forEach((m, i) => m !== prej[i] && m.dispose());
          mesh.material = prej;
        });
      }
    } else {
      const novi = nadomesti(mesh.material);
      if (novi) {
        const prej = mesh.material;
        mesh.material = novi;
        vrni.push(() => {
          novi.dispose();
          mesh.material = prej;
        });
      }
    }
  });

  return () => vrni.forEach((f) => f());
}

/**
 * NEBO, KI GA ZNA PREBRATI PROCESOR.
 *
 * Zaslonski prikaz osvetljuje sceno s PMREM sliko neba — ta živi izključno na
 * grafični kartici. Sledilnik pa mora okolje prebrati na PROCESORJU, ker si iz
 * njega vnaprej izračuna, kam je vredno streljati žarke (svetla nebesna polja
 * dobijo več vzorcev). Ob PMREM teksturi zato ne najde `image.data` in pade z
 * "Cannot read properties of undefined (reading '0')" — sporočilo, ki o pravem
 * vzroku ne pove nič.
 *
 * Zato tu iz ISTIH DVEH BARV in iste formule kot senčilnik neba sestavimo
 * majhno enakokotno (equirectangular) sliko v pomnilniku. 256×128 je dovolj,
 * ker je naše nebo gladek preliv brez oblakov: več pikslov ne bi dodalo nobene
 * informacije, porabilo pa bi čas pri vsakem zagonu.
 */
function nebesnaSlika(nebo: THREE.Mesh): THREE.DataTexture {
  const uniforms = (nebo.material as THREE.ShaderMaterial).uniforms;
  const vrh = uniforms.vrh.value as THREE.Color;
  const dno = uniforms.dno.value as THREE.Color;

  const sirina = 256;
  const visina = 128;
  const podatki = new Float32Array(sirina * visina * 4);
  for (let y = 0; y < visina; y++) {
    // Pri enakokotni sliki je vrstica 0 zenit; kot od zenita navzdol je 0..π.
    const kot = ((y + 0.5) / visina) * Math.PI;
    // Ista formula kot v senčilniku neba: t = clamp(y * 1.6 + 0.18, 0, 1).
    const t = Math.min(1, Math.max(0, Math.cos(kot) * 1.6 + 0.18));
    const r = dno.r + (vrh.r - dno.r) * t;
    const g = dno.g + (vrh.g - dno.g) * t;
    const b = dno.b + (vrh.b - dno.b) * t;
    for (let x = 0; x < sirina; x++) {
      const i = (y * sirina + x) * 4;
      podatki[i] = r;
      podatki[i + 1] = g;
      podatki[i + 2] = b;
      podatki[i + 3] = 1;
    }
  }

  const slika = new THREE.DataTexture(podatki, sirina, visina, THREE.RGBAFormat, THREE.FloatType);
  slika.mapping = THREE.EquirectangularReflectionMapping;
  // Barve iz uniformov so že v linearnem prostoru (three jih pretvori ob `set`),
  // zato tu NE sme biti sRGB — sicer bi se pretvorba zgodila dvakrat in nebo bi
  // bilo opazno pretemno.
  slika.colorSpace = THREE.LinearSRGBColorSpace;
  slika.needsUpdate = true;
  return slika;
}

export async function izrisiSSledilnikom(ctx: {
  renderer: THREE.WebGLRenderer;
  scena: THREE.Scene;
  kamera: THREE.PerspectiveCamera;
  /** Predmeti z lastnim senčilnikom (nebo, zvezde) — za čas izračuna skriti. */
  skrij: THREE.Object3D[];
  /** Nebesna kupola — iz njenih barv sestavimo okolje, ki ga sledilnik zna brati. */
  nebo: THREE.Mesh;
  /** Koliko prehodov. 300 je za pregled dovolj, 1000 je za tisk. */
  vzorcev: number;
  /** Kolikokrat večja stranica od zaslonske. */
  faktor: number;
  obNapredku?: (n: number, skupaj: number, korak: string) => void;
  /** Prekini izračun (uporabnik je kliknil drugam). */
  prekini?: () => boolean;
}): Promise<IzidSledilnika> {
  const { renderer, scena, kamera } = ctx;
  ctx.obNapredku?.(0, ctx.vzorcev, "nalagam sledilnik");

  const { WebGLPathTracer } = await import("three-gpu-pathtracer");

  // ——— shrani stanje, ki ga bomo zamenjali ———
  const staraMegla = scena.fog;
  const staroOzadje = scena.background;
  const staroOkolje = scena.environment;
  const skritiPrej = ctx.skrij.map((o) => o.visible);
  const el = renderer.domElement;
  const sirina = el.clientWidth || 1280;
  const visina = el.clientHeight || 720;
  const staroRazmerje = renderer.getPixelRatio();
  const staraTonskaMapa = renderer.toneMapping;

  const strop = Math.min(3840, renderer.capabilities.maxTextureSize);
  const zeljeno = Math.max(1, Math.min(ctx.faktor, strop / Math.max(1, sirina)));

  let pt: InstanceType<typeof WebGLPathTracer> | null = null;
  let vrniMateriale: (() => void) | null = null;
  let nebesna: THREE.DataTexture | null = null;
  try {
    scena.fog = null;
    // PMREM okolja ne moremo podati (živi le na grafični); sestavimo enakovredno
    // sliko v pomnilniku. Moč osvetlitve iz okolja prebere sledilnik sam iz
    // `scena.environmentIntensity`, zato ostane enaka kot na zaslonu.
    nebesna = nebesnaSlika(ctx.nebo);
    scena.environment = nebesna;
    scena.background = nebesna;
    ctx.skrij.forEach((o) => (o.visible = false));

    renderer.setPixelRatio(zeljeno);
    renderer.setSize(sirina, visina, false);
    kamera.aspect = sirina / visina;
    kamera.updateProjectionMatrix();

    ctx.obNapredku?.(0, ctx.vzorcev, "gradim pospeševalno strukturo");
    // Gradnja BVH je sinhrona in pri tej sceni traja nekaj sekund. Pred njo
    // predamo nadzor brskalniku, da se napis o čakanju sploh izriše — sicer
    // uporabnik vidi zamrznjeno stran brez pojasnila.
    await new Promise((r) => setTimeout(r, 60));

    vrniMateriale = pripraviMateriale(scena);

    pt = new WebGLPathTracer(renderer);
    pt.renderScale = 1;
    /**
     * Slika se računa po ploščicah 3×3. En sam velik izris zna preseči čas, ki
     * ga gonilnik dovoli enemu klicu, in Windows grafično kartico ponastavi
     * (TDR) — takrat pade cel zavihek, ne le izračun.
     */
    pt.tiles.set(3, 3);
    try {
      pt.setScene(scena, kamera);
    } catch (e) {
      // Sporočila iz te knjižnice so brez konteksta ("reading '0'"); brez sklada
      // se ne da ugotoviti, kateri predmet v sceni je kriv.
      const sklad = e instanceof Error ? (e.stack ?? e.message) : String(e);
      console.error("[sledilnik] priprava scene ni uspela: " + sklad);
      throw new Error("priprave scene ni bilo mogoče dokončati (podrobnosti v konzoli)");
    }

    /**
     * Štejemo PREHODE, ne klicev.
     *
     * Ker se slika računa po devetih ploščicah, en `renderSample()` opravi
     * devetino prehoda — zanka s tristo klici bi torej naredila triintrideset
     * prehodov in napis bi kazal "1,33/300". Zato se vrtimo, dokler števec
     * knjižnice ne doseže želenega števila, in izpisujemo zaokroženo vrednost.
     *
     * Varovalka `najvecKlicev` je tu za primer, da bi se števec iz kakršnega
     * koli razloga nehal premikati: brez nje bi zanka tekla brez konca in
     * pregrela grafično kartico.
     */
    const najvecKlicev = ctx.vzorcev * 12 + 200;
    let klicev = 0;
    while (pt.samples < ctx.vzorcev && klicev < najvecKlicev) {
      if (ctx.prekini?.()) break;
      pt.renderSample();
      klicev++;
      if (klicev % 4 === 0) {
        ctx.obNapredku?.(Math.round(pt.samples), ctx.vzorcev, "sledim žarkom");
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
    }
    const koncnihVzorcev = Math.round(pt.samples);

    // Platno je ustvarjeno s `preserveDrawingBuffer`, zato je slika na njem še
    // vedno tam, ko jo hočemo prebrati — brez tega bi toBlob vrnil prazno.
    const blob = await new Promise<Blob | null>((r) => el.toBlob(r, "image/png"));
    return { blob, vzorcev: koncnihVzorcev };
  } finally {
    pt?.dispose();
    vrniMateriale?.();
    nebesna?.dispose();
    scena.fog = staraMegla;
    scena.background = staroOzadje;
    scena.environment = staroOkolje;
    ctx.skrij.forEach((o, i) => (o.visible = skritiPrej[i]));
    renderer.toneMapping = staraTonskaMapa;
    renderer.setPixelRatio(staroRazmerje);
    renderer.setSize(sirina, visina, false);
    kamera.aspect = sirina / visina;
    kamera.updateProjectionMatrix();
  }
}
