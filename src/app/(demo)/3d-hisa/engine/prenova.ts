import * as THREE from "three";
import type { Materiali } from "./materials";
import { NACRT, ODPRTINE, SOBE, VRATA_NOTRANJA, type Etaza } from "./nacrt";

/**
 * Hiša PO PRENOVI — zgrajena iz PZI specifikacije (nacrt.ts): pravi gabarit,
 * etažne višine, frčada na zahodni strešini, jekleno stopnišče z lamelami na
 * vzhodu, notranjost vseh treh etaž (predelne stene, prehodi, osnovna oprema,
 * materiali iz PZI: Prefalz, granitogres, travertin, Abacus).
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

  // ===================== OKNA / VRATA (vizualno) =====================
  const dodajOkno = (os: "x" | "z", pri: number, sredina: number, w: number, y0: number, h: number, vrsta: "okno" | "vrata" | "balkonska") => {
    const sk = new THREE.Group();
    if (os === "z") {
      sk.position.set(pri, y0 + h / 2, sredina);
    } else {
      sk.position.set(sredina, y0 + h / 2, pri);
      sk.rotation.y = Math.PI / 2;
    }
    const el = (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
      b.position.set(x, y, z);
      b.castShadow = false;
      b.receiveShadow = true;
      sk.add(b);
      return b;
    };
    el(mat.okvir, 0.34, 0.07, w + 0.1, 0, h / 2 + 0.03, 0);
    el(mat.okvir, 0.34, 0.07, w + 0.1, 0, -h / 2 - 0.03, 0);
    el(mat.okvir, 0.34, h + 0.12, 0.07, 0, 0, w / 2 + 0.03);
    el(mat.okvir, 0.34, h + 0.12, 0.07, 0, 0, -w / 2 - 0.03);
    if (vrsta === "vrata") {
      const krilo = el(mat.pohistvoLes, 0.05, h - 0.04, w * 0.55, 0, 0, 0);
      krilo.position.z = -w * 0.2;
      krilo.rotation.y = 0.5;
      const st = el(mat.steklo, 0.03, h - 0.2, w * 0.38, 0.02, 0, w * 0.28);
      stekla.push(st);
    } else {
      const st = el(mat.steklo, 0.03, h - 0.08, w - 0.1, 0, 0, 0);
      stekla.push(st);
      if (w > 1.1) el(mat.okvir, 0.3, h - 0.08, 0.06, 0, 0, 0);
      if (w > 2.4) {
        el(mat.okvir, 0.3, h - 0.08, 0.06, 0, 0, w / 4);
        el(mat.okvir, 0.3, h - 0.08, 0.06, 0, 0, -w / 4);
      }
    }
    g.add(sk);
  };

  // ===================== ZUNANJE STENE PO ETAŽAH =====================
  const fasade: { stran: "W" | "E" | "N" | "S"; os: "x" | "z"; pri: number; od: number; doo: number }[] = [
    { stran: "W", os: "z", pri: -polG + DEB / 2, od: -polS, doo: polS },
    { stran: "E", os: "z", pri: polG - DEB / 2, od: -polS, doo: polS },
    { stran: "N", os: "x", pri: -polS + DEB / 2, od: -polG + DEB, doo: polG - DEB },
    { stran: "S", os: "x", pri: polS - DEB / 2, od: -polG + DEB, doo: polG - DEB },
  ];
  (Object.keys(ETAZE) as Etaza[]).forEach((etaza) => {
    const E = ETAZE[etaza];
    const vrhStene = etaza === "podstreha" ? NACRT.podstrehaTla + NACRT.kolencna : E.strop + NACRT.ploscaD;
    for (const f of fasade) {
      if (etaza === "podstreha" && (f.stran === "N" || f.stran === "S")) continue; // zatrepa posebej
      const odprtine = ODPRTINE.filter((o) => o.stran === f.stran && o.etaza === etaza);
      const luknje: Luknja[] = odprtine.map((o) => ({ sredina: o.sredina, w: o.w, y0: E.tla + o.parapet, y1: E.tla + o.parapet + o.h }));
      stena(mat.fasadaNova, f.os, f.pri, f.od, f.doo, E.tla, vrhStene, DEB, luknje);
      for (const o of odprtine) dodajOkno(f.os, f.pri + (f.stran === "W" ? -0.06 : f.stran === "E" ? 0.06 : 0), o.sredina, o.w, E.tla + o.parapet, o.h, o.vrsta);
    }
  });

  // zatrepa (S + J): pravokotni del do kolenčne že stoji (kot del podstrehe? ne — dodaj)
  for (const smer of [-1, 1]) {
    const priZ = smer * (polS - DEB / 2);
    const odprtine = ODPRTINE.filter((o) => o.stran === (smer < 0 ? "N" : "S") && o.etaza === "podstreha");
    const luknje: Luknja[] = odprtine.map((o) => ({ sredina: o.sredina, w: o.w, y0: NACRT.podstrehaTla + o.parapet, y1: NACRT.podstrehaTla + o.parapet + o.h }));
    stena(mat.fasadaNova, "x", priZ, -polG + DEB, polG - DEB, NACRT.podstrehaTla, NACRT.podstrehaTla + NACRT.kolencna, DEB, luknje.filter((l) => l.y1 <= NACRT.podstrehaTla + NACRT.kolencna + 0.01));
    for (const o of odprtine) dodajOkno("x", priZ + smer * 0.06, o.sredina, o.w, NACRT.podstrehaTla + o.parapet, o.h, o.vrsta);
    // trikotni zatrep z luknjami za višja okna (O1, O5) — poenostavljeno: polna plošča + izrezi ne; okna sedijo pod kolenčno+
    const zatrep = new THREE.Shape();
    zatrep.moveTo(-polG, 0);
    zatrep.lineTo(polG, 0);
    zatrep.lineTo(0, NACRT.slemeY - NACRT.podstrehaTla - NACRT.kolencna);
    zatrep.closePath();
    const geo = new THREE.ExtrudeGeometry(zatrep, { depth: DEB, bevelEnabled: false });
    const mh = new THREE.Mesh(geo, mat.fasadaNova);
    mh.position.set(0, NACRT.podstrehaTla + NACRT.kolencna, priZ - DEB / 2 + (smer > 0 ? 0 : 0));
    mh.castShadow = true;
    mh.receiveShadow = true;
    g.add(mh);
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
    // vrhnja obloga
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
    { etaza: "pritlicje", os: "z", pri: 1.9, od: notrZ1, doo: 1.3 },
    { etaza: "pritlicje", os: "x", pri: 1.3, od: 1.0, doo: notrX2 },
    { etaza: "pritlicje", os: "z", pri: 1.0, od: 1.3, doo: 4.4 },
    { etaza: "pritlicje", os: "x", pri: 4.4, od: 1.0, doo: notrX2 },
    { etaza: "pritlicje", os: "x", pri: -2.9, od: -1.3, doo: 1.9 },
    { etaza: "pritlicje", os: "z", pri: -1.3, od: notrZ1, doo: -0.9 },
    { etaza: "pritlicje", os: "x", pri: -0.9, od: notrX1, doo: 1.9 },
    { etaza: "pritlicje", os: "x", pri: -2.5, od: 1.9, doo: notrX2 },
    { etaza: "pritlicje", os: "x", pri: -0.6, od: 1.9, doo: notrX2 },
    { etaza: "nadstropje", os: "x", pri: -2.4, od: -0.4, doo: notrX2 },
    { etaza: "nadstropje", os: "z", pri: 0.8, od: notrZ1, doo: -2.4 },
    { etaza: "nadstropje", os: "z", pri: 1.4, od: -2.4, doo: -0.6 },
    { etaza: "nadstropje", os: "z", pri: 2.6, od: -2.4, doo: -0.6 },
    { etaza: "nadstropje", os: "x", pri: -0.6, od: 1.4, doo: notrX2 },
    { etaza: "nadstropje", os: "z", pri: -0.4, od: -2.4, doo: 0.6 },
    { etaza: "nadstropje", os: "x", pri: 0.6, od: -0.4, doo: 1.4 },
    { etaza: "podstreha", os: "x", pri: -2.2, od: 1.4, doo: notrX2 },
    { etaza: "podstreha", os: "z", pri: 1.4, od: notrZ1, doo: -1.9 },
    { etaza: "podstreha", os: "x", pri: -1.9, od: notrX1, doo: 1.4 },
    { etaza: "podstreha", os: "z", pri: 2.4, od: -2.2, doo: -0.6 },
    { etaza: "podstreha", os: "x", pri: -0.6, od: 2.4, doo: notrX2 },
    { etaza: "podstreha", os: "z", pri: 1.0, od: -0.6, doo: notrZ2 },
  ];
  for (const p of predelne) {
    const E = ETAZE[p.etaza];
    const vrata = VRATA_NOTRANJA.filter(
      (v) => v.etaza === p.etaza && (p.os === "z" ? Math.abs(v.x - p.pri) < 0.35 && v.z > p.od - 0.1 && v.z < p.doo + 0.1 : Math.abs(v.z - p.pri) < 0.35 && v.x > p.od - 0.1 && v.x < p.doo + 0.1)
    );
    const luknje: Luknja[] = vrata.map((v) => ({ sredina: p.os === "z" ? v.z : v.x, w: v.sirina + 0.08, y0: E.tla, y1: E.tla + 2.1 }));
    stena(mat.mavcna, p.os, p.pri, p.od, p.doo, E.tla, E.strop, DEBp, luknje);
    for (const v of vrata) {
      const sk = new THREE.Group();
      const krilo = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.06, v.sirina), mat.pohistvoLes);
      krilo.position.set(v.sirina / 2 - 0.02, 0, v.sirina / 2 - 0.02);
      const nosilec = new THREE.Group();
      nosilec.add(krilo);
      nosilec.rotation.y = 1.15;
      sk.add(nosilec);
      sk.position.set(v.x + (p.os === "z" ? 0 : -v.sirina / 2), E.tla + 1.03, v.z + (p.os === "z" ? -v.sirina / 2 : 0));
      if (p.os === "x") sk.rotation.y = Math.PI / 2;
      g.add(sk);
    }
  }

  // kopalniške obloge (PZI keramika) — pas 1.5 m po obodu kopalnic + tla
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
      // sanitarije
      trdno(mat.keramikaBela, s.x2 - 0.75, E.tla, (s.z1 + s.z2) / 2 - 0.3, s.x2 - 0.15, E.tla + 0.42, (s.z1 + s.z2) / 2 + 0.3); // WC blok
      trdno(mat.keramikaBela, s.x1 + 0.15, E.tla + 0.75, s.z2 - 0.85, s.x1 + 0.65, E.tla + 0.92, s.z2 - 0.25); // umivalnik
      trdno(mat.steklo, s.x1 + 0.12, E.tla, s.z1 + 0.15, s.x1 + 1.02, E.tla + 1.95, s.z1 + 0.21); // tuš steklo
    }
  }

  // ===================== OSNOVNA OPREMA (C) =====================
  const postelja = (x: number, z: number, w = 1.6) => {
    const E = 0;
    void E;
    return { x, z, w };
  };
  void postelja;
  const oprema: { etaza: Etaza; tip: "postelja" | "kavc" | "miza" | "omara" | "kuhinja"; x: number; z: number; rot?: number }[] = [
    { etaza: "pritlicje", tip: "postelja", x: -3.3, z: -3.4 },
    { etaza: "pritlicje", tip: "omara", x: -0.2, z: -4.6 },
    { etaza: "pritlicje", tip: "kavc", x: -3.4, z: 2.2, rot: Math.PI / 2 },
    { etaza: "pritlicje", tip: "miza", x: -1.2, z: 2.6 },
    { etaza: "pritlicje", tip: "kuhinja", x: 3.9, z: 0.3, rot: 0 },
    { etaza: "pritlicje", tip: "postelja", x: 3.0, z: 3.2 },
    { etaza: "nadstropje", tip: "postelja", x: 2.6, z: -4.0 },
    { etaza: "nadstropje", tip: "postelja", x: 2.9, z: 2.0 },
    { etaza: "nadstropje", tip: "kavc", x: -3.5, z: 0.6, rot: Math.PI / 2 },
    { etaza: "nadstropje", tip: "miza", x: -1.6, z: 2.4 },
    { etaza: "nadstropje", tip: "kuhinja", x: -1.0, z: -4.4, rot: Math.PI },
    { etaza: "podstreha", tip: "postelja", x: -2.6, z: -3.6 },
    { etaza: "podstreha", tip: "postelja", x: 2.8, z: 2.4 },
    { etaza: "podstreha", tip: "kavc", x: -2.6, z: 1.4, rot: Math.PI / 2 },
    { etaza: "podstreha", tip: "kuhinja", x: -3.9, z: 0.4, rot: Math.PI },
    { etaza: "podstreha", tip: "miza", x: -1.2, z: 0.8 },
  ];
  for (const o of oprema) {
    const y = ETAZE[o.etaza].tla;
    if (o.tip === "postelja") {
      trdno(mat.pohistvoLes, o.x - 0.85, y, o.z - 1.05, o.x + 0.85, y + 0.25, o.z + 1.05);
      boks(mat.tekstil, 1.6, 0.22, 2.0, o.x, y + 0.36, o.z);
      boks(mat.keramikaBela, 1.5, 0.1, 0.5, o.x, y + 0.52, o.z - 0.7, false);
    } else if (o.tip === "omara") {
      trdno(mat.pohistvoLes, o.x - 1.0, y, o.z - 0.3, o.x + 1.0, y + 2.2, o.z + 0.3);
    } else if (o.tip === "kavc") {
      const rot = o.rot ?? 0;
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
      const rot = o.rot ?? 0;
      const gsk = new THREE.Group();
      const spodnji = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.9, 0.62), mat.pohistvoTemno);
      spodnji.position.y = 0.45;
      const pult = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.04, 0.65), mat.granitogres);
      pult.position.y = 0.92;
      const zgornji = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.7, 0.36), mat.pohistvoLes);
      zgornji.position.set(0, 1.85, -0.13);
      gsk.add(spodnji, pult, zgornji);
      gsk.position.set(o.x, y, o.z);
      gsk.rotation.y = rot;
      gsk.traverse((q) => { if (q instanceof THREE.Mesh) { q.castShadow = true; q.receiveShadow = true; } });
      g.add(gsk);
      kolizije.push(new THREE.Box3(new THREE.Vector3(o.x - 1.55, y, o.z - 0.7), new THREE.Vector3(o.x + 1.55, y + 2.3, o.z + 0.7)));
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
  // dimnik (kurilnica SV)
  boks(mat.fasadaNova, 0.5, NACRT.slemeY + 0.9 - kapY, 0.5, 3.4, (NACRT.slemeY + 0.9 + kapY) / 2, -3.9);
  boks(mat.jekloAntracit, 0.6, 0.1, 0.6, 3.4, NACRT.slemeY + 0.95, -3.9, false);

  // FRČADA na zahodni strešini
  {
    const F = NACRT.frcada;
    const z1 = F.sredinaZ - F.sirina / 2;
    const z2 = F.sredinaZ + F.sirina / 2;
    const yTal = NACRT.podstrehaTla;
    const celoVrh = yTal + F.parapet + F.oknoH + 0.22;
    // stranski steni (od strešine do čela)
    for (const zz of [z1, z2]) {
      const oblika = new THREE.Shape();
      oblika.moveTo(F.celoX, 0);
      oblika.lineTo(-1.0, 0);
      oblika.lineTo(-1.0, 0.01);
      oblika.lineTo(F.celoX, celoVrh - (NACRT.slemeY - Math.tan(NAKLON) * 1.0) + 2.0);
      oblika.closePath();
      void oblika;
      boks(mat.fasadaNova, -F.celoX + F.strehaDo, 2.0, 0.1, (F.celoX + F.strehaDo) / 2, celoVrh - 1.0, zz, true);
    }
    // čelna stena s parapetom in oknom O6
    stena(mat.fasadaNova, "z", F.celoX, z1, z2, yTal + 0.0, celoVrh, 0.2, [
      { sredina: F.sredinaZ, w: F.oknoW, y0: yTal + F.parapet, y1: yTal + F.parapet + F.oknoH },
    ]);
    dodajOkno("z", F.celoX - 0.08, F.sredinaZ, F.oknoW, yTal + F.parapet, F.oknoH, "okno");
    // enokapna strehica frčade
    const dolz = -F.celoX + F.strehaDo + 0.5;
    const str = boks(mat.prefalz, dolz, 0.09, F.sirina + 0.3, (F.celoX + F.strehaDo) / 2 - 0.1, celoVrh + 0.22, F.sredinaZ);
    str.rotation.z = 0.16;
  }

  // ===================== BALKONI =====================
  // zahodni balkon 1. nadstropja čez fasado (ostane, nova lamelna ograja)
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
  // južna balkončka (1. nadstropje + podstreha)
  for (const [y, x1, x2] of [[NACRT.balkonY, -1.6, 0.6], [NACRT.podstrehaTla, -0.9, 1.5]] as const) {
    trdno(mat.beton, x1, y - 0.2, polS, x2, y + 0.02, polS + 0.95);
    pohodno(x1, polS, x2, polS + 0.95, y + 0.02);
    ograjaLam(x1, polS + 0.89, x2, polS + 0.95, y + 0.02);
    ograjaLam(x1, polS, x1 + 0.06, polS + 0.95, y + 0.02);
    ograjaLam(x2 - 0.06, polS, x2, polS + 0.95, y + 0.02);
  }

  // ===================== ZUNANJE STOPNIŠČE (vzhod) =====================
  {
    const S = NACRT.stopnisce;
    const z1 = -polS + S.odSevernegaRoba; // -2.355
    const z2 = z1 + S.dolzinaSJ; // +2.695
    const x1 = polG; // ob fasadi
    const x2 = polG + S.globinaVZ; // 7.53
    const xNotr = x1 + S.podestSirina; // notranji pas (podesti ob fasadi)
    const stebriZ = [z1 + 0.08, (z1 + z2) / 2, z2 - 0.08];
    for (const sz of stebriZ) {
      for (const sx of [x1 + 0.08, x2 - 0.08]) {
        trdno(mat.jekloAntracit, sx - 0.05, 0, sz - 0.05, sx + 0.05, S.visinaStolpa, sz + 0.05);
      }
    }
    // lamelna fasada stolpa (V, S, J) — nad pritličjem, spodaj odprto do vhoda
    const lam = (sx1: number, sz1: number, sx2: number, sz2: number, y0: number, y1: number) => {
      boks(mat.lamele, Math.max(sx2 - sx1, 0.06), y1 - y0, Math.max(sz2 - sz1, 0.06), (sx1 + sx2) / 2, (y0 + y1) / 2, (sz1 + sz2) / 2);
      kolizije.push(new THREE.Box3(new THREE.Vector3(sx1, y0, sz1), new THREE.Vector3(sx2, y1, sz2)));
    };
    lam(x2 - 0.06, z1, x2, z2, 0.9, S.visinaStolpa); // vzhodna stran
    lam(x1, z1, x2, z1 + 0.06, 0.0, S.visinaStolpa); // severna
    lam(x1, z2 - 0.06, x2, z2, 0.0, S.visinaStolpa); // južna
    // streha stolpa
    const strehica = boks(mat.prefalz, S.globinaVZ + 0.5, 0.08, S.dolzinaSJ + 0.4, (x1 + x2) / 2 + 0.05, S.visinaStolpa + 0.16, (z1 + z2) / 2);
    strehica.rotation.z = -0.1;
    // podesti pri vratih (1. nadstropje, podstreha) — v notranjem pasu, severni del
    for (const py of [NACRT.nadstropjeTla, NACRT.podstrehaTla]) {
      trdno(mat.jekloAntracit, x1, py - 0.06, z1 + 0.06, xNotr + 0.15, py, z1 + 1.6);
      pohodno(x1, z1 + 0.06, xNotr + 0.15, z1 + 1.6, py);
    }
    // vmesna podesta (jug, med rampami)
    for (const py of [NACRT.nadstropjeTla / 2, (NACRT.nadstropjeTla + NACRT.podstrehaTla) / 2]) {
      trdno(mat.jekloAntracit, x1, py - 0.06, z2 - 1.21, x2 - 0.12, py, z2 - 0.06);
      pohodno(x1, z2 - 1.21, x2 - 0.12, z2 - 0.06, py);
    }
    // rampe: (pas, odZ, doZ, y0, y1)
    const rampa = (sx1: number, sx2: number, zOd: number, zDo: number, y0: number, y1: number) => {
      const st = 8;
      const dz = (zDo - zOd) / st;
      const dy = (y1 - y0) / st;
      for (let i = 0; i < st; i++) {
        const zz = zOd + dz * (i + 0.5);
        const yy = y0 + dy * (i + 1);
        const stopnica = boks(mat.jekloAntracit, sx2 - sx1 - 0.1, 0.05, Math.abs(dz), (sx1 + sx2) / 2, yy - 0.025, zz);
        stopnica.castShadow = false;
        tla.push(new THREE.Box3(new THREE.Vector3(sx1, yy - 0.2, zz - Math.abs(dz) / 2), new THREE.Vector3(sx2, yy, zz + Math.abs(dz) / 2)));
      }
    };
    const zRampOd = z1 + 1.6; // pod vrati podesta
    const zRampDo = z2 - 1.21;
    rampa(xNotr + 0.15, x2 - 0.12, zRampOd, zRampDo, 0, NACRT.nadstropjeTla / 2); // gor proti J na vmesni podest
    rampa(x1, xNotr + 0.15, zRampDo, zRampOd, NACRT.nadstropjeTla / 2, NACRT.nadstropjeTla); // nazaj proti S na podest 1N
    rampa(xNotr + 0.15, x2 - 0.12, zRampOd, zRampDo, NACRT.nadstropjeTla, (NACRT.nadstropjeTla + NACRT.podstrehaTla) / 2);
    rampa(x1, xNotr + 0.15, zRampDo, zRampOd, (NACRT.nadstropjeTla + NACRT.podstrehaTla) / 2, NACRT.podstrehaTla);
    // luči v stolpu (lamele zaprejo dnevno svetlobo)
    for (const ly of [2.4, 5.1, 6.9]) {
      const pl = new THREE.PointLight("#ffe7c4", 4, 7, 1.9);
      pl.position.set((x1 + x2) / 2, ly, (z1 + z2) / 2);
      g.add(pl);
    }
    // ograja ob notranjem robu ramp (pločevina 40/4 — poenostavljeno)
    boks(mat.jekloAntracit, 0.03, 1.0, zRampDo - zRampOd, xNotr + 0.15, NACRT.nadstropjeTla / 2 + 0.5, (zRampOd + zRampDo) / 2, false);
  }

  // stropne luči po etažah (brez senc — notranjost bi bila sicer temna)
  const stropnice: { etaza: Etaza; x: number; z: number }[] = [
    { etaza: "pritlicje", x: -2.4, z: 2.4 }, { etaza: "pritlicje", x: -2.6, z: -2.6 },
    { etaza: "pritlicje", x: 2.9, z: 0.2 }, { etaza: "pritlicje", x: 2.9, z: 3.2 },
    { etaza: "nadstropje", x: -2.4, z: 1.8 }, { etaza: "nadstropje", x: -1.6, z: -3.4 },
    { etaza: "nadstropje", x: 2.7, z: -3.6 }, { etaza: "nadstropje", x: 2.8, z: 2.0 },
    { etaza: "podstreha", x: -1.8, z: 0.6 }, { etaza: "podstreha", x: -1.8, z: -3.4 },
    { etaza: "podstreha", x: 2.6, z: 1.8 }, { etaza: "podstreha", x: 2.7, z: -3.4 },
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
    const pl = new THREE.PointLight("#fff1d8", 5.5, 8.5, 1.9);
    pl.position.set(l.x, y - 0.12, l.z);
    g.add(pl);
  }

  // fasadna svetilka ob vhodu ZV1 (sever)
  boks(mat.okvir, 0.14, 0.2, 0.14, 0.95, 2.4, -polS - 0.12, false);
  const luc = new THREE.PointLight("#ffd9a3", 0, 9, 2);
  luc.position.set(0.95, 2.35, -polS - 0.45);
  g.add(luc);
  lucke.push(luc);

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.receiveShadow = true;
  });
  return { skupina: g, kolizije, tla, stekla, lucke };
}
