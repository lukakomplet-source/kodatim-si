import * as THREE from "three";
import type { Materiali } from "./materials";

/**
 * Parmova ulica 4, Vojnik — OBSTOJEČE STANJE.
 *
 * Vse mere so kategorija C (približek, odčitan iz Google Street View, april
 * 2025) — glej docs/vojnik-nacrti/reference/streetview/. Ko bodo v repo dodani
 * PZI/IDZ načrti, se ta modul zamenja z geometrijo kategorije A (dokumentirano).
 *
 * Koordinatni sistem: X+ = vzhod, Z+ = jug, Y+ = gor. Hiša stoji na izhodišču,
 * ulica (Parmova) teče sever–jug zahodno od nje, fasada gleda proti zahodu.
 */

export const MERE = {
  globina: 9.2, // vzhod–zahod
  sirina: 11.4, // sever–jug
  pritlicjeH: 2.8,
  nadstropjeH: 2.7, // 2.8 → 5.5
  pasH: 1.4, // temno rjav lesen pas pod streho: 5.5 → 6.9
  kapVisina: 6.9,
  naklon: (22 * Math.PI) / 180,
  previsKap: 1.15, // previs na kapni strani (V/Z)
  previsCelo: 1.0, // previs na čelni strani (S/J)
  balkonGlobina: 1.35,
  cokelH: 1.15,
};

export type Hisa = {
  skupina: THREE.Group;
  kolizije: THREE.Box3[];
  stekla: THREE.Mesh[]; // ponoči zamenjajo material v "prižgano okno"
  lucke: THREE.PointLight[]; // fasadna svetilka ipd. — prižge lighting.ts
};

function boks(mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, senca = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(x, y, z);
  m.castShadow = senca;
  m.receiveShadow = true;
  return m;
}

type OknoOpts = {
  w: number;
  h: number;
  x: number;
  y: number; // sredina stekla
  z: number;
  rotY?: number; // 0 = gleda proti -X (zahod)
  rolete?: number; // 0..1 — delež okna, ki ga prekriva bela roleta
  zavese?: boolean;
  delilna?: boolean; // vertikalna prečka na sredini
};

export function zgradiHiso(mat: Materiali): Hisa {
  const g = new THREE.Group();
  const kolizije: THREE.Box3[] = [];
  const stekla: THREE.Mesh[] = [];
  const lucke: THREE.PointLight[] = [];
  const M = MERE;
  const polG = M.globina / 2; // 4.6
  const polS = M.sirina / 2; // 5.7

  const dodajOkno = (o: OknoOpts) => {
    const sk = new THREE.Group();
    sk.position.set(o.x, o.y, o.z);
    if (o.rotY) sk.rotation.y = o.rotY;
    // okvir, steklo, notranja "zavesa" ozadje, polica
    // okvir kot 4 letvice — poln kvader bi zakril steklo
    sk.add(boks(mat.okvir, 0.1, 0.08, o.w + 0.16, 0, o.h / 2 + 0.04, 0));
    sk.add(boks(mat.okvir, 0.1, 0.08, o.w + 0.16, 0, -o.h / 2 - 0.04, 0));
    sk.add(boks(mat.okvir, 0.1, o.h + 0.16, 0.08, 0, 0, o.w / 2 + 0.04));
    sk.add(boks(mat.okvir, 0.1, o.h + 0.16, 0.08, 0, 0, -o.w / 2 - 0.04));
    sk.add(boks(mat.notranjost, 0.02, o.h - 0.06, o.w - 0.06, 0.075, 0, 0, false));
    const st = boks(mat.steklo, 0.04, o.h - 0.1, o.w - 0.12, 0.03, 0, 0, false);
    stekla.push(st);
    sk.add(st);
    if (o.delilna) sk.add(boks(mat.okvir, 0.12, o.h - 0.08, 0.08, 0, 0, 0));
    if (o.zavese) sk.add(boks(mat.zavesa, 0.03, o.h - 0.12, o.w - 0.16, 0.06, 0, 0, false));
    if (o.rolete && o.rolete > 0) {
      const rh = o.h * o.rolete;
      sk.add(boks(mat.okvir, 0.05, rh, o.w + 0.02, -0.08, o.h / 2 - rh / 2 + 0.04, 0, false));
    }
    sk.add(boks(mat.polica, 0.24, 0.05, o.w + 0.24, -0.1, -o.h / 2 - 0.05, 0));
    g.add(sk);
  };

  // ================= STENE =================
  // pritličje + nadstropje (omet), cokel, lesen pas
  g.add(boks(mat.omet, M.globina, M.kapVisina - M.pasH, M.sirina, 0, (M.kapVisina - M.pasH) / 2, 0));
  g.add(boks(mat.cokel, M.globina + 0.06, M.cokelH, M.sirina + 0.06, 0, M.cokelH / 2, 0));
  g.add(boks(mat.les, M.globina + 0.08, M.pasH, M.sirina + 0.08, 0, M.kapVisina - M.pasH / 2, 0));
  kolizije.push(new THREE.Box3(new THREE.Vector3(-polG, 0, -polS), new THREE.Vector3(polG, M.kapVisina, polS)));

  // ================= STREHA (dvokapnica, sleme S–J) =================
  const dvig = Math.tan(M.naklon) * (polG + M.previsKap); // od kapi do slemena
  const slemeY = M.kapVisina + Math.tan(M.naklon) * polG;
  const kapY = M.kapVisina - Math.tan(M.naklon) * M.previsKap;
  const dolzinaPoklona = Math.hypot(polG + M.previsKap, dvig) + 0.15;
  const strehaD = M.sirina + 2 * M.previsCelo;
  for (const smer of [-1, 1]) {
    const plosk = boks(mat.streha, dolzinaPoklona, 0.14, strehaD, (smer * (polG + M.previsKap)) / 2, (slemeY + kapY) / 2 + 0.05, 0);
    plosk.rotation.z = -smer * M.naklon;
    g.add(plosk);
  }
  g.add(boks(mat.streha, 0.5, 0.16, strehaD, 0, slemeY + 0.12, 0)); // slemenjak
  // zatrepa (lesena trikotnika S in J)
  const zatrep = new THREE.Shape();
  zatrep.moveTo(-polG, 0);
  zatrep.lineTo(polG, 0);
  zatrep.lineTo(0, Math.tan(M.naklon) * polG);
  zatrep.closePath();
  for (const smer of [-1, 1]) {
    const geo = new THREE.ExtrudeGeometry(zatrep, { depth: 0.14, bevelEnabled: false });
    const mh = new THREE.Mesh(geo, mat.lesGladek);
    mh.position.set(0, M.kapVisina, smer * polS - (smer > 0 ? 0.14 : 0));
    mh.castShadow = true;
    g.add(mh);
  }
  // špirovci pod previsom (V in Z kap)
  for (const smer of [-1, 1]) {
    for (let z = -polS - M.previsCelo + 0.35; z <= polS + M.previsCelo - 0.3; z += 0.85) {
      const sp = boks(mat.lesGladek, M.previsKap + 0.5, 0.12, 0.1, smer * (polG + (M.previsKap + 0.5) / 2 - 0.5), 0, z);
      sp.position.y = M.kapVisina - 0.05 - Math.tan(M.naklon) * (M.previsKap / 2);
      sp.rotation.z = -smer * M.naklon;
      g.add(sp);
    }
  }
  // žleb + odtočni cevi (zahodna kap)
  const zleb = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, strehaD, 10), mat.polica);
  zleb.rotation.x = Math.PI / 2;
  zleb.position.set(-(polG + M.previsKap) - 0.05, kapY - 0.02, 0);
  g.add(zleb);
  for (const zz of [-polS + 0.25, polS - 0.25]) {
    const cev = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, kapY - 0.35, 8), mat.polica);
    cev.position.set(-polG - 0.14, (kapY - 0.35) / 2, zz);
    g.add(cev);
    const koleno = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, M.previsKap, 8), mat.polica);
    koleno.rotation.z = Math.PI / 2 - M.naklon;
    koleno.position.set(-polG - M.previsKap / 2, kapY - 0.22, zz);
    g.add(koleno);
  }
  // dimnik
  g.add(boks(mat.cokel, 0.55, 2.2, 0.55, 0.8, slemeY + 0.4, -2.5));
  g.add(boks(mat.beton, 0.75, 0.12, 0.75, 0.8, slemeY + 1.55, -2.5));

  // ================= BALKON (Z fasada + zavije na J) =================
  const balkonY = 2.72;
  g.add(boks(mat.beton, M.balkonGlobina + 0.1, 0.24, M.sirina + M.balkonGlobina + 0.1, -polG - (M.balkonGlobina + 0.1) / 2, balkonY, (M.balkonGlobina + 0.1) / 2 - 0.05));
  g.add(boks(mat.beton, M.globina + 0.2, 0.24, M.balkonGlobina + 0.1, 0.05, balkonY, polS + (M.balkonGlobina + 0.1) / 2));
  // ograja: stebrički + 4 horizontalne letve, temen les
  const ograjaY = balkonY + 0.12;
  const visOgraje = 1.0;
  const rob = { x: -polG - M.balkonGlobina, zJ: polS + M.balkonGlobina };
  const letve = (od: THREE.Vector3, dol: number, vzdolzZ: boolean) => {
    for (let i = 0; i < 4; i++) {
      const y = ograjaY + 0.25 + i * 0.24;
      g.add(boks(mat.les, vzdolzZ ? 0.06 : dol, i === 3 ? 0.12 : 0.07, vzdolzZ ? dol : 0.06, od.x + (vzdolzZ ? 0 : dol / 2), y, od.z + (vzdolzZ ? dol / 2 : 0)));
    }
    const n = Math.round(dol / 1.6);
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * dol;
      g.add(boks(mat.les, 0.09, visOgraje, 0.09, od.x + (vzdolzZ ? 0 : t), ograjaY + visOgraje / 2, od.z + (vzdolzZ ? t : 0)));
    }
  };
  letve(new THREE.Vector3(rob.x + 0.04, 0, -polS - 0.1), M.sirina + M.balkonGlobina + 0.1, true);
  letve(new THREE.Vector3(rob.x + 0.04, 0, rob.zJ - 0.04), M.globina + M.balkonGlobina + 0.2, false);

  // ================= ZAHODNA (ULIČNA) FASADA =================
  const fasadaX = -polG - 0.08;
  // pritličje, od severa proti jugu: okno, vrata shrambe, vhod, garaža
  dodajOkno({ w: 1.3, h: 1.25, x: fasadaX, y: 1.75, z: -4.2, rolete: 0.45 });
  g.add(boks(mat.vrata, 0.08, 2.1, 1.0, fasadaX, 1.05, -2.5));
  const vhod = boks(mat.vrata, 0.08, 2.15, 1.05, fasadaX, 1.075, -0.05);
  g.add(vhod);
  // steklena polja na vhodnih vratih
  for (let vrsta = 0; vrsta < 3; vrsta++) {
    const stv = boks(mat.steklo, 0.03, 0.28, 0.5, fasadaX - 0.05, 1.65 - vrsta * 0.42, -0.05, false);
    stekla.push(stv);
    g.add(stv);
  }
  g.add(boks(mat.garaza, 0.08, 2.15, 2.6, fasadaX, 1.075, 3.1));
  // kljuke, nabiralnik, hišna številka, predpražnik
  g.add(boks(mat.kovinaTemna, 0.06, 0.03, 0.15, fasadaX - 0.05, 1.05, -2.15));
  g.add(boks(mat.kovinaTemna, 0.06, 0.03, 0.15, fasadaX - 0.05, 1.05, 0.35));
  g.add(boks(mat.okvir, 0.1, 0.35, 0.28, fasadaX - 0.03, 1.45, 0.75));
  const stevilka = boks(new THREE.MeshStandardMaterial({ color: "#b3221e", roughness: 0.5 }), 0.03, 0.22, 0.3, fasadaX - 0.02, 2.45, -1.35);
  g.add(stevilka);
  // fasadna svetilka nad vhodom + nočna lučka
  g.add(boks(mat.okvir, 0.12, 0.18, 0.18, fasadaX - 0.04, 2.55, -0.6));
  const luc = new THREE.PointLight("#ffd9a3", 0, 9, 2);
  luc.position.set(fasadaX - 0.4, 2.5, -0.6);
  g.add(luc);
  lucke.push(luc);
  // nadstropje: okno z roleto (levo/S), panoramska stena (desno/J), klima
  dodajOkno({ w: 1.85, h: 1.45, x: fasadaX, y: 4.35, z: -3.3, rolete: 0.35, delilna: true });
  dodajOkno({ w: 2.95, h: 1.55, x: fasadaX, y: 4.3, z: 1.8, zavese: true, delilna: true });
  g.add(boks(mat.okvir, 0.32, 0.55, 0.85, -polG - 0.2, 3.45, -0.85));

  // ================= OSTALE FASADE (kategorija C — približek) =================
  dodajOkno({ w: 1.4, h: 1.3, x: polG + 0.08, y: 4.3, z: -2.6, rotY: Math.PI });
  dodajOkno({ w: 1.4, h: 1.3, x: polG + 0.08, y: 4.3, z: 2.2, rotY: Math.PI, zavese: true });
  dodajOkno({ w: 1.2, h: 1.2, x: polG + 0.08, y: 1.8, z: -3.0, rotY: Math.PI });
  dodajOkno({ w: 1.0, h: 1.0, x: 1.4, y: 4.3, z: -polS - 0.08, rotY: -Math.PI / 2 });
  dodajOkno({ w: 0.9, h: 0.9, x: -1.6, y: 1.9, z: polS + 0.08, rotY: Math.PI / 2, rolete: 0.3 });

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.receiveShadow = true;
  });
  return { skupina: g, kolizije, stekla, lucke };
}
