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
    const el = (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
      b.position.set(x, y, z);
      b.castShadow = false;
      b.receiveShadow = true;
      sk.add(b);
      return b;
    };
    // podboj/okvir
    el(okvirM, 0.34, 0.07, w + 0.1, 0, h / 2 + 0.03, 0);
    el(okvirM, 0.34, 0.07, w + 0.1, 0, -h / 2 - 0.03, 0);
    el(okvirM, 0.34, h + 0.12, 0.07, 0, 0, w / 2 + 0.03);
    el(okvirM, 0.34, h + 0.12, 0.07, 0, 0, -w / 2 - 0.03);
    if (t.vrsta === "vrata") {
      // vhodna vrata: krilo (priprto), pri širših tipih fiksna zasteklitev ob krilu
      const kriloW = Math.min(w, 1.0) * (w > 1.2 ? 0.45 : 0.92);
      const krilo = new THREE.Group();
      const plosca = new THREE.Mesh(new THREE.BoxGeometry(0.06, h - 0.06, kriloW), mat.vrata);
      plosca.position.z = -kriloW / 2;
      plosca.castShadow = false;
      krilo.add(plosca);
      const kljuka = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.16), mat.jekloAntracit);
      kljuka.position.set(ven * 0.06, -0.02, -kriloW + 0.12);
      krilo.add(kljuka);
      krilo.position.set(0, 0, w / 2 - 0.02);
      krilo.rotation.y = ven * 0.35;
      sk.add(krilo);
      if (w > 1.2) {
        const st = el(mat.steklo, 0.03, h - 0.1, w - kriloW - 0.1, 0, 0, -kriloW / 2 + 0.01);
        stekla.push(st);
        el(okvirM, 0.28, h - 0.08, 0.06, 0, 0, w / 2 - kriloW - 0.03);
      }
    } else if (t.vrsta === "balkonska") {
      // balkonska vrata: stekleno krilo + morebitno fiksno okno ob njem
      const kriloW = Math.min(0.9, w * 0.45);
      const st1 = el(mat.steklo, 0.03, h - 0.1, kriloW - 0.06, 0, 0, w / 2 - kriloW / 2);
      stekla.push(st1);
      el(okvirM, 0.28, h - 0.06, 0.05, 0, 0, w / 2 - kriloW + 0.02);
      const kljuka = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.03), mat.jekloAntracit);
      kljuka.position.set(ven * 0.15, 0, w / 2 - kriloW + 0.09);
      sk.add(kljuka);
      if (w - kriloW > 0.3) {
        const st2 = el(mat.steklo, 0.03, h - 0.1, w - kriloW - 0.1, 0, 0, -kriloW / 2 + 0.0);
        stekla.push(st2);
      }
    } else {
      const st = el(mat.steklo, 0.03, h - 0.08, w - 0.1, 0, 0, 0);
      stekla.push(st);
      for (let k = 1; k < t.krila; k++) {
        el(okvirM, 0.3, h - 0.08, 0.05, 0, 0, -w / 2 + (w / t.krila) * k);
      }
    }
    // zunanja ALU polica pri oknih s parapetom
    if (t.vrsta === "okno" || t.vrsta === "fiksno") {
      el(mat.jekloAntracit, 0.14, 0.03, w + 0.14, ven * 0.22, -h / 2 - 0.08, 0);
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
  // poševni strop podstrehe (mavčne plošče pod špirovci)
  for (const smer of [-1, 1]) {
    const dolz = polG / Math.cos(NAKLON) + 0.2;
    const p = boks(mat.mavcna, dolz, 0.06, NACRT.sirinaSJ - 2 * DEB, (smer * polG) / 2, 0, 0, false);
    p.position.y = (NACRT.podstrehaTla + NACRT.kolencna + NACRT.slemeY) / 2 - 0.14;
    p.rotation.z = -smer * NAKLON;
  }
  boks(mat.mavcna, 3.4, 0.06, NACRT.sirinaSJ - 2 * DEB, 0, NACRT.slemeY - 0.98, 0, false);

  // ===================== PREDELNE STENE =====================
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
    // podstreha
    { etaza: "podstreha", os: "x", pri: -2.28, od: 1.4, doo: notrX2 }, // kopalnica | predprostor
    { etaza: "podstreha", os: "z", pri: 1.4, od: notrZ1, doo: -1.9 }, // kopalnica/spalnica zahodna stena
    { etaza: "podstreha", os: "x", pri: -1.9, od: notrX1, doo: 1.4 }, // spalnica | dnevni
    { etaza: "podstreha", os: "z", pri: 2.4, od: -2.28, doo: -0.6 }, // predprostor | dnevni
    { etaza: "podstreha", os: "x", pri: -0.6, od: 2.4, doo: notrX2 }, // predprostor | soba
    { etaza: "podstreha", os: "z", pri: 1.0, od: -0.6, doo: notrZ2 }, // soba | dnevni
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
    stena(mat.mavcna, p.os, p.pri, p.od, p.doo, E.tla, E.strop, DEBp, luknje);
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
    // podstreha
    { etaza: "podstreha", tip: "postelja", x: -1.6, z: -3.6 },
    { etaza: "podstreha", tip: "postelja", x: 2.8, z: 2.6 },
    { etaza: "podstreha", tip: "kavc", x: -2.4, z: 1.2, rot: Math.PI / 2 },
    { etaza: "podstreha", tip: "kuhinja", x: 0.63, z: 2.9, rot: -Math.PI / 2 },
    { etaza: "podstreha", tip: "miza", x: -1.0, z: 1.0 },
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

  // ===================== STREHA (Prefalz) + FRČADA =====================
  const kapY = NACRT.podstrehaTla + NACRT.kolencna;
  const kapZunY = kapY - Math.tan(NAKLON) * NACRT.previsKap;
  const strehaD = NACRT.sirinaSJ + 2 * NACRT.previsCelo;
  const dolzPoklona = Math.hypot(polG + NACRT.previsKap, NACRT.slemeY - kapZunY) + 0.1;
  for (const smer of [-1, 1]) {
    const plosk = boks(mat.prefalz, dolzPoklona, 0.1, strehaD, (smer * (polG + NACRT.previsKap)) / 2, (NACRT.slemeY + kapZunY) / 2 + 0.05, 0);
    plosk.rotation.z = -smer * NAKLON;
  }
  boks(mat.prefalz, 0.4, 0.12, strehaD, 0, NACRT.slemeY + 0.1, 0);
  // žleb + cevi (zahod)
  const zleb = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, strehaD, 10), mat.jekloAntracit);
  zleb.rotation.x = Math.PI / 2;
  zleb.position.set(-(polG + NACRT.previsKap) - 0.04, kapZunY - 0.02, 0);
  g.add(zleb);
  for (const zz of [-polS + 0.3, polS - 0.3]) {
    const cev = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, kapZunY - 0.3, 8), mat.jekloAntracit);
    cev.position.set(-polG - 0.12, (kapZunY - 0.3) / 2, zz);
    g.add(cev);
  }
  // dimnik (kurilnica SV) — ~0,8 m nad strešino na svojem mestu
  {
    const strehaPriX = NACRT.slemeY - Math.tan(NAKLON) * 3.4;
    boks(mat.fasadaNova, 0.5, strehaPriX + 0.8 - (strehaPriX - 0.4), 0.5, 3.4, strehaPriX + 0.2, -3.9);
    boks(mat.jekloAntracit, 0.6, 0.1, 0.6, 3.4, strehaPriX + 0.85, -3.9, false);
  }

  // FRČADA na zahodni strešini (O6, širina ~4,2 po fasadi)
  {
    const F = NACRT.frcada;
    const z1 = F.sredinaZ - F.sirina / 2;
    const z2 = F.sredinaZ + F.sirina / 2;
    const yTal = NACRT.podstrehaTla;
    const celoVrh = yTal + F.parapet + F.oknoH + 0.22;
    for (const zz of [z1, z2]) {
      boks(mat.fasadaNova, -F.celoX + F.strehaDo, 2.0, 0.1, (F.celoX + F.strehaDo) / 2, celoVrh - 1.0, zz, true);
    }
    stena(mat.fasadaNova, "z", F.celoX, z1, z2, yTal + 0.0, celoVrh, 0.2, [
      { sredina: F.sredinaZ, w: F.oknoW, y0: yTal + F.parapet, y1: yTal + F.parapet + F.oknoH },
    ]);
    dodajOkno("z", F.celoX - 0.08, F.sredinaZ, yTal + F.parapet, "O6", -1);
    const dolz = -F.celoX + F.strehaDo + 0.5;
    const str = boks(mat.prefalz, dolz, 0.09, F.sirina + 0.3, (F.celoX + F.strehaDo) / 2 - 0.1, celoVrh + 0.22, F.sredinaZ);
    str.rotation.z = 0.16;
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

    // stebri HOP 100/100/3 po PZI rastru (cinkani, prašno barvani)
    for (const odmik of NACRT.stopnisce.stebriOdmiki) {
      const sz = z1 + odmik;
      for (const sx of [x1 + 0.07, x2 - 0.07]) {
        trdno(mat.jekloAntracit, sx - 0.05, 0, sz - 0.05, sx + 0.05, S.visinaStolpa, sz + 0.05);
      }
    }
    // prečke na vrhu (okvir strehe)
    boks(mat.jekloAntracit, x2 - x1, 0.1, 0.1, (x1 + x2) / 2, S.visinaStolpa - 0.05, z1 + 0.07);
    boks(mat.jekloAntracit, x2 - x1, 0.1, 0.1, (x1 + x2) / 2, S.visinaStolpa - 0.05, z2 - 0.07);

    // LAMELNA OBLEKA s presledki — vidna konstrukcija skozi (pogledi A/B/C)
    const lamelnaStena = (os: "x" | "z", pri: number, od: number, doo: number, y0: number, y1: number) => {
      const korak = 0.17;
      const sirL = 0.09;
      for (let a = od + korak / 2; a < doo; a += korak) {
        if (os === "z") boks(mat.pohistvoLes, 0.05, y1 - y0, sirL, pri, (y0 + y1) / 2, a, false);
        else boks(mat.pohistvoLes, sirL, y1 - y0, 0.05, a, (y0 + y1) / 2, pri, false);
      }
      // kolizija: tanek pas (skozi lamele se ne hodi)
      if (os === "z") kolizije.push(new THREE.Box3(new THREE.Vector3(pri - 0.04, y0, od), new THREE.Vector3(pri + 0.04, y1, doo)));
      else kolizije.push(new THREE.Box3(new THREE.Vector3(od, y0, pri - 0.04), new THREE.Vector3(doo, y1, pri + 0.04)));
    };
    lamelnaStena("z", x2 - 0.03, z1 + 0.1, z2 - 0.1, 0.25, S.visinaStolpa); // vzhodna stran
    // severna: ob fasadi ostane odprtina za VSTOP v stolp (s severnega tlakovca)
    lamelnaStena("x", z1 + 0.03, x1 + 1.0, x2 - 0.1, 0.25, S.visinaStolpa);
    lamelnaStena("x", z2 - 0.03, x1 + 0.1, x2 - 0.1, 0.25, S.visinaStolpa); // južna

    // streha stolpa (rahlo nagnjena pločevina)
    const strehica = boks(mat.prefalz, S.globinaVZ + 0.5, 0.08, S.dolzinaSJ + 0.4, (x1 + x2) / 2 + 0.05, S.visinaStolpa + 0.16, (z1 + z2) / 2);
    strehica.rotation.z = -0.1;

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

    // podesti pri vratih (1N, podstreha) — severni del, rebrasta pločevina
    for (const py of [NACRT.nadstropjeTla, NACRT.podstrehaTla]) {
      trdno(mat.jekloAntracit, x1, py - 0.05, z1 + 0.06, xNotr + 0.15, py, z1 + 1.6);
      pohodno(x1, z1 + 0.06, xNotr + 0.15, z1 + 1.6, py);
      ograjica(xNotr + 0.15, z1 + 0.06, xNotr + 0.15, z1 + 1.6, py, py);
    }
    // vmesna podesta (jug)
    for (const py of [NACRT.nadstropjeTla / 2, (NACRT.nadstropjeTla + NACRT.podstrehaTla) / 2]) {
      trdno(mat.jekloAntracit, x1, py - 0.05, z2 - 1.21, x2 - 0.12, py, z2 - 0.06);
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
        // nastopna ploskev (rebrasta pločevina) + čelni rob
        boks(mat.jekloAntracit, sx2 - sx1 - 0.12, 0.035, Math.abs(dz) - 0.03, (sx1 + sx2) / 2, yy - 0.018, zz, false);
        boks(mat.kovinaTemna, sx2 - sx1 - 0.12, 0.05, 0.02, (sx1 + sx2) / 2, yy - 0.05, zz + (dz > 0 ? -Math.abs(dz) / 2 + 0.02 : Math.abs(dz) / 2 - 0.02), false);
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

    // luči v stolpu
    for (const ly of [2.4, 5.1, 6.9]) {
      const pl = new THREE.PointLight("#ffe7c4", 4, 7, 1.9);
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
