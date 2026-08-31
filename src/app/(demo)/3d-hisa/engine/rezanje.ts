import * as THREE from "three";

/**
 * REZANJE MODELA — etaže in prerez, kot ga imaš v SolidWorksu.
 *
 * Dve vprašanji, ki ju iz zunanjega pogleda ni mogoče odgovoriti: "kako je
 * razporejeno eno nadstropje" in "kako visoko je pravzaprav to". Prvo rešuje
 * odstranitev vsega nad izbrano etažo (hiša za lutke), drugo navpična ravnina,
 * ki jo z drsnikom peljemo skozi hišo.
 *
 * Oboje je ista tehnika: ravnina rezanja (`clippingPlanes`). Model se ne
 * spreminja — geometrija ostane cela, samo grafična kartica ne izriše tistega,
 * kar je na napačni strani ravnine. Zato je premikanje drsnika takojšnje in se
 * po vrnitvi na "Vse" ne izgubi nič.
 *
 * ZAKAJ NE GLOBALNO REZANJE. `renderer.clippingPlanes` reže VSE, tudi nebo in
 * teren — nebesna kupola bi ob prerezu dobila luknjo in skozi njo bi se videla
 * gola barva ozadja. Zato režemo po materialih, in sicer samo po tistih, ki
 * pripadajo hiši.
 *
 * ZAKAJ PODVOJIMO NEKATERE MATERIALE. Nekaj materialov (beton, kovina, les)
 * uporablja tudi okolica. Če bi ravnino nastavili kar na skupni material, bi se
 * ob prerezu hiše prerezal tudi nadstrešek ali ograja pri sosedu — kar je videti
 * kot napaka, ne kot orodje. Takim materialom naredimo kopijo samo za hišo.
 */

export type IzbranaEtaza = "vse" | "pritlicje" | "nadstropje" | "podstreha";

export type NastavitvePrereza = {
  vklopljen: boolean;
  /** "x" reže po osi vzhod–zahod, "z" po osi sever–jug. */
  os: "x" | "z";
  polozaj: number;
  /** Katera polovica ostane vidna. */
  obrnjen: boolean;
};

export type Rezanje = {
  nastaviEtazo: (e: IzbranaEtaza) => void;
  nastaviPrerez: (n: NastavitvePrereza) => void;
  /** Razpon drsnika za prerez, v metrih modela. */
  meje: { x: [number, number]; z: [number, number] };
  unici: () => void;
};

export function ustvariRezanje(ctx: {
  renderer: THREE.WebGLRenderer;
  /** Skupine, ki so hiša (obstoječe stanje in prenova). */
  hisa: THREE.Object3D[];
  /** Vse ostalo — iz tega ugotovimo, kateri materiali so v skupni rabi. */
  okolica: THREE.Object3D;
  /** Kote etaž iz PZI načrtov — rez pade tik POD stropno ploščo. */
  kote: { pritlicjeStrop: number; nadstropjeStrop: number; kapY: number };
}): Rezanje {
  const { renderer } = ctx;

  // Rezanje po materialih zahteva krajevno rezanje; globalnega ne vklapljamo,
  // ker bi zajelo tudi nebo in teren.
  renderer.localClippingEnabled = true;

  const materialiOkolice = new Set<THREE.Material>();
  ctx.okolica.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    (Array.isArray(m) ? m : [m]).forEach((x) => materialiOkolice.add(x));
  });

  /** Materiali, na katerih bomo nastavljali ravnine (samo hiša). */
  const materiali = new Set<THREE.Material>();
  /** Kopije, ki smo jih naredili sami in jih moramo ob koncu pospraviti. */
  const kopije: THREE.Material[] = [];
  const zeKopirano = new Map<THREE.Material, THREE.Material>();

  const kopirajCeSkupen = (m: THREE.Material): THREE.Material => {
    if (!materialiOkolice.has(m)) return m;
    const obstojeca = zeKopirano.get(m);
    if (obstojeca) return obstojeca;
    const nova = m.clone();
    zeKopirano.set(m, nova);
    kopije.push(nova);
    return nova;
  };

  for (const koren of ctx.hisa) {
    koren.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => {
          const u = kopirajCeSkupen(m);
          materiali.add(u);
          return u;
        });
      } else {
        const u = kopirajCeSkupen(mesh.material);
        mesh.material = u;
        materiali.add(u);
      }
    });
  }

  /** Obseg hiše — iz njega je razpon drsnika, da ne reže po praznem zraku. */
  const obseg = new THREE.Box3();
  for (const koren of ctx.hisa) obseg.expandByObject(koren);
  const meje = {
    x: [obseg.min.x, obseg.max.x] as [number, number],
    z: [obseg.min.z, obseg.max.z] as [number, number],
  };

  let ravninaEtaze: THREE.Plane | null = null;
  const ravninaPrereza = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  let prerezVklopljen = false;
  let prejsnjeStevilo = -1;

  const uveljavi = () => {
    const ravnine: THREE.Plane[] = [];
    if (ravninaEtaze) ravnine.push(ravninaEtaze);
    if (prerezVklopljen) ravnine.push(ravninaPrereza);

    for (const m of materiali) {
      m.clippingPlanes = ravnine.length > 0 ? ravnine : null;
      // Senca mora slediti rezu; sicer streha, ki je ni več, še vedno meče
      // senco na dvorišče in slika je videti pokvarjena.
      m.clipShadows = true;
      /**
       * Ob SPREMEMBI ŠTEVILA ravnin je treba senčilnik prevesti znova —
       * število je vanj vpisano kot konstanta. Brez tega se prva vklopljena
       * ravnina sploh ne pozna, ker stari senčilnik zanjo ne ve.
       */
      if (ravnine.length !== prejsnjeStevilo) m.needsUpdate = true;
    }
    prejsnjeStevilo = ravnine.length;
  };

  const nastaviEtazo = (e: IzbranaEtaza) => {
    /**
     * Kje pade rez — in zakaj tik POD stropom.
     *
     * Prva različica je rezala pri koti tal naslednje etaže, da bi soba
     * obdržala strop. Izid je bil ravno nasproten od namena: nad pritličjem je
     * ostala cela stropna plošča in od zgoraj se je videl bel pokrov, ne pa
     * prostori. Za pogled v tloris mora strop odpasti — rez zato pade pri koti
     * stropa te etaže, torej tik pod ploščo, in stene so prerezane na tej
     * višini.
     *
     * Podstreha se odreže pri kapi (vrh kolenčnega zidu): odpade streha,
     * kolenčni zid in stene pa ostanejo, sicer bi od podstrehe ostala samo tla.
     */
    const meja =
      e === "pritlicje"
        ? ctx.kote.pritlicjeStrop
        : e === "nadstropje"
          ? ctx.kote.nadstropjeStrop
          : e === "podstreha"
            ? ctx.kote.kapY
            : null;
    // Normala navzdol pomeni "obdrži, kar je pod mejo".
    ravninaEtaze = meja === null ? null : new THREE.Plane(new THREE.Vector3(0, -1, 0), meja);
    uveljavi();
  };

  const nastaviPrerez = (n: NastavitvePrereza) => {
    prerezVklopljen = n.vklopljen;
    const smer = n.obrnjen ? 1 : -1;
    ravninaPrereza.normal.set(n.os === "x" ? smer : 0, 0, n.os === "z" ? smer : 0);
    // Enačba ravnine je normala·točka + konstanta = 0, vidno pa je tisto, kjer
    // je vsota pozitivna — zato pri obrnjeni strani konstanta zamenja predznak.
    ravninaPrereza.constant = smer === -1 ? n.polozaj : -n.polozaj;
    uveljavi();
  };

  return {
    nastaviEtazo,
    nastaviPrerez,
    meje,
    unici: () => {
      for (const m of materiali) {
        m.clippingPlanes = null;
        m.needsUpdate = true;
      }
      kopije.forEach((m) => m.dispose());
      renderer.localClippingEnabled = false;
    },
  };
}
