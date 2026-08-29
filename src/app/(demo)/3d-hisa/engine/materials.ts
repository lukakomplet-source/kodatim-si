import * as THREE from "three";

/**
 * Vsi materiali so proceduralni (canvas teksture) — nič se ne prenaša s spleta,
 * vse je lokalno v kodi. Barve so pobrane iz Street View posnetkov obstoječe
 * hiše (docs/vojnik-nacrti/reference/streetview/), zato je "obstoječe stanje"
 * barvno zvest približek, ne generična hiša.
 */

type Risba = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function tekstura(w: number, h: number, risba: Risba, barvna = true): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  risba(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (barvna) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Rahel šum čez osnovno barvo — omet, asfalt, beton. */
function sum(ctx: CanvasRenderingContext2D, w: number, h: number, osnova: string, moc: number, zrn = 1600) {
  ctx.fillStyle = osnova;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < zrn; i++) {
    const g = Math.random() * moc;
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${g})` : `rgba(0,0,0,${g})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

/** worldW/worldH v metrih — koliko sveta pokrije ena ponovitev teksture. */
function ponovi(t: THREE.Texture, geoW: number, geoH: number, worldW: number, worldH: number) {
  const kopija = t.clone();
  kopija.needsUpdate = true;
  kopija.repeat.set(geoW / worldW, geoH / worldH);
  return kopija;
}

/**
 * RELIEF IZ BARVNE TEKSTURE.
 *
 * Materiali so bili ravni: omet, deske in tlakovci so imeli risbo, ne pa
 * površine. Ravna ploskev se pod soncem obnaša kot papir — svetloba pade nanjo
 * enakomerno in noben rob ne vrže drobne sence, zato je fasada videti kot
 * naslikana. Zrnavost ometa je v naravi visoka desetinko milimetra in prav ta
 * desetinka naredi razliko med "beli zid" in "omet".
 *
 * Višino beremo iz svetlosti barvne teksture (svetlo = izbočeno) in iz nje s
 * Sobelovim operatorjem izračunamo normale. To ni fizikalno pravilno — fuga med
 * tlakovci je temna IN vbočena, špranja med deskami tudi, kar tu slučajno drži
 * — je pa dovolj: relief mora biti pravilen na robovih, ne v absolutni višini.
 *
 * Ponovitev in ovijanje se prepišeta z izvirne teksture, sicer bi se relief
 * ponavljal v drugem merilu kot barva in bi se videl kot vzorec čez vzorec.
 */
function reliefIz(t: THREE.CanvasTexture, moc = 1): THREE.CanvasTexture {
  const vir = t.image as HTMLCanvasElement;
  const w = vir.width;
  const h = vir.height;
  const piksli = vir.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  // Svetlost s teksturo ovito naokoli — brez ovijanja bi bil na robu ploščice šiv.
  const visina = (x: number, y: number) => {
    const i = (((y + h) % h) * w + ((x + w) % w)) * 4;
    return (piksli[i] * 0.299 + piksli[i + 1] * 0.587 + piksli[i + 2] * 0.114) / 255;
  };
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const izhod = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx =
        visina(x - 1, y - 1) + 2 * visina(x - 1, y) + visina(x - 1, y + 1) -
        (visina(x + 1, y - 1) + 2 * visina(x + 1, y) + visina(x + 1, y + 1));
      const dy =
        visina(x - 1, y - 1) + 2 * visina(x, y - 1) + visina(x + 1, y - 1) -
        (visina(x - 1, y + 1) + 2 * visina(x, y + 1) + visina(x + 1, y + 1));
      const nx = dx * moc;
      const ny = dy * moc;
      const dolzina = Math.sqrt(nx * nx + ny * ny + 1);
      const i = (y * w + x) * 4;
      izhod.data[i] = ((nx / dolzina) * 0.5 + 0.5) * 255;
      izhod.data[i + 1] = ((ny / dolzina) * 0.5 + 0.5) * 255;
      izhod.data[i + 2] = (1 / dolzina) * 255;
      izhod.data[i + 3] = 255;
    }
  }
  ctx.putImageData(izhod, 0, 0);
  const normala = new THREE.CanvasTexture(c);
  normala.wrapS = t.wrapS;
  normala.wrapT = t.wrapT;
  normala.repeat.copy(t.repeat);
  normala.offset.copy(t.offset);
  normala.anisotropy = 4;
  // Normale NISO barva: sRGB pretvorba bi jih zavila in površina bi se svetila
  // v napačno smer.
  normala.colorSpace = THREE.NoColorSpace;
  return normala;
}

/** Kako močno naj se relief pozna. Ločeno, da so vrednosti na enem mestu. */
const RELIEF = (moc: number) => new THREE.Vector2(moc, moc);

export type Materiali = ReturnType<typeof ustvariMateriale>;

export function ustvariMateriale() {
  // --- teksture ---
  const ometT = tekstura(256, 256, (ctx, w, h) => sum(ctx, w, h, "#f2efe7", 0.045, 2400));

  const lesT = tekstura(256, 256, (ctx, w, h) => {
    // navpične deske, temno rjave — pas pod streho in zatrepi
    ctx.fillStyle = "#5d3c26";
    ctx.fillRect(0, 0, w, h);
    const deska = 22;
    for (let x = 0; x < w; x += deska) {
      const ton = 0.85 + Math.random() * 0.3;
      ctx.fillStyle = `rgb(${Math.round(93 * ton)},${Math.round(60 * ton)},${Math.round(38 * ton)})`;
      ctx.fillRect(x + 1, 0, deska - 2, h);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(x, 0, 1.5, h);
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = `rgba(30,18,10,${0.08 + Math.random() * 0.1})`;
        ctx.fillRect(x + 2 + Math.random() * (deska - 5), Math.random() * h, 1.5, 8 + Math.random() * 30);
      }
    }
  });

  const strehaT = tekstura(256, 256, (ctx, w, h) => {
    // siva valovitka (vlaknocementna kritina) — rebra tečejo po naklonu
    ctx.fillStyle = "#84887f";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      const grad = ctx.createLinearGradient(0, y, 0, y + 16);
      grad.addColorStop(0, "rgba(255,255,255,0.16)");
      grad.addColorStop(0.5, "rgba(0,0,0,0.18)");
      grad.addColorStop(1, "rgba(255,255,255,0.16)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, w, 16);
    }
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(60,70,55,${Math.random() * 0.15})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2 + Math.random() * 4);
    }
  });

  const opekaStrehaT = tekstura(256, 256, (ctx, w, h) => {
    // opečni zareznik — vrste s senco (sosedje, cerkev)
    ctx.fillStyle = "#9e4f35";
    ctx.fillRect(0, 0, w, h);
    const vrsta = 32;
    for (let y = 0; y < h; y += vrsta) {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(0, y, w, 4);
      for (let x = 0; x < w; x += 21) {
        const ton = 0.85 + Math.random() * 0.3;
        ctx.fillStyle = `rgba(${Math.round(158 * ton)},${Math.round(79 * ton)},${Math.round(53 * ton)},0.9)`;
        ctx.fillRect(x + 1, y + 4, 19, vrsta - 5);
      }
    }
  });

  const tlakovciT = tekstura(512, 512, (ctx, w, h) => {
    // sivi betonski tlakovci v "I" vzorcu, kot na dovozu
    ctx.fillStyle = "#b9b9b4";
    ctx.fillRect(0, 0, w, h);
    const kx = 64, ky = 32;
    for (let y = 0; y < h; y += ky) {
      const zamik = (y / ky) % 2 === 0 ? 0 : kx / 2;
      for (let x = -kx; x < w + kx; x += kx) {
        const ton = 0.88 + Math.random() * 0.24;
        ctx.fillStyle = `rgb(${Math.round(185 * ton)},${Math.round(185 * ton)},${Math.round(180 * ton)})`;
        ctx.fillRect(x + zamik + 2, y + 2, kx - 4, ky - 4);
        ctx.strokeStyle = "rgba(70,70,65,0.65)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + zamik + 1, y + 1, kx - 2, ky - 2);
      }
    }
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(90,100,70,${Math.random() * 0.12})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });

  const asfaltT = tekstura(256, 256, (ctx, w, h) => sum(ctx, w, h, "#5b5d5e", 0.09, 3200));

  const travaT = tekstura(256, 256, (ctx, w, h) => {
    sum(ctx, w, h, "#5a713c", 0.1, 2000);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? "rgba(120,150,70,0.35)" : "rgba(55,80,35,0.35)";
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 3 + Math.random() * 3);
    }
  });

  const mejaT = tekstura(256, 256, (ctx, w, h) => {
    sum(ctx, w, h, "#3f6428", 0.12, 1500);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = Math.random() > 0.4 ? "rgba(110,160,60,0.5)" : "rgba(25,45,15,0.5)";
      const r = 1.5 + Math.random() * 3;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const vrataT = tekstura(128, 256, (ctx, w, h) => {
    ctx.fillStyle = "#4d2c1a";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 10) {
      ctx.fillStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.12})`;
      ctx.fillRect(0, y, w, 2);
    }
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, w - 20, h - 20);
  });

  const garazaT = tekstura(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#53301d";
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 22) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x, 0, 2, h);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(x + 2, 0, 3, h);
    }
  });

  // okna blokov — mreža oken; dnevna in nočna (prižgana) verzija
  const blokT = (noc: boolean) =>
    tekstura(256, 512, (ctx, w, h) => {
      sum(ctx, w, h, "#e8e4dc", 0.03, 600);
      const ox = 52, oy = 64;
      for (let y = 20; y < h - 40; y += oy) {
        for (let x = 14; x < w - 30; x += ox) {
          ctx.fillStyle = noc && Math.random() > 0.55 ? "#ffd28a" : "#31404d";
          ctx.fillRect(x, y, 30, 38);
          ctx.strokeStyle = "#b0aca2";
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, 30, 38);
        }
      }
    });

  ometT.repeat.set(4, 3);
  lesT.repeat.set(7, 1);
  strehaT.repeat.set(2, 7);

  // --- teksture PO PRENOVI (materiali iz PZI) ---
  const prefalzT = tekstura(256, 256, (ctx, w, h) => {
    // Prefa-Prefalz: stoječi zgib, antracit
    ctx.fillStyle = "#3d4145";
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 43) {
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(x, 0, 2, h);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x + 3, 0, 2, h);
    }
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 6);
    }
  });
  prefalzT.repeat.set(3, 3);

  const travertinT = tekstura(256, 256, (ctx, w, h) => {
    // Unique Travertine by Provenza — bež kamen, vodoravne žile
    sum(ctx, w, h, "#cfc4b2", 0.05, 1200);
    for (let y = 0; y < h; y += 6 + Math.random() * 10) {
      ctx.fillStyle = `rgba(150,130,105,${0.10 + Math.random() * 0.12})`;
      ctx.fillRect(0, y, w, 1.5 + Math.random() * 2);
    }
    ctx.strokeStyle = "rgba(90,80,65,0.30)";
    ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += 128) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 128) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  });
  travertinT.repeat.set(2, 2);

  const abacusT = (osnova: string, svetlo: number) =>
    tekstura(256, 256, (ctx, w, h) => {
      // Abacus by Ergon "brick" — navpične lamelne ploščice
      ctx.fillStyle = osnova;
      ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 13) {
        ctx.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * svetlo})`;
        ctx.fillRect(x + 1, 0, 11, h);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(x, 0, 1.5, h);
      }
    });

  const granitogresT = tekstura(256, 256, (ctx, w, h) => {
    // granitogres 60×60, svetlo siv
    sum(ctx, w, h, "#c9c7c2", 0.04, 900);
    ctx.strokeStyle = "rgba(100,100,98,0.5)";
    ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += 128) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 128) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  });
  granitogresT.repeat.set(2, 2);

  const rebrastaT = tekstura(128, 128, (ctx, w, h) => {
    // cinkana rebrasta (solza) pločevina — nastopne ploskve in podesti stopnišča
    sum(ctx, w, h, "#9aa0a4", 0.06, 700);
    for (let y = 8; y < h; y += 24) {
      for (let x = 8; x < w; x += 24) {
        const zam = ((y / 24) % 2) * 12;
        ctx.save();
        ctx.translate(x + zam, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fillRect(-4, -1.5, 8, 3);
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(-4, 1.5, 8, 1.5);
        ctx.restore();
      }
    }
  });
  rebrastaT.repeat.set(2, 2);

  const lameleT = tekstura(256, 256, (ctx, w, h) => {
    // navpične lesene lamele (stopniščni stolp, fasadni pasovi)
    ctx.fillStyle = "#171512";
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      const ton = 0.82 + Math.random() * 0.34;
      ctx.fillStyle = `rgb(${Math.round(146 * ton)},${Math.round(112 * ton)},${Math.round(74 * ton)})`;
      ctx.fillRect(x + 2, 0, 9, h);
    }
  });
  lameleT.repeat.set(4, 1);

  const nastani = <T extends THREE.MeshStandardMaterialParameters>(p: T) => new THREE.MeshStandardMaterial(p);

  return {
    // hiša Parmova 4
    omet: nastani({ map: ometT, roughness: 0.95, normalMap: reliefIz(ometT, 2.2), normalScale: RELIEF(0.6) }),
    cokel: nastani({ color: "#7d4032", roughness: 0.9 }),
    les: nastani({ map: lesT, roughness: 0.85, normalMap: reliefIz(lesT, 3.5), normalScale: RELIEF(1.0) }),
    lesGladek: nastani({ color: "#5a3a26", roughness: 0.85 }),
    streha: nastani({ map: strehaT, roughness: 0.75, metalness: 0.05, normalMap: reliefIz(strehaT, 2.5), normalScale: RELIEF(0.8) }),
    vrata: nastani({ map: vrataT, roughness: 0.7 }),
    garaza: nastani({ map: garazaT, roughness: 0.75 }),
    okvir: nastani({ color: "#ececec", roughness: 0.5 }),
    polica: nastani({ color: "#d8d4cc", roughness: 0.7 }),
    /**
     * Steklo je pri hiši največji odsevnik in zato največji vir vtisa. Prej je
     * bilo temno-modra prosojna ploskev z malo odseva; zdaj ima lak (clearcoat)
     * in polno moč okoljskega odseva, zato v njem vidiš nebo in sosednjo streho
     * — prav to loči okno od naslikanega pravokotnika. Odsevnost 0,08 je
     * vrednost za navadno steklo (lomni količnik 1,5).
     */
    steklo: new THREE.MeshPhysicalMaterial({
      color: "#2a3840",
      roughness: 0.08,
      metalness: 0,
      reflectivity: 0.5,
      ior: 1.5,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.6,
      transparent: true,
      opacity: 0.86,
    }),
    oknoNoc: nastani({ color: "#2a2018", emissive: "#ffc477", emissiveIntensity: 1.1, roughness: 0.4 }),
    zavesa: nastani({ color: "#e8ddc8", roughness: 1 }),
    notranjost: nastani({ color: "#181f26", roughness: 1 }),
    beton: nastani({ color: "#cfccc4", roughness: 0.9, normalMap: reliefIz(ometT, 1.8), normalScale: RELIEF(0.35) }),
    kovinaTemna: nastani({ color: "#3a3a3c", roughness: 0.5, metalness: 0.6 }),
    // okolica
    tlakovci: nastani({ map: tlakovciT, roughness: 0.95, normalMap: reliefIz(tlakovciT, 4.0), normalScale: RELIEF(1.1) }),
    asfalt: nastani({ map: asfaltT, roughness: 1, normalMap: reliefIz(asfaltT, 2.0), normalScale: RELIEF(0.5) }),
    trava: nastani({ map: travaT, roughness: 1 }),
    zivaMeja: nastani({ map: mejaT, roughness: 1 }),
    listje: nastani({ color: "#3e5a2a", roughness: 1, flatShading: true }),
    deblo: nastani({ color: "#5b4632", roughness: 1 }),
    opekaStreha: nastani({ map: opekaStrehaT, roughness: 0.9, normalMap: reliefIz(opekaStrehaT, 3.0), normalScale: RELIEF(0.9) }),
    rumenaFasada: nastani({ color: "#e9d98f", roughness: 0.95 }),
    belaFasada: nastani({ map: ometT.clone(), roughness: 0.95 }),
    cerkevFasada: nastani({ color: "#efe3c2", roughness: 0.95 }),
    blokDan: nastani({ map: blokT(false), roughness: 0.9 }),
    blokNoc: nastani({ map: blokT(true), emissiveMap: blokT(true), emissive: "#ffffff", emissiveIntensity: 0.55, roughness: 0.9 }),
    ograjaMreza: nastani({ color: "#2e3436", roughness: 0.8, transparent: true, opacity: 0.85 }),
    zelenaKovina: nastani({ color: "#2f6b3a", roughness: 0.6, metalness: 0.3 }),
    hrib: nastani({ color: "#4a5a44", roughness: 1 }),
    // po prenovi
    prefalz: nastani({ map: prefalzT, roughness: 0.55, metalness: 0.55, normalMap: reliefIz(prefalzT, 2.6), normalScale: RELIEF(0.7) }),
    fasadaNova: nastani({ color: "#efece6", roughness: 0.92, normalMap: reliefIz(ometT, 2.2), normalScale: RELIEF(0.5) }),
    travertin: nastani({ map: travertinT, roughness: 0.7, normalMap: reliefIz(travertinT, 2.4), normalScale: RELIEF(0.55) }),
    abacusPetrolio: nastani({ map: abacusT("#2e6b6a", 0.12), roughness: 0.5 }),
    abacusCalce: nastani({ map: abacusT("#ddd6c4", 0.1), roughness: 0.55 }),
    granitogres: nastani({ map: granitogresT, roughness: 0.35, metalness: 0.05 }),
    lamele: nastani({ map: lameleT, roughness: 0.8 }),
    jekloAntracit: nastani({ color: "#33363a", roughness: 0.45, metalness: 0.7 }),
    rebrasta: nastani({ map: rebrastaT, roughness: 0.4, metalness: 0.75 }),
    mavcna: nastani({ color: "#f6f4f0", roughness: 0.95 }),
    pohistvoLes: nastani({ color: "#b98f5f", roughness: 0.75 }),
    pohistvoTemno: nastani({ color: "#4b4f54", roughness: 0.7 }),
    tekstil: nastani({ color: "#8e9aa5", roughness: 1 }),
    keramikaBela: nastani({ color: "#f2f2f0", roughness: 0.25 }),
    ponovi,
  };
}
