import * as THREE from "three";
import type { Materiali } from "./materials";
import { NACRT, ODPRTINE, OKNA_TIPI, SOBE, VRATA_NOTRANJA, VRATA_TIPI, type Etaza } from "./nacrt";

/**
 * Hiša PO PRENOVI — zgrajena iz PZI specifikacije (nacrt.ts): pravi gabarit,
 * etažne višine, frčada na zahodni strešini, ODPRTO jekleno stopnišče z
 * lamelno obleko na vzhodu (cinkana konstrukcija, rebraste stopnice, ograja
 * iz ravne pločevine 40/4), notranjost vseh treh etaž s pravimi vrati
 * (podboj + krilo + kljuka) in opremo po tlorisih.
 */

export type Prenova = {
  skupina: THREE.Group;
  kolizije: THREE.Box3[];
  tla: THREE.Box3[]; // pohodne površine (vrh škatle = višina tal)
  stekla: THREE.Mesh[];
  lucke: THREE.PointLight[];
};

const polS = NACRT.sirinaSJ / 2;
const polG = NACRT.globinaVZ / 2;
const DEB = 0.32; // zunanje stene
const DEBp = 0.12; // predelne
const ETAZE: Record<Etaza, { tla: number; strop: number }> = {
  pritlicje: { tla: NACRT.pritlicjeTla, strop: NACRT.pritlicjeStrop },
  nadstropje: { tla: NACRT.nadstropjeTla, strop: NACRT.nadstropjeStrop },
  podstreha: { tla: NACRT.podstrehaTla, strop: NACRT.podstrehaTla + 2.2 },
};
const NAKLON = Math.atan((NACRT.slemeY - (NACRT.podstrehaTla + NACRT.kolencna)) / polG);

export function zgradiPrenovo(mat: Materiali): Prenova {
  const g = new THREE.Group();
  const kolizije: THREE.Box3[] = [];
  const tla: THREE.Box3[] = [];
  const stekla: THREE.Mesh[] = [];
  const lucke: THREE.PointLight[] = [];

  const boks = (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, senca = true) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
    b.position.set(x, y, z);
    b.castShadow = senca;
    b.receiveShadow = true;
    g.add(b);
    return b;
  };
  const trdno = (m: THREE.Material, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, senca = true) => {
    boks(m, x2 - x1, y2 - y1, z2 - z1, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, senca);
    kolizije.push(new THREE.Box3(new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)));
  };
  const pohodno = (x1: number, z1: number, x2: number, z2: number, vrh: number) => {
    tla.push(new THREE.Box3(new THREE.Vector3(x1, vrh - 0.3, z1), new THREE.Vector3(x2, vrh, z2)));
  };

  // ===================== STENA Z ODPRTINAMI =====================
  type Luknja = { sredina: number; w: number; y0: number; y1: number };
  /** Stena vzdolž osi `os` pri fiksni koordinati `pri`; luknje po dolžini. */
  const stena = (m: THREE.Material, os: "x" | "z", pri: number, od: number, doo: number, y0: number, y1: number, deb: number, luknje: Luknja[]) => {
    const kos = (a: number, b: number, ya: number, yb: number) => {
      if (b - a < 0.01 || yb - ya < 0.01) return;
      if (os === "z") trdno(m, pri - deb / 2, ya, a, pri + deb / 2, yb, b);
      else trdno(m, a, ya, pri - deb / 2, b, yb, pri + deb / 2);
    };
    const s = [...luknje].sort((q, r) => q.sredina - r.sredina);
    let kurz = od;
    for (const l of s) {
      const a = l.sredina - l.w / 2;
      const b = l.sredina + l.w / 2;
      kos(kurz, a, y0, y1);
      if (l.y0 > y0) kos(a, b, y0, l.y0); // parapet
      if (l.y1 < y1) kos(a, b, l.y1, y1); // preklada
      kurz = b;
    }
    kos(kurz, doo, y0, y1);
  };

  // ===================== OKNA (katalog, krila, police) =====================
  const dodajOkno = (
    os: "x" | "z",
    pri: number,
    sredina: number,
    y0: number,
    tipId: keyof typeof OKNA_TIPI,
    ven: 1 | -1 // smer navzven (za kljuko/krilo)
  ) => {
    const t = OKNA_TIPI[tipId];
    const { w, h } = t;
    const sk = new THREE.Group();
    if (os === "z") sk.position.set(pri, y0 + h / 2, sredina);
    else {
      sk.position.set(sredina, y0 + h / 2, pri);
      sk.rotation.y = Math.PI / 2;
    }
    const okvirM = tipId === "O2" ? mat.lesGladek : mat.okvir;
    /**
     * Lokalna os x skupine je pri stenah vzdolž x zasukana (rotation.y = π/2),
     * zato „ven“ v lokalnih koordinatah tam pomeni nasprotni predznak. Prej so
     * bile zato police na severni in južni fasadi obrnjene V NOTRANJOST.
     */
    const zun = os === "z" ? ven : -ven;
    // Izhodišče skupine je 6 cm pred sredino zidu (klicatelj); zunanje lice je
    // pri +0,10. Okvir sedi v ravnini toplotne izolacije, zato ostane zunaj
    // ~10 cm globoka špaleta — brez nje so bila okna nalepljena na fasado.
    const FX = zun * -0.04;
    const FD = 0.08;
    const el = (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
      b.position.set(x, y, z);
      b.castShadow = false;
      b.receiveShadow = true;
      sk.add(b);
      return b;
    };
    // slepi okvir (PVC, bel; 7 cm)
    el(okvirM, FD, 0.07, w, FX, h / 2 - 0.035, 0);
    el(okvirM, FD, 0.07, w, FX, -h / 2 + 0.035, 0);
    el(okvirM, FD, h, 0.07, FX, 0, w / 2 - 0.035);
    el(okvirM, FD, h, 0.07, FX, 0, -w / 2 + 0.035);
    /** Krilo s profilom (5,5 cm) in steklom; vrne steklo. */
    const krilo = (zs: number, kw: number, kh: number, ys = 0) => {
      const p = 0.055;
      el(okvirM, FD * 0.8, p, kw, FX + zun * 0.01, ys + kh / 2 - p / 2, zs);
      el(okvirM, FD * 0.8, p, kw, FX + zun * 0.01, ys - kh / 2 + p / 2, zs);
      el(okvirM, FD * 0.8, kh, p, FX + zun * 0.01, ys, zs + kw / 2 - p / 2);
      el(okvirM, FD * 0.8, kh, p, FX + zun * 0.01, ys, zs - kw / 2 + p / 2);
      const st = el(mat.steklo, 0.024, kh - 2 * p, kw - 2 * p, FX, ys, zs);
      stekla.push(st);
      return st;
    };
    if (t.vrsta === "vrata") {
      // vhodna vrata: krilo (priprto), pri širših tipih fiksna zasteklitev ob krilu
      const kriloW = Math.min(w, 1.0) * (w > 1.2 ? 0.45 : 0.92);
      const kr = new THREE.Group();
      const plosca = new THREE.Mesh(new THREE.BoxGeometry(0.06, h - 0.08, kriloW), mat.vrata);
      plosca.position.z = -kriloW / 2;
      plosca.castShadow = false;
      kr.add(plosca);
      // ozka zasteklitev v krilu in kljuka z rozeto
      const ozko = new THREE.Mesh(new THREE.BoxGeometry(0.065, h * 0.55, 0.14), mat.steklo);
      ozko.position.set(0, 0.05, -kriloW + 0.22);
      kr.add(ozko);
      stekla.push(ozko);
      const kljuka = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.16), mat.jekloAntracit);
      kljuka.position.set(zun * 0.06, -0.02, -kriloW + 0.12);
      kr.add(kljuka);
      kr.position.set(FX, 0, w / 2 - 0.07);
      kr.rotation.y = zun * 0.35;
      sk.add(kr);
      if (w > 1.2) {
        krilo(-kriloW / 2 + 0.01 - 0.0, w - kriloW - 0.14, h - 0.14);
        el(okvirM, FD, h - 0.08, 0.07, FX, 0, w / 2 - kriloW - 0.07);
      }
    } else if (t.vrsta === "balkonska") {
      // balkonska vrata: stekleno krilo + morebitno fiksno okno ob njem
      const kriloW = Math.min(0.9, w * 0.45);
      krilo(w / 2 - 0.07 - kriloW / 2, kriloW, h - 0.14);
      const kljuka = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.03), mat.jekloAntracit);
      kljuka.position.set(FX + zun * 0.06, 0, w / 2 - 0.07 - kriloW + 0.08);
      sk.add(kljuka);
      if (w - kriloW > 0.3) {
        const ost = w - 0.14 - kriloW;
        krilo(-w / 2 + 0.07 + ost / 2, ost, h - 0.14);
      }
    } else {
      // okno: krila enake širine, vsako s svojim profilom (prej ena šipa z
      // belimi letvami čez — od daleč je bilo videti kot rešetka)
      const notrW = w - 0.14;
      const kw = notrW / t.krila;
      for (let k = 0; k < t.krila; k++) krilo(-notrW / 2 + kw * (k + 0.5), kw, h - 0.14);
    }
    // zunanja ALU polica (PZI): sega 4 cm čez lice fasade, s stranskima zaključkoma
    if (t.vrsta === "okno" || t.vrsta === "fiksno") {
      el(mat.jekloAntracit, 0.15, 0.025, w + 0.04, zun * 0.065, -h / 2 - 0.012, 0);
      el(mat.jekloAntracit, 0.15, 0.05, 0.012, zun * 0.065, -h / 2, w / 2 + 0.014);
      el(mat.jekloAntracit, 0.15, 0.05, 0.012, zun * 0.065, -h / 2, -w / 2 - 0.014);
    }
    // kaseta zunanjega screen senčila (PZI: svetla, npr. Sonal White Pearl)
    if (t.vrsta !== "vrata" && w >= 0.9) {
      el(mat.kasetaSencila, 0.1, 0.13, w, zun * 0.05, h / 2 - 0.065, 0);
    }
    g.add(sk);
  };

  // ===================== NOTRANJA VRATA (podboj + krilo + kljuka) =====================
  const notranjaVrata = (os: "x" | "z", x: number, z: number, y0: number, tipId: keyof typeof VRATA_TIPI) => {
    const t = VRATA_TIPI[tipId] as { w: number; h: number; opis: string; zastekljena?: boolean };
    const sk = new THREE.Group();
    sk.position.set(x, y0, z);
    if (os === "x") sk.rotation.y = Math.PI / 2;
    // podboj (Egger laminat — svetel les)
    const pod = (sx: number, sy: number, sz: number, px: number, py: number, pz: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat.pohistvoLes);
      b.position.set(px, py, pz);
      b.castShadow = false;
      sk.add(b);
    };
    pod(0.16, 0.06, t.w + 0.1, 0, t.h + 0.03, 0);
    pod(0.16, t.h + 0.06, 0.05, 0, (t.h + 0.06) / 2 - 0.03, t.w / 2 + 0.025);
    pod(0.16, t.h + 0.06, 0.05, 0, (t.h + 0.06) / 2 - 0.03, -t.w / 2 - 0.025);
    // krilo, obešeno na tečajni strani, priprto
    const krilo = new THREE.Group();
    const plosca = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, t.h - 0.04, t.w - 0.06),
      t.zastekljena ? mat.steklo : mat.pohistvoLes
    );
    plosca.position.set(0, (t.h - 0.04) / 2, -(t.w - 0.06) / 2);
    plosca.castShadow = false;
    if (t.zastekljena) stekla.push(plosca);
    krilo.add(plosca);
    if (!t.zastekljena) {
      const kljuka = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.14), mat.jekloAntracit);
      kljuka.position.set(0.045, 1.05, -(t.w - 0.06) + 0.1);
      krilo.add(kljuka);
      const kljuka2 = kljuka.clone();
      kljuka2.position.x = -0.045;
      krilo.add(kljuka2);
    }
    krilo.position.set(0, 0, t.w / 2 - 0.03);
    krilo.rotation.y = 0.95; // priprto
    sk.add(krilo);
    g.add(sk);
  };

  // ===================== ZUNANJE STENE PO ETAŽAH =====================
  const fasade: { stran: "W" | "E" | "N" | "S"; os: "x" | "z"; pri: number; ven: 1 | -1; od: number; doo: number }[] = [
    { stran: "W", os: "z", pri: -polG + DEB / 2, ven: -1, od: -polS, doo: polS },
    { stran: "E", os: "z", pri: polG - DEB / 2, ven: 1, od: -polS, doo: polS },
    { stran: "N", os: "x", pri: -polS + DEB / 2, ven: -1, od: -polG + DEB, doo: polG - DEB },
    { stran: "S", os: "x", pri: polS - DEB / 2, ven: 1, od: -polG + DEB, doo: polG - DEB },
  ];
  (Object.keys(ETAZE) as Etaza[]).forEach((etaza) => {
    const E = ETAZE[etaza];
    const vrhStene = etaza === "podstreha" ? NACRT.podstrehaTla + NACRT.kolencna : E.strop + NACRT.ploscaD;
    for (const f of fasade) {
      if (etaza === "podstreha" && (f.stran === "N" || f.stran === "S")) continue; // zatrepa posebej
      const odprtine = ODPRTINE.filter((o) => o.stran === f.stran && o.etaza === etaza);
      const luknje: Luknja[] = odprtine.map((o) => {
        const t = OKNA_TIPI[o.tip];
        return { sredina: o.sredina, w: t.w, y0: E.tla + o.parapet, y1: E.tla + o.parapet + t.h };
      });
      stena(mat.fasadaNova, f.os, f.pri, f.od, f.doo, E.tla, vrhStene, DEB, luknje);
      for (const o of odprtine) {
        dodajOkno(f.os, f.pri + f.ven * 0.06, o.sredina, E.tla + o.parapet, o.tip, f.ven);
        const t = OKNA_TIPI[o.tip];
        if (t.vrsta === "vrata" || t.vrsta === "balkonska") {
          // pohodni prag skozi debelino zidu (sicer v vratih "prepad")
          const w2 = t.w / 2;
          if (f.os === "z") {
            pohodno(f.pri - 0.45, o.sredina - w2, f.pri + 0.45, o.sredina + w2, E.tla + 0.03);
            boks(mat.jekloAntracit, DEB + 0.1, 0.03, t.w, f.pri, E.tla + 0.015, o.sredina, false);
          } else {
            pohodno(o.sredina - w2, f.pri - 0.45, o.sredina + w2, f.pri + 0.45, E.tla + 0.03);
            boks(mat.jekloAntracit, t.w, 0.03, DEB + 0.1, o.sredina, E.tla + 0.015, f.pri, false);
          }
        }
      }
    }
  });

  // zatrepa (S + J): pravokotni del do kolenčne + trikotnik z izrezi za okna
  for (const smer of [-1, 1] as const) {
    const priZ = smer * (polS - DEB / 2);
    const stran = smer < 0 ? "N" : "S";
    const odprtine = ODPRTINE.filter((o) => o.stran === stran && o.etaza === "podstreha");
    const luknje: Luknja[] = odprtine.map((o) => {
      const t = OKNA_TIPI[o.tip];
      return { sredina: o.sredina, w: t.w, y0: NACRT.podstrehaTla + o.parapet, y1: NACRT.podstrehaTla + o.parapet + t.h };
    });
    stena(mat.fasadaNova, "x", priZ, -polG + DEB, polG - DEB, NACRT.podstrehaTla, NACRT.podstrehaTla + NACRT.kolencna, DEB, luknje);
    for (const o of odprtine) dodajOkno("x", priZ + smer * 0.06, o.sredina, NACRT.podstrehaTla + o.parapet, o.tip, smer);
    // trikotni zatrep z luknjami za dele oken nad kolenčno steno
    const bazaY = NACRT.podstrehaTla + NACRT.kolencna;
    const visTr = NACRT.slemeY - bazaY;
    const zatrep = new THREE.Shape();
    zatrep.moveTo(-polG, 0);
    zatrep.lineTo(polG, 0);
    zatrep.lineTo(0, visTr);
    zatrep.closePath();
    for (const l of luknje) {
      if (l.y1 <= bazaY + 0.01) continue;
      const h0 = Math.max(0, l.y0 - bazaY);
      const h1 = Math.min(visTr - 0.1, l.y1 - bazaY);
      if (h1 - h0 < 0.02) continue;
      const luknja = new THREE.Path();
      luknja.moveTo(l.sredina - l.w / 2, h0);
      luknja.lineTo(l.sredina + l.w / 2, h0);
      luknja.lineTo(l.sredina + l.w / 2, h1);
      luknja.lineTo(l.sredina - l.w / 2, h1);
      luknja.closePath();
      zatrep.holes.push(luknja);
    }
    const geo = new THREE.ExtrudeGeometry(zatrep, { depth: DEB, bevelEnabled: false });
    const mh = new THREE.Mesh(geo, mat.fasadaNova);
    mh.position.set(0, bazaY, priZ - DEB / 2);
    mh.castShadow = true;
    mh.receiveShadow = true;
    g.add(mh);
    kolizije.push(new THREE.Box3(new THREE.Vector3(-polG, bazaY, priZ - DEB / 2), new THREE.Vector3(polG, NACRT.slemeY, priZ + DEB / 2)));
  }

  // ===================== PLOŠČE, TLA, STROPI =====================
  const notrX1 = -polG + DEB, notrX2 = polG - DEB, notrZ1 = -polS + DEB, notrZ2 = polS - DEB;
  // pritličje
  trdno(mat.granitogres, -polG, -0.12, -polS, polG, 0.05, polS);
  pohodno(notrX1, notrZ1, notrX2, notrZ2, 0.05);
  // plošči
  for (const [spodaj, zgoraj] of [[NACRT.pritlicjeStrop, NACRT.nadstropjeTla], [NACRT.nadstropjeStrop, NACRT.podstrehaTla]] as const) {
    trdno(mat.mavcna, notrX1, spodaj, notrZ1, notrX2, zgoraj, notrZ2);
    pohodno(notrX1, notrZ1, notrX2, notrZ2, zgoraj);
    boks(mat.granitogres, notrX2 - notrX1, 0.012, notrZ2 - notrZ1, 0, zgoraj + 0.006, 0, false);
  }
  // poševni strop podstrehe (mavčne plošče pod špirovci) — v pasovih, ker morata
  // frčada in obe strešni okni ostati odprta navznoter (sicer se od znotraj ne vidi ven)
  /** spodnji rob mavčnega stropa nad točko x (šotorasta streha) */
  const podStrop = (x: number) => NACRT.slemeY - 0.18 - Math.tan(NAKLON) * Math.abs(x);
  const posevniStrop = (smer: -1 | 1, z0: number, z1: number) => {
    if (z1 - z0 < 0.05) return;
    const dolz = polG / Math.cos(NAKLON) + 0.2;
    const p = boks(mat.mavcna, dolz, 0.06, z1 - z0, (smer * polG) / 2, 0, (z0 + z1) / 2, false);
    p.position.y = (NACRT.podstrehaTla + NACRT.kolencna + NACRT.slemeY) / 2 - 0.14;
    p.rotation.z = -smer * NAKLON;
  };
  const notrZs = -NACRT.sirinaSJ / 2 + DEB;
  const notrZe = NACRT.sirinaSJ / 2 - DEB;
  // zahod: pas frčade (O6) ostane odprt
  posevniStrop(-1, notrZs, NACRT.frcada.sredinaZ - NACRT.frcada.sirina / 2);
  posevniStrop(-1, NACRT.frcada.sredinaZ + NACRT.frcada.sirina / 2, notrZe);
  // vzhod: odprta pasova strešnega okna kopalnice in dviga strehe nad stopniščem
  // (pod dvigom je svoj mavčni strop — glej STREHA)
  posevniStrop(1, notrZs, -4.15);
  posevniStrop(1, -3.25, -polS + NACRT.stopnisce.odSevernegaRoba);
  posevniStrop(1, -polS + NACRT.stopnisce.odSevernegaRoba + NACRT.stopnisce.dolzinaSJ, notrZe);
  boks(mat.mavcna, 3.4, 0.06, NACRT.sirinaSJ - 2 * DEB, 0, NACRT.slemeY - 0.98, 0, false);

  // ===================== PREDELNE STENE =====================
  /**
   * Predelna stena podstrehe, ki teče V–Z (pri stalnem z): vrh sledi poševnini
   * strehe, sicer bi stena predrla strešino. Odprtine za vrata so luknje v profilu.
   */
  const stenaPodStreho = (pri: number, od: number, doo: number, y0: number, strop: number, luknje: Luknja[]) => {
    const vrh = (x: number) => Math.min(strop, podStrop(x));
    // preloma profila, kjer poševnina pade pod strop
    const xPreloma = (NACRT.slemeY - 0.18 - strop) / Math.tan(NAKLON);
    const tocke = [od, ...[-xPreloma, 0, xPreloma].filter((x) => x > od && x < doo), doo];
    const oblika = new THREE.Shape();
    oblika.moveTo(od, y0);
    oblika.lineTo(doo, y0);
    for (let i = tocke.length - 1; i >= 0; i--) oblika.lineTo(tocke[i], vrh(tocke[i]));
    oblika.closePath();
    for (const l of luknje) {
      const luknja = new THREE.Path();
      luknja.moveTo(l.sredina - l.w / 2, l.y0);
      luknja.lineTo(l.sredina + l.w / 2, l.y0);
      luknja.lineTo(l.sredina + l.w / 2, l.y1);
      luknja.lineTo(l.sredina - l.w / 2, l.y1);
      luknja.closePath();
      oblika.holes.push(luknja);
    }
    const mh = new THREE.Mesh(new THREE.ExtrudeGeometry(oblika, { depth: DEBp, bevelEnabled: false }), mat.mavcna);
    mh.position.set(0, 0, pri - DEBp / 2);
    mh.castShadow = true;
    mh.receiveShadow = true;
    g.add(mh);
    // kolizije: polni odseki med odprtinami (do stropa — nad glavo ni pomembno)
    const meje = [od, ...luknje.flatMap((l) => [l.sredina - l.w / 2, l.sredina + l.w / 2]), doo].sort((a, b) => a - b);
    for (let i = 0; i < meje.length; i += 2) {
      if (meje[i + 1] - meje[i] < 0.02) continue;
      kolizije.push(
        new THREE.Box3(new THREE.Vector3(meje[i], y0, pri - DEBp / 2), new THREE.Vector3(meje[i + 1], strop, pri + DEBp / 2))
      );
    }
  };

  type Predelna = { etaza: Etaza; os: "x" | "z"; pri: number; od: number; doo: number };
  const predelne: Predelna[] = [
    // pritličje
    { etaza: "pritlicje", os: "z", pri: 1.9, od: notrZ1, doo: -0.67 }, // vzhodni pas (kuhinja je odprta v dnevni)
    { etaza: "pritlicje", os: "x", pri: 1.3, od: 1.01, doo: notrX2 }, // kuhinja | soba
    { etaza: "pritlicje", os: "z", pri: 1.01, od: 1.3, doo: 4.5 }, // soba | dnevni (nova siporeks, TV)
    { etaza: "pritlicje", os: "x", pri: 4.5, od: 1.01, doo: notrX2 }, // soba | južna cona
    { etaza: "pritlicje", os: "x", pri: -2.9, od: -1.15, doo: 1.75 }, // vetrolov | predprostor
    { etaza: "pritlicje", os: "z", pri: -1.15, od: notrZ1, doo: -0.7 }, // spalnica | vetrolov+predpr.
    { etaza: "pritlicje", os: "x", pri: -0.95, od: -1.15, doo: 1.9 }, // predprostor | dnevni
    { etaza: "pritlicje", os: "x", pri: -2.87, od: 1.9, doo: notrX2 }, // kurilnica | kopalnica
    { etaza: "pritlicje", os: "x", pri: -0.75, od: 1.9, doo: notrX2 }, // kopalnica | kuhinja
    { etaza: "pritlicje", os: "z", pri: 1.75, od: notrZ1, doo: -2.9 }, // vetrolov | vzhodni pas
    // nadstropje (vzhodni pas S→J: spalnica / kopalnica / vetrolov / soba)
    { etaza: "nadstropje", os: "x", pri: -3.4, od: -0.4, doo: notrX2 }, // spalnica | kopalnica+hodnik (V4)
    { etaza: "nadstropje", os: "z", pri: 1.35, od: -3.4, doo: -2.1 }, // kopalnica | hodnik-L
    { etaza: "nadstropje", os: "x", pri: -2.1, od: 1.35, doo: notrX2 }, // kopalnica | hodnik+vetrolov (V1)
    { etaza: "nadstropje", os: "z", pri: 2.45, od: -2.1, doo: -0.2 }, // vetrolov | hodnik (V3)
    { etaza: "nadstropje", os: "x", pri: -0.2, od: 2.45, doo: notrX2 }, // vetrolov južna stena
    { etaza: "nadstropje", os: "x", pri: 0.28, od: 0.8, doo: notrX2 }, // soba | hodnik (V1)
    { etaza: "nadstropje", os: "z", pri: -0.4, od: notrZ1, doo: 0.6 }, // dnevni | spalnica+hodnik (V2)
    { etaza: "nadstropje", os: "x", pri: 0.6, od: -0.4, doo: 0.8 }, // hodnik | dnevni (J del)
    { etaza: "nadstropje", os: "z", pri: 0.8, od: 0.28, doo: notrZ2 }, // soba | dnevni
    // podstreha (tloris list 7): neprekinjena stena med vzhodnim in zahodnim pasom
    { etaza: "podstreha", os: "z", pri: 1.33, od: notrZ1, doo: notrZ2 }, // vzhodni pas | zahodni pas
    { etaza: "podstreha", os: "x", pri: -2.42, od: 1.33, doo: notrX2 }, // kopalnica | predprostor
    { etaza: "podstreha", os: "x", pri: -0.82, od: 1.33, doo: notrX2 }, // predprostor | soba
    { etaza: "podstreha", os: "x", pri: -2.18, od: notrX1, doo: 1.33 }, // spalnica | dnevni
  ];
  for (const p of predelne) {
    const E = ETAZE[p.etaza];
    const vrata = VRATA_NOTRANJA.filter(
      (v) => v.etaza === p.etaza && (p.os === "z" ? Math.abs(v.x - p.pri) < 0.35 && v.z > p.od - 0.1 && v.z < p.doo + 0.1 : Math.abs(v.z - p.pri) < 0.35 && v.x > p.od - 0.1 && v.x < p.doo + 0.1)
    );
    const luknje: Luknja[] = vrata.map((v) => ({
      sredina: p.os === "z" ? v.z : v.x,
      w: VRATA_TIPI[v.tip].w + 0.1,
      y0: E.tla,
      y1: E.tla + VRATA_TIPI[v.tip].h + 0.06,
    }));
    if (p.etaza !== "podstreha") {
      stena(mat.mavcna, p.os, p.pri, p.od, p.doo, E.tla, E.strop, DEBp, luknje);
    } else if (p.os === "z") {
      // stena teče v smeri S–J pri stalnem x → vrh je povsod enak
      stena(mat.mavcna, p.os, p.pri, p.od, p.doo, E.tla, Math.min(E.strop, podStrop(p.pri)), DEBp, luknje);
    } else {
      stenaPodStreho(p.pri, p.od, p.doo, E.tla, E.strop, luknje);
    }
    for (const v of vrata) notranjaVrata(p.os === "z" ? "z" : "x", p.os === "z" ? p.pri : v.x, p.os === "z" ? v.z : p.pri, E.tla, v.tip);
  }

  // kopalniške obloge (PZI keramika) — tla + stenske obloge + sanitarije
  for (const s of SOBE) {
    const E = ETAZE[s.etaza];
    if (s.tla !== "granitogres") {
      const m = s.tla === "travertin" ? mat.travertin : mat.abacusPetrolio;
      boks(m, s.x2 - s.x1, 0.014, s.z2 - s.z1, (s.x1 + s.x2) / 2, E.tla + 0.02, (s.z1 + s.z2) / 2, false);
      const obloga = s.tla === "travertin" ? mat.travertin : mat.abacusCalce;
      const hOb = 1.5;
      boks(obloga, 0.03, hOb, s.z2 - s.z1 - 0.1, s.x1 + 0.08, E.tla + hOb / 2, (s.z1 + s.z2) / 2, false);
      boks(obloga, 0.03, hOb, s.z2 - s.z1 - 0.1, s.x2 - 0.08, E.tla + hOb / 2, (s.z1 + s.z2) / 2, false);
      boks(s.tla === "travertin" ? obloga : mat.abacusPetrolio, s.x2 - s.x1 - 0.1, hOb, 0.03, (s.x1 + s.x2) / 2, E.tla + hOb / 2, s.z1 + 0.08, false);
      // sanitarije po tlorisih (tuš/umivalnik/WC tako, da nič ne blokira vrat)
      const kad = (x1: number, z1: number, x2: number, z2: number) =>
        trdno(mat.keramikaBela, x1, E.tla, z1, x2, E.tla + 0.05, z2);
      const stekloPanel = (os: "x" | "z", pri: number, od: number, doo: number) => {
        if (os === "z") trdno(mat.steklo, pri - 0.012, E.tla, od, pri + 0.012, E.tla + 1.95, doo);
        else trdno(mat.steklo, od, E.tla, pri - 0.012, doo, E.tla + 1.95, pri + 0.012);
      };
      const umivalnik = (x1: number, z1: number, x2: number, z2: number, ogledaloOs: "x" | "z") => {
        trdno(mat.keramikaBela, x1, E.tla + 0.75, z1, x2, E.tla + 0.92, z2);
        if (ogledaloOs === "z") boks(mat.steklo, 0.02, 0.7, Math.abs(z2 - z1) - 0.05, x1 < (s.x1 + s.x2) / 2 ? x1 + 0.03 : x2 - 0.03, E.tla + 1.6, (z1 + z2) / 2, false);
        else boks(mat.steklo, Math.abs(x2 - x1) - 0.05, 0.7, 0.02, (x1 + x2) / 2, E.tla + 1.6, z1 < (s.z1 + s.z2) / 2 ? z1 + 0.03 : z2 - 0.03, false);
      };
      const wc = (x1: number, z1: number, x2: number, z2: number) =>
        trdno(mat.keramikaBela, x1, E.tla, z1, x2, E.tla + 0.42, z2);
      if (s.etaza === "pritlicje") {
        kad(3.4, -2.64, 4.27, -1.77); // tuš 90×90 v SV kotu
        stekloPanel("x", -1.77, 3.4, 4.27);
        stekloPanel("z", 3.4, -2.64, -1.77);
        umivalnik(2.55, -2.64, 3.05, -2.24, "x");
        wc(3.95, -1.45, 4.27, -0.95);
      } else if (s.etaza === "nadstropje") {
        kad(3.4, -3.32, 4.27, -2.52); // tuš 80/120 v SV delu
        stekloPanel("z", 3.4, -3.32, -2.52);
        stekloPanel("x", -2.52, 3.4, 4.27);
        umivalnik(1.55, -3.32, 2.0, -2.92, "z");
        wc(2.45, -3.34, 2.95, -3.0);
      } else {
        kad(3.45, -5.08, 4.27, -4.2); // tuš v SV kotu
        stekloPanel("x", -4.2, 3.45, 4.27);
        umivalnik(3.95, -4.0, 4.27, -3.4, "z");
        wc(1.6, -5.05, 2.1, -4.65);
      }
    }
  }

  // pralni/sušilni stroj — niši (1N v vetrolovu, podstreha v kopalnici: PS+PS)
  const stroj = (x: number, y: number, z: number) => {
    trdno(mat.keramikaBela, x - 0.3, y, z - 0.3, x + 0.3, y + 0.85, z + 0.3);
    boks(mat.steklo, 0.02, 0.34, 0.34, x - 0.31, y + 0.45, z, false);
  };
  stroj(4.0, NACRT.nadstropjeTla, -0.55);
  stroj(4.0, NACRT.nadstropjeTla + 0.87, -0.55);
  stroj(1.72, NACRT.podstrehaTla, -3.2);
  stroj(1.72, NACRT.podstrehaTla, -3.9);

  // ===================== OPREMA PO TLORISIH =====================
  const oprema: { etaza: Etaza; tip: "postelja" | "kavc" | "miza" | "omara" | "kuhinja" | "tv"; x: number; z: number; rot?: number }[] = [
    // pritličje: spalnica Z (postelja ob S steni), omara v vetrolovu, dnevni JZ,
    // kuhinja ob vzhodni steni (tloris), TV na novi siporeks steni sobe
    { etaza: "pritlicje", tip: "postelja", x: -3.1, z: -3.3 },
    { etaza: "pritlicje", tip: "omara", x: 1.45, z: -4.0, rot: Math.PI / 2 },
    { etaza: "pritlicje", tip: "kavc", x: -3.5, z: 1.6, rot: Math.PI / 2 },
    { etaza: "pritlicje", tip: "miza", x: -1.0, z: 2.8 },
    { etaza: "pritlicje", tip: "kuhinja", x: 3.85, z: 0.3, rot: -Math.PI / 2 },
    { etaza: "pritlicje", tip: "tv", x: 1.12, z: 3.4, rot: -Math.PI / 2 },
    { etaza: "pritlicje", tip: "postelja", x: 3.1, z: 3.3 },
    // nadstropje: spalnica S, soba J, dnevni Z s kuhinjo ob steni sobe
    { etaza: "nadstropje", tip: "postelja", x: 3.25, z: -4.3, rot: Math.PI / 2 },
    { etaza: "nadstropje", tip: "postelja", x: 2.9, z: 2.6 },
    { etaza: "nadstropje", tip: "kavc", x: -3.5, z: 0.4, rot: Math.PI / 2 },
    { etaza: "nadstropje", tip: "miza", x: -1.8, z: 2.8 },
    { etaza: "nadstropje", tip: "kuhinja", x: 0.45, z: 2.6, rot: -Math.PI / 2 },
    { etaza: "nadstropje", tip: "tv", x: -0.9, z: -2.6, rot: 0 },
    // podstreha (tloris list 7: kuhinja ob steni spalnice, jedilna miza ob frčadi)
    { etaza: "podstreha", tip: "postelja", x: -1.6, z: -3.8 },
    { etaza: "podstreha", tip: "postelja", x: 2.8, z: 3.0 },
    { etaza: "podstreha", tip: "kavc", x: -2.7, z: 0.6, rot: Math.PI / 2 },
    { etaza: "podstreha", tip: "kuhinja", x: 1.0, z: 0.2, rot: -Math.PI / 2 },
    { etaza: "podstreha", tip: "miza", x: -1.4, z: 3.3 },
  ];
  for (const o of oprema) {
    const y = ETAZE[o.etaza].tla;
    const rot = o.rot ?? 0;
    if (o.tip === "postelja") {
      const obrnjena = Math.abs(Math.sin(rot)) > 0.5;
      if (obrnjena) {
        trdno(mat.pohistvoLes, o.x - 1.05, y, o.z - 0.85, o.x + 1.05, y + 0.25, o.z + 0.85);
        boks(mat.tekstil, 2.0, 0.22, 1.6, o.x, y + 0.36, o.z);
        boks(mat.keramikaBela, 0.1, 0.1, 1.5, o.x + 0.95, y + 0.52, o.z, false);
      } else {
        trdno(mat.pohistvoLes, o.x - 0.85, y, o.z - 1.05, o.x + 0.85, y + 0.25, o.z + 1.05);
        boks(mat.tekstil, 1.6, 0.22, 2.0, o.x, y + 0.36, o.z);
        boks(mat.keramikaBela, 1.5, 0.1, 0.5, o.x, y + 0.52, o.z - 0.7, false);
      }
    } else if (o.tip === "omara") {
      if (rot) trdno(mat.pohistvoLes, o.x - 0.3, y, o.z - 1.0, o.x + 0.3, y + 2.2, o.z + 1.0);
      else trdno(mat.pohistvoLes, o.x - 1.0, y, o.z - 0.3, o.x + 1.0, y + 2.2, o.z + 0.3);
    } else if (o.tip === "kavc") {
      const gsk = new THREE.Group();
      const k1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.42, 0.95), mat.tekstil);
      k1.position.y = 0.21;
      const k2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.25), mat.tekstil);
      k2.position.set(0, 0.62, -0.34);
      gsk.add(k1, k2);
      gsk.position.set(o.x, y, o.z);
      gsk.rotation.y = rot;
      gsk.traverse((q) => { if (q instanceof THREE.Mesh) { q.castShadow = true; q.receiveShadow = true; } });
      g.add(gsk);
      kolizije.push(new THREE.Box3(new THREE.Vector3(o.x - 1.1, y, o.z - 1.1), new THREE.Vector3(o.x + 1.1, y + 0.8, o.z + 1.1)));
    } else if (o.tip === "miza") {
      trdno(mat.pohistvoLes, o.x - 0.6, y + 0.72, o.z - 0.45, o.x + 0.6, y + 0.76, o.z + 0.45);
      for (const [dx, dz] of [[-0.5, -0.35], [0.5, -0.35], [-0.5, 0.35], [0.5, 0.35]] as const) {
        boks(mat.pohistvoTemno, 0.06, 0.72, 0.06, o.x + dx, y + 0.36, o.z + dz, false);
      }
      for (const [dx, dz] of [[-0.95, 0], [0.95, 0], [0, -0.8], [0, 0.8]] as const) {
        boks(mat.pohistvoTemno, 0.42, 0.45, 0.42, o.x + dx, y + 0.225, o.z + dz, false);
      }
    } else if (o.tip === "kuhinja") {
      const gsk = new THREE.Group();
      const spodnji = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.9, 0.62), mat.pohistvoTemno);
      spodnji.position.y = 0.45;
      const pult = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.04, 0.65), mat.granitogres);
      pult.position.y = 0.92;
      const zgornji = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.7, 0.36), mat.pohistvoLes);
      zgornji.position.set(0, 1.85, -0.13);
      const stedilnik = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.55), mat.jekloAntracit);
      stedilnik.position.set(0.5, 0.945, 0);
      const korito = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.4), mat.keramikaBela);
      korito.position.set(-0.7, 0.945, 0);
      gsk.add(spodnji, pult, zgornji, stedilnik, korito);
      gsk.position.set(o.x, y, o.z);
      gsk.rotation.y = rot;
      gsk.traverse((q) => { if (q instanceof THREE.Mesh) { q.castShadow = true; q.receiveShadow = true; } });
      g.add(gsk);
      const rotiran = Math.abs(Math.sin(rot)) > 0.5;
      const kw = rotiran ? 0.7 : 3.1;
      const kd = rotiran ? 3.1 : 0.7;
      kolizije.push(new THREE.Box3(new THREE.Vector3(o.x - kw / 2, y, o.z - kd / 2), new THREE.Vector3(o.x + kw / 2, y + 2.3, o.z + kd / 2)));
    } else if (o.tip === "tv") {
      const gsk = new THREE.Group();
      const omarica = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.4), mat.pohistvoTemno);
      omarica.position.y = 0.2;
      const ekran = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.8, 0.05), mat.notranjost);
      ekran.position.set(0, 1.25, -0.12);
      gsk.add(omarica, ekran);
      gsk.position.set(o.x, y, o.z);
      gsk.rotation.y = rot;
      gsk.traverse((q) => { if (q instanceof THREE.Mesh) { q.castShadow = true; q.receiveShadow = true; } });
      g.add(gsk);
      kolizije.push(new THREE.Box3(new THREE.Vector3(o.x - 0.5, y, o.z - 1.0), new THREE.Vector3(o.x + 0.5, y + 0.5, o.z + 1.0)));
    }
  }

  // nov lesen steber C24 160/160 z zavetrovanjem (tloris list 7) — pod slemenom
  {
    const yZg = NACRT.slemeY - 1.05;
    trdno(mat.pohistvoLes, -0.08, NACRT.podstrehaTla, -0.68, 0.08, yZg, -0.52);
    boks(mat.pohistvoLes, 0.12, 0.16, 1.6, 0, yZg - 0.1, -0.6, false); // razbremenilna glava
  }

  // ===================== STREHA (Prefalz) + FRČADI =====================
  /**
   * Po prerezu A-A (list 4), tlorisu ostrešja (list 5) in detajlih D1/D2 (list 9).
   *
   * Prej je bila zahodna frčada škatla, vdrta 0,65 m za fasado, vzhodna stran
   * pa trije ločeni kosi (izrez strešine, mini streha, streha stolpa). Prerez
   * A-A pokaže drugače: OBE frčadi sta enokapnici od slemena navzven —
   * zahodna s čelom v ravnini fasade do kote +8,85 (0,50 pod slemenom), vzhodna
   * („dvig strehe — frčada + streha stopnišča“) zvezno čez ves stolp stopnišča.
   */
  const kapY = NACRT.podstrehaTla + NACRT.kolencna;
  const strehaD = NACRT.sirinaSJ + 2 * NACRT.previsCelo;
  const zS0 = -strehaD / 2;
  const zS1 = strehaD / 2;
  const xKap = polG + NACRT.previsKap;
  const DEB_STREHE = 0.1;
  const DEB_LICA = 0.2; // bočna stena frčade (D1: fasada + 10 + OSB + 15 cm)
  const obrobaM = mat.jekloAntracit;
  const zlebM = mat.jekloAntracit.clone();
  zlebM.side = THREE.DoubleSide;

  /** Ravnina strehe: spodnji rob gre od (x=0, yVrh) navzven pod kotom `kot`. */
  type Ravnina = { smer: 1 | -1; kot: number; yVrh: number };
  const yNa = (r: Ravnina, x: number) => r.yVrh - Math.tan(r.kot) * Math.abs(x);
  const poNagibu = (r: Ravnina, m: THREE.Material, z0: number, z1: number, xOd: number, xDo: number, debelina: number, odmik: number, senca = true) => {
    const dolz = (xDo - xOd) / Math.cos(r.kot);
    const xs = (r.smer * (xOd + xDo)) / 2;
    const ys = (yNa(r, xOd) + yNa(r, xDo)) / 2;
    const nx = Math.sin(r.kot) * r.smer;
    const ny = Math.cos(r.kot);
    const p = boks(m, dolz, debelina, z1 - z0, xs + nx * odmik, ys + ny * odmik, (z0 + z1) / 2, senca);
    p.rotation.z = -r.smer * r.kot;
    return p;
  };
  /**
   * Strešna ploskev s stoječimi zgibi. Zgibi so geometrija in ne risba na
   * teksturi: tekstura se raztegne po vsaki škatli drugače in je zgibe kazala
   * VZPOREDNO s kapjo — streha je bila videti kot deske. Pri Prefalzu tečejo
   * od slemena do kapi, razmak ~0,50 m.
   */
  const ploskev = (r: Ravnina, z0: number, z1: number, xOd: number, xDo: number) => {
    poNagibu(r, mat.prefalz, z0, z1, xOd, xDo, DEB_STREHE, DEB_STREHE / 2);
    for (let z = Math.ceil((z0 + 0.12) / 0.5) * 0.5; z < z1 - 0.12; z += 0.5) {
      const dolz = (xDo - xOd) / Math.cos(r.kot);
      const zg = boks(mat.prefalz, dolz, 0.035, 0.022, 0, 0, z, false);
      zg.position.set(
        (r.smer * (xOd + xDo)) / 2 + Math.sin(r.kot) * r.smer * (DEB_STREHE + 0.017),
        (yNa(r, xOd) + yNa(r, xDo)) / 2 + Math.cos(r.kot) * (DEB_STREHE + 0.017),
        z
      );
      zg.rotation.z = -r.smer * r.kot;
    }
  };
  /** Kapna obroba — čelo 0,19 m (D2), poravnano z vrhom kritine. */
  const kapnaObroba = (r: Ravnina, z0: number, z1: number, xDo: number) => {
    boks(obrobaM, 0.03, 0.19, z1 - z0, r.smer * (xDo + 0.015), yNa(r, xDo) + 0.015, (z0 + z1) / 2, false);
  };
  /** Čelna obroba ob zatrepu (vzdolž nagiba). */
  const celnaObroba = (r: Ravnina, z: number, xOd: number, xDo: number) => {
    poNagibu(r, obrobaM, z - 0.015, z + 0.015, xOd, xDo, 0.16, 0.04, false);
  };
  /** Cev med dvema točkama (odtoki, kolena). */
  const cev = (a: THREE.Vector3, b: THREE.Vector3, r = 0.045) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 12), obrobaM);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    m.castShadow = true;
    g.add(m);
  };
  /** Polkrožni žleb (D2) z zavihanim robom in čelnima zaključkoma. */
  const zleb = (r: Ravnina, xDo: number, z0: number, z1: number) => {
    const R = 0.075;
    const x = r.smer * (xDo + R - 0.01);
    const y = yNa(r, xDo) - 0.03;
    const ziva = new THREE.Mesh(new THREE.CylinderGeometry(R, R, z1 - z0, 18, 1, true, -Math.PI / 2, Math.PI), zlebM);
    ziva.rotation.x = Math.PI / 2;
    ziva.position.set(x, y, (z0 + z1) / 2);
    ziva.castShadow = true;
    g.add(ziva);
    const rob = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, z1 - z0, 6), zlebM);
    rob.rotation.x = Math.PI / 2;
    rob.position.set(x + r.smer * R, y, (z0 + z1) / 2);
    g.add(rob);
    for (const zz of [z0, z1]) {
      const cep = new THREE.Mesh(new THREE.CircleGeometry(R, 12, Math.PI, Math.PI), zlebM);
      cep.position.set(x, y, zz);
      g.add(cep);
    }
    return { x, y };
  };
  /** Odtočna cev: iz žleba, s kolenom do fasade, ob fasadi do tal; objemke na ~2 m. */
  const odtok = (zl: { x: number; y: number }, z: number, xStena: number, yDo = 0.12) => {
    const a = new THREE.Vector3(zl.x, zl.y - 0.04, z);
    const b = new THREE.Vector3(zl.x, zl.y - 0.2, z);
    const c = new THREE.Vector3(xStena, zl.y - 0.55, z);
    const d = new THREE.Vector3(xStena, yDo, z);
    cev(a, b);
    cev(b, c);
    cev(c, d);
    for (let y = yDo + 0.6; y < c.y - 0.3; y += 2.0) {
      boks(obrobaM, 0.03, 0.04, 0.12, xStena + Math.sign(xStena) * -0.06, y, z, false);
    }
    // čevelj na dnu
    cev(new THREE.Vector3(xStena, yDo + 0.12, z), new THREE.Vector3(xStena + Math.sign(xStena) * 0.12, yDo, z), 0.045);
  };
  /** Snegobrani: dve vodoravni palici na nosilcih nad kapjo. */
  const snegobran = (r: Ravnina, z0: number, z1: number, x: number) => {
    const y = yNa(r, x) + DEB_STREHE;
    for (const dv of [0.06, 0.13]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, z1 - z0, 6), obrobaM);
      m.rotation.x = Math.PI / 2;
      m.position.set(r.smer * x, y + dv, (z0 + z1) / 2);
      g.add(m);
    }
    for (let z = z0 + 0.25; z < z1; z += 0.9) boks(obrobaM, 0.03, 0.16, 0.02, r.smer * x, y + 0.08, z, false);
  };

  const glavnaZ: Ravnina = { smer: -1, kot: NAKLON, yVrh: NACRT.slemeY };
  const glavnaV: Ravnina = { smer: 1, kot: NAKLON, yVrh: NACRT.slemeY };

  // --- zahodna frčada (enokapnica, čelo v ravnini fasade) ---
  const F = NACRT.frcada;
  const zF0 = F.sredinaZ - F.sirina / 2;
  const zF1 = F.sredinaZ + F.sirina / 2;
  const ravF: Ravnina = { smer: -1, kot: Math.atan((NACRT.slemeY - F.vrh) / polG), yVrh: NACRT.slemeY };
  const xKapF = polG + F.previs;
  const zFs0 = zF0 - DEB_LICA - 0.08;
  const zFs1 = zF1 + DEB_LICA + 0.08;

  // --- vzhodni dvig strehe (frčada + streha stopnišča, zvezno) ---
  const S0 = NACRT.stopnisce;
  const zD0 = -polS + S0.odSevernegaRoba;
  const zD1 = zD0 + S0.dolzinaSJ;
  const ravD: Ravnina = { smer: 1, kot: (NACRT.dvigVzhod.naklonStopinj * Math.PI) / 180, yVrh: NACRT.slemeY };
  const xKapD = polG + S0.globinaVZ + NACRT.dvigVzhod.previs;
  const zDs0 = zD0 - 0.25;
  const zDs1 = zD1 + 0.25;

  // glavna zahodna strešina: cela, v pasu frčade pa le kapni previs, ki ostane
  // kot nadstrešek pod oknom O6 (prerez A-A: „zapiranje vidnega ostrešja“)
  ploskev(glavnaZ, zS0, zF0, 0, xKap);
  ploskev(glavnaZ, zF1, zS1, 0, xKap);
  ploskev(glavnaZ, zF0, zF1, polG - 0.02, xKap);
  // glavna vzhodna strešina: brez pasu stopnišča — tam je dvig strehe
  ploskev(glavnaV, zS0, zD0, 0, xKap);
  ploskev(glavnaV, zD1, zS1, 0, xKap);
  // slemenska obroba
  boks(obrobaM, 0.34, 0.1, strehaD + 0.02, 0, NACRT.slemeY + 0.16, 0);

  // obrobe in žlebovi glavne strehe
  kapnaObroba(glavnaZ, zS0, zS1, xKap);
  kapnaObroba(glavnaV, zS0, zD0, xKap);
  kapnaObroba(glavnaV, zD1, zS1, xKap);
  for (const r of [glavnaZ, glavnaV]) {
    celnaObroba(r, zS0, 0, xKap);
    celnaObroba(r, zS1, 0, xKap);
  }
  const zlebZ = zleb(glavnaZ, xKap, zS0, zS1);
  const zlebV1 = zleb(glavnaV, xKap, zS0, zD0);
  const zlebV2 = zleb(glavnaV, xKap, zD1, zS1);
  for (const zz of [-polS + 0.25, polS - 0.25]) odtok(zlebZ, zz, -(polG + 0.07));
  odtok(zlebV1, -polS + 0.25, polG + 0.07);
  odtok(zlebV2, polS - 0.25, polG + 0.07);
  snegobran(glavnaZ, zS0 + 0.1, zF0 - 0.05, polG - 0.35);
  snegobran(glavnaZ, zF1 + 0.05, zS1 - 0.1, polG - 0.35);
  snegobran(glavnaV, zS0 + 0.1, zD0 - 0.05, polG - 0.35);
  snegobran(glavnaV, zD1 + 0.05, zS1 - 0.1, polG - 0.35);

  // ZAHODNA FRČADA — čelna stena z oknom O6 (okno samo vstavi zanka fasad: O6 je
  // v ODPRTINAH s parapetom 1,16, torej spodnji rob točno na kolenčni steni)
  stena(mat.fasadaNova, "z", -polG + DEB / 2, zF0, zF1, kapY, F.vrh + 0.05, DEB, [
    { sredina: F.sredinaZ, w: OKNA_TIPI.O6.w, y0: kapY, y1: kapY + OKNA_TIPI.O6.h },
  ]);
  /** Bočna stena (lice) frčade: trikotnik med strešino in enokapnico (D1). */
  const lice = (smer: 1 | -1, rav: Ravnina, zOd: number, xDo: number) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, NACRT.slemeY);
    sh.lineTo(smer * xDo, yNa(glavnaZ, xDo));
    sh.lineTo(smer * xDo, yNa(rav, xDo));
    sh.closePath();
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: DEB_LICA, bevelEnabled: false }), mat.fasadaNova);
    m.position.z = zOd;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  lice(-1, ravF, zF0 - DEB_LICA, polG);
  lice(-1, ravF, zF1, polG);
  ploskev(ravF, zFs0, zFs1, 0, xKapF);
  kapnaObroba(ravF, zFs0, zFs1, xKapF);
  celnaObroba(ravF, zFs0, 0.6, xKapF);
  celnaObroba(ravF, zFs1, 0.6, xKapF);
  // podšivek previsa (D2: 0,30 m) — bel, kot omet
  boks(mat.okvir, F.previs, 0.03, zFs1 - zFs0, -(polG + F.previs / 2), yNa(ravF, xKapF) - 0.07, (zFs0 + zFs1) / 2, false);
  const zlebF = zleb(ravF, xKapF, zFs0, zFs1);
  // odtok frčade na glavni žleb (ob južnem robu frčade)
  cev(new THREE.Vector3(zlebF.x, zlebF.y - 0.04, zFs1 - 0.12), new THREE.Vector3(zlebF.x, zlebZ.y + 0.45, zFs1 - 0.12));
  cev(new THREE.Vector3(zlebF.x, zlebZ.y + 0.45, zFs1 - 0.12), new THREE.Vector3(zlebZ.x, zlebZ.y + 0.02, zFs1 - 0.12));
  // mavčni strop pod enokapnico (od znotraj se sicer vidi pločevina)
  poNagibu(ravF, mat.mavcna, zF0, zF1, 0.2, polG - DEB, 0.05, -0.32, false);

  // VZHODNI DVIG STREHE — čelna stena nad kolenčno z vrhovoma vrat ZV4 in okna O4
  stena(mat.fasadaNova, "z", polG - DEB / 2, zD0, zD1, kapY, yNa(ravD, polG) + 0.05, DEB, [
    { sredina: -1.57, w: OKNA_TIPI.ZV4.w, y0: kapY, y1: NACRT.podstrehaTla + OKNA_TIPI.ZV4.h },
    { sredina: -0.12, w: OKNA_TIPI.O4.w, y0: kapY, y1: NACRT.podstrehaTla + 1.0 + OKNA_TIPI.O4.h },
  ]);
  lice(1, ravD, zD0 - DEB_LICA, polG);
  lice(1, ravD, zD1, polG);
  ploskev(ravD, zDs0, zDs1, 0, xKapD);
  kapnaObroba(ravD, zDs0, zDs1, xKapD);
  celnaObroba(ravD, zDs0, 0.6, xKapD);
  celnaObroba(ravD, zDs1, 0.6, xKapD);
  const zlebD = zleb(ravD, xKapD, zDs0, zDs1);
  odtok(zlebD, zDs1 - 0.15, polG + S0.globinaVZ + 0.12);
  poNagibu(ravD, mat.mavcna, zD0, zD1, 0.2, polG - DEB, 0.05, -0.32, false);
  /** Spodnji rob dviga strehe nad točko x (za stolp stopnišča). */
  const yPodDvigom = (x: number) => yNa(ravD, x) - 0.02;

  // strešno okno v vzhodni strešini — kopalnica podstrehe (PZI: „strešno okno“).
  // Drugo strešno okno (soba, z = 1,6) je odpadlo: po tlorisu ostrešja je ta
  // del pod dvigom strehe, soba dobi svetlobo skozi O4 v čelu dviga.
  {
    const xc = 2.35;
    const so = new THREE.Group();
    so.position.set(xc, NACRT.slemeY - Math.tan(NAKLON) * xc + 0.12, -3.7);
    so.rotation.z = -NAKLON;
    const okvirSO = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.82), mat.jekloAntracit);
    okvirSO.receiveShadow = true;
    so.add(okvirSO);
    const st = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.085, 0.68), mat.steklo);
    st.position.y = 0.01;
    so.add(st);
    stekla.push(st);
    g.add(so);
  }

  // dimnik (kurilnica SV) — ~0,8 m nad strešino, ometan, s kapo iz pločevine
  {
    const strehaPriX = NACRT.slemeY - Math.tan(NAKLON) * 3.4;
    boks(mat.fasadaNova, 0.5, strehaPriX + 0.8 - (strehaPriX - 0.4), 0.5, 3.4, strehaPriX + 0.2, -3.9);
    boks(obrobaM, 0.62, 0.05, 0.62, 3.4, strehaPriX + 0.83, -3.9, false);
    boks(obrobaM, 0.14, 0.12, 0.14, 3.4, strehaPriX + 0.92, -3.9, false);
    boks(obrobaM, 0.5, 0.03, 0.5, 3.4, strehaPriX + 1.0, -3.9, false);
  }

  // ===================== BALKONI =====================
  trdno(mat.beton, -polG - NACRT.balkonGlobina, NACRT.balkonY - 0.22, -polS, -polG, NACRT.balkonY + 0.02, polS);
  pohodno(-polG - NACRT.balkonGlobina, -polS, -polG, polS, NACRT.balkonY + 0.02);
  const ograjaLam = (x1: number, z1: number, x2: number, z2: number, y: number) => {
    const w = Math.max(x2 - x1, 0.06);
    const d = Math.max(z2 - z1, 0.06);
    const o = boks(mat.lamele, w, 1.05, d, (x1 + x2) / 2, y + 0.525, (z1 + z2) / 2);
    o.castShadow = true;
    kolizije.push(new THREE.Box3(new THREE.Vector3(x1, y, z1), new THREE.Vector3(x2, y + 1.05, z2)));
  };
  ograjaLam(-polG - NACRT.balkonGlobina, -polS, -polG - NACRT.balkonGlobina + 0.06, polS, NACRT.balkonY + 0.02);
  ograjaLam(-polG - NACRT.balkonGlobina, -polS, -polG, -polS + 0.06, NACRT.balkonY + 0.02);
  ograjaLam(-polG - NACRT.balkonGlobina, polS - 0.06, -polG, polS, NACRT.balkonY + 0.02);
  // južna balkončka (1. nadstropje pri O5c, podstreha pri O5)
  for (const [y, x1, x2] of [[NACRT.balkonY, 0.0, 2.0], [NACRT.podstrehaTla, -2.1, 0.3]] as const) {
    trdno(mat.beton, x1, y - 0.2, polS, x2, y + 0.02, polS + 0.95);
    pohodno(x1, polS, x2, polS + 0.95, y + 0.02);
    ograjaLam(x1, polS + 0.89, x2, polS + 0.95, y + 0.02);
    ograjaLam(x1, polS, x1 + 0.06, polS + 0.95, y + 0.02);
    ograjaLam(x2 - 0.06, polS, x2, polS + 0.95, y + 0.02);
  }

  // ===================== ZUNANJE STOPNIŠČE (vzhod) — ODPRTA JEKLENA KONSTRUKCIJA =====================
  {
    const S = NACRT.stopnisce;
    const z1 = -polS + S.odSevernegaRoba;
    const z2 = z1 + S.dolzinaSJ;
    const x1 = polG;
    const x2 = polG + S.globinaVZ;
    const xNotr = x1 + S.podestSirina;

    // vrh stolpa: pod dvigom strehe, ki teče od slemena čez ves stolp (tloris
    // ostrešja: „dvig strehe — frčada + streha stopnišča“). Prej je imel stolp
    // svojo ravno streho na +7,7 m, ločeno od hiše.
    const vrhStolpa = (x: number) => yPodDvigom(x) - 0.06;

    // stebri HOP 100/100/3 po PZI rastru (cinkani, prašno barvani). PZI izrecno
    // pravi, da so pozicije profilov informativne in jih je treba uskladiti z
    // nosilnimi stenami — zato steber ob fasadi, ki bi pristal sredi vrat ZV4,
    // odmaknemo na podboj (sicer bi stal točno na poti skozi vrata).
    const vrataOs = -1.57;
    const vrataPol = OKNA_TIPI.ZV4.w / 2 + 0.12;
    for (const odmik of NACRT.stopnisce.stebriOdmiki) {
      const sz = z1 + odmik;
      for (const sx of [x1 + 0.07, x2 - 0.07]) {
        let z = sz;
        if (sx < xNotr && Math.abs(sz - vrataOs) < vrataPol) {
          z = sz < vrataOs ? vrataOs - vrataPol : vrataOs + vrataPol;
        }
        trdno(mat.jekloAntracit, sx - 0.05, 0, z - 0.05, sx + 0.05, vrhStolpa(sx), z + 0.05);
      }
    }
    // prečke na vrhu (okvir strehe) — v naklonu dviga
    poNagibu(ravD, mat.jekloAntracit, z1 + 0.02, z1 + 0.12, x1, x2, 0.1, -0.08, false);
    poNagibu(ravD, mat.jekloAntracit, z2 - 0.12, z2 - 0.02, x1, x2, 0.1, -0.08, false);

    // LAMELNA OBLEKA s presledki — vidna konstrukcija skozi (pogledi A/B/C)
    const lamelnaStena = (os: "x" | "z", pri: number, od: number, doo: number, y0: number, vrh: (a: number) => number) => {
      const korak = 0.17;
      const sirL = 0.09;
      let y1 = y0;
      for (let a = od + korak / 2; a < doo; a += korak) {
        // vrh vsake lamele sledi naklonu strehe nad njo
        const ya = vrh(os === "x" ? a : pri);
        y1 = Math.max(y1, ya);
        if (os === "z") boks(mat.pohistvoLes, 0.05, ya - y0, sirL, pri, (y0 + ya) / 2, a, false);
        else boks(mat.pohistvoLes, sirL, ya - y0, 0.05, a, (y0 + ya) / 2, pri, false);
      }
      // kolizija: tanek pas (skozi lamele se ne hodi)
      if (os === "z") kolizije.push(new THREE.Box3(new THREE.Vector3(pri - 0.04, y0, od), new THREE.Vector3(pri + 0.04, y1, doo)));
      else kolizije.push(new THREE.Box3(new THREE.Vector3(od, y0, pri - 0.04), new THREE.Vector3(doo, y1, pri + 0.04)));
    };
    lamelnaStena("z", x2 - 0.03, z1 + 0.1, z2 - 0.1, 0.25, vrhStolpa); // vzhodna stran
    // severna: ob fasadi ostane odprtina za VSTOP v stolp (s severnega tlakovca)
    lamelnaStena("x", z1 + 0.03, x1 + 1.0, x2 - 0.1, 0.25, vrhStolpa);
    lamelnaStena("x", z2 - 0.03, x1 + 0.1, x2 - 0.1, 0.25, vrhStolpa); // južna

    // ograja iz ravne pločevine 40/4: stebrički + vrhnji pas
    const ograjica = (ax: number, az: number, bx: number, bz: number, ya: number, yb: number) => {
      const dolzina = Math.hypot(bx - ax, bz - az);
      const kosov = Math.max(2, Math.round(dolzina / 0.13));
      for (let i = 0; i <= kosov; i++) {
        const t = i / kosov;
        const px = ax + (bx - ax) * t;
        const pz = az + (bz - az) * t;
        const py = ya + (yb - ya) * t;
        boks(mat.jekloAntracit, 0.04, 1.0, 0.012, px, py + 0.5, pz, false);
      }
      // ročaj
      const rocaj = new THREE.Mesh(new THREE.BoxGeometry(dolzina + 0.05, 0.05, 0.04), mat.jekloAntracit);
      rocaj.position.set((ax + bx) / 2, (ya + yb) / 2 + 1.0, (az + bz) / 2);
      rocaj.rotation.y = -Math.atan2(bz - az, bx - ax);
      rocaj.rotation.z = Math.atan2(yb - ya, dolzina);
      rocaj.castShadow = false;
      g.add(rocaj);
    };

    // podesti pri vratih (1N, podstreha) — severni del, cinkana rebrasta pločevina
    for (const py of [NACRT.nadstropjeTla, NACRT.podstrehaTla]) {
      trdno(mat.rebrasta, x1, py - 0.05, z1 + 0.06, xNotr + 0.15, py, z1 + 1.6);
      pohodno(x1, z1 + 0.06, xNotr + 0.15, z1 + 1.6, py);
      ograjica(xNotr + 0.15, z1 + 0.06, xNotr + 0.15, z1 + 1.6, py, py);
    }
    // vmesna podesta (jug)
    for (const py of [NACRT.nadstropjeTla / 2, (NACRT.nadstropjeTla + NACRT.podstrehaTla) / 2]) {
      trdno(mat.rebrasta, x1, py - 0.05, z2 - 1.21, x2 - 0.12, py, z2 - 0.06);
      pohodno(x1, z2 - 1.21, x2 - 0.12, z2 - 0.06, py);
    }

    // rampe: posamezne rebraste stopnice s presledki (12x 17,5/28 po PZI)
    const rampa = (sx1: number, sx2: number, zOd: number, zDo: number, y0: number, y1: number) => {
      const st = 8;
      const dz = (zDo - zOd) / st;
      const dy = (y1 - y0) / st;
      for (let i = 0; i < st; i++) {
        const zz = zOd + dz * (i + 0.5);
        const yy = y0 + dy * (i + 1);
        // nastopna ploskev (cinkana rebrasta pločevina) + zaprto čelo, da so
        // stopnice jasno vidne tudi od daleč (odprta čela so se brala kot luknje)
        boks(mat.rebrasta, sx2 - sx1 - 0.12, 0.05, Math.abs(dz) - 0.02, (sx1 + sx2) / 2, yy - 0.025, zz, false);
        boks(mat.jekloAntracit, sx2 - sx1 - 0.12, 0.16, 0.03, (sx1 + sx2) / 2, yy - 0.1, zz + (dz > 0 ? -Math.abs(dz) / 2 + 0.02 : Math.abs(dz) / 2 - 0.02), false);
        tla.push(new THREE.Box3(new THREE.Vector3(sx1, yy - 0.2, zz - Math.abs(dz) / 2), new THREE.Vector3(sx2, yy, zz + Math.abs(dz) / 2)));
      }
      // nosilca (stringerja) ob straneh
      const dolz = Math.hypot(zDo - zOd, y1 - y0) + 0.3;
      for (const sx of [sx1 + 0.05, sx2 - 0.05]) {
        const nosilec = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, dolz), mat.jekloAntracit);
        nosilec.position.set(sx, (y0 + y1) / 2 - 0.1, (zOd + zDo) / 2);
        nosilec.rotation.x = Math.atan2(y1 - y0, zDo - zOd) * (zDo > zOd ? -1 : 1) * (zDo > zOd ? 1 : -1);
        nosilec.rotation.x = -Math.atan2(y1 - y0, Math.abs(zDo - zOd)) * Math.sign(zDo - zOd);
        nosilec.castShadow = false;
        g.add(nosilec);
      }
      // notranja ograja vzdolž rampe
      ograjica((sx1 + sx2) / 2 > xNotr ? sx1 + 0.08 : sx2 - 0.08, zOd, (sx1 + sx2) / 2 > xNotr ? sx1 + 0.08 : sx2 - 0.08, zDo, y0, y1);
    };
    const zRampOd = z1 + 1.6;
    const zRampDo = z2 - 1.21;
    rampa(xNotr + 0.15, x2 - 0.12, zRampOd, zRampDo, 0, NACRT.nadstropjeTla / 2);
    rampa(x1, xNotr + 0.15, zRampDo, zRampOd, NACRT.nadstropjeTla / 2, NACRT.nadstropjeTla);
    rampa(xNotr + 0.15, x2 - 0.12, zRampOd, zRampDo, NACRT.nadstropjeTla, (NACRT.nadstropjeTla + NACRT.podstrehaTla) / 2);
    rampa(x1, xNotr + 0.15, zRampDo, zRampOd, (NACRT.nadstropjeTla + NACRT.podstrehaTla) / 2, NACRT.podstrehaTla);

    // luči v stolpu (dovolj svetlo, da se rame stopnic berejo tudi ponoči)
    for (const ly of [1.2, 2.6, 5.0, 6.9]) {
      const pl = new THREE.PointLight("#ffe7c4", 6, 7.5, 1.9);
      pl.position.set((x1 + x2) / 2, ly, (z1 + z2) / 2);
      g.add(pl);
    }
  }

  // stropne luči po etažah (brez senc — notranjost bi bila sicer temna)
  const stropnice: { etaza: Etaza; x: number; z: number }[] = [
    { etaza: "pritlicje", x: -2.4, z: 2.4 }, { etaza: "pritlicje", x: -2.6, z: -2.8 },
    { etaza: "pritlicje", x: 0.3, z: -4.0 }, { etaza: "pritlicje", x: 2.9, z: 0.2 },
    { etaza: "pritlicje", x: 2.9, z: 3.2 }, { etaza: "pritlicje", x: -0.3, z: -1.9 },
    { etaza: "pritlicje", x: 3.2, z: -1.8 }, { etaza: "pritlicje", x: 3.1, z: -4.1 },
    { etaza: "pritlicje", x: 0.3, z: 2.2 },
    { etaza: "nadstropje", x: -2.4, z: 1.8 }, { etaza: "nadstropje", x: -1.6, z: -3.4 },
    { etaza: "nadstropje", x: 2.7, z: -4.2 }, { etaza: "nadstropje", x: 2.8, z: 2.2 },
    { etaza: "nadstropje", x: 0.5, z: -1.2 }, { etaza: "nadstropje", x: 2.7, z: -2.7 },
    { etaza: "nadstropje", x: 3.4, z: -1.1 }, { etaza: "nadstropje", x: -2.4, z: -1.6 },
    { etaza: "podstreha", x: -1.8, z: 0.6 }, { etaza: "podstreha", x: -1.8, z: -3.4 },
    { etaza: "podstreha", x: 2.6, z: 2.0 }, { etaza: "podstreha", x: 2.7, z: -3.6 },
    { etaza: "podstreha", x: 3.2, z: -1.4 }, { etaza: "podstreha", x: 0.4, z: 2.6 },
  ];
  for (const l of stropnice) {
    const E = ETAZE[l.etaza];
    const y = l.etaza === "podstreha" ? E.tla + 2.15 : E.strop - 0.06;
    const ohisje = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.13, 0.05, 12),
      new THREE.MeshStandardMaterial({ color: "#f8f6f0", emissive: "#fff4dc", emissiveIntensity: 0.9, roughness: 0.6 })
    );
    ohisje.position.set(l.x, y, l.z);
    g.add(ohisje);
    const pl = new THREE.PointLight("#fff1d8", 7.5, 9.5, 1.9);
    pl.position.set(l.x, y - 0.12, l.z);
    g.add(pl);
  }

  // fasadna svetilka ob vhodu ZV1 (sever)
  boks(mat.okvir, 0.14, 0.2, 0.14, 1.05, 2.4, -polS - 0.12, false);
  const luc = new THREE.PointLight("#ffd9a3", 0, 9, 2);
  luc.position.set(1.05, 2.35, -polS - 0.45);
  g.add(luc);
  lucke.push(luc);

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.receiveShadow = true;
  });
  return { skupina: g, kolizije, tla, stekla, lucke };
}
