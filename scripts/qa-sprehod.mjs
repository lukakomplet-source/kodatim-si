// Avtomatski QA prehodnosti 3D hiše (/3d-hisa, varianta "po prenovi").
//
// Odpre stran v headless Chromiumu, prebere kolizije in pohodne površine, ki
// jih motor izpostavi na window.__hisaQA, ter z BFS simulira hojo igralca
// (radij 0.35, prestop 0.42 m, višina 1.75) od dovoza pred hišo. Preveri, da
// so dosegljivi: vhodi, vse sobe vseh treh etaž (sredine iz PZI tlorisov) in
// podesti zunanjega stopnišča. Konča z izhodno kodo 1, če kaj ni dosegljivo.
//
//   node scripts/qa-sprehod.mjs [url]
//
// Privzeti url: http://localhost:3000/3d-hisa
// (Chromium: playwright-core; pot do brskalnika prek PLAYWRIGHT_BROWSERS_PATH
//  ali CHROMIUM_POT; na CI/sandboxu /opt/pw-browsers/chromium.)

import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:3000/3d-hisa?cas=dan&nacin=ogled";
const izvedljivka = process.env.CHROMIUM_POT ?? "/opt/pw-browsers/chromium";

const KORAK = 0.25; // mreža BFS
const RADIJ = 0.28; // nekoliko manj od dejanskega (0.35), da 25-cm mreža ne zapre realno prehodnih vrat
const PRESTOP = 0.42;
const VISINA = 1.75;

// Cilji: [ime, x, z, pričakovana višina tal]
const CILJI = [
  ["dovoz pred hišo (S)", -8.0, -6.9, 0.03],
  ["parkirišče JZ", -8.4, 11.0, 0.03],
  ["vzhodni vrt (terasa)", 8.6, 4.0, 0.35],
  ["P: vetrolov", 0.3, -4.0, 0.05],
  ["P: predprostor", -0.3, -1.9, 0.05],
  ["P: kopalnica", 3.0, -1.7, 0.05],
  ["P: kuhinja", 3.0, 0.3, 0.05],
  ["P: soba", 2.7, 3.0, 0.05],
  ["P: spalnica", -2.8, -3.0, 0.05],
  ["P: dnevni prostor", -2.0, 2.0, 0.05],
  ["P: kurilnica (od zunaj, ZV2)", 3.1, -4.2, 0.05],
  ["stopnišče: podest 1N", 5.2, -1.5, 2.71],
  ["1N: vetrolov", 3.3, -0.9, 2.71],
  ["1N: hodnik", 0.5, -0.8, 2.71],
  ["1N: kopalnica", 1.9, -2.7, 2.71],
  ["1N: spalnica", 1.2, -4.3, 2.71],
  ["1N: soba", 1.6, 4.2, 2.71],
  ["1N: dnevni s kuhinjo", -2.6, 4.2, 2.71],
  ["1N: zahodni balkon", -5.3, 0.0, 2.73],
  ["stopnišče: podest podstrehe", 5.2, -1.5, 5.46],
  ["M: predprostor", 3.2, -1.4, 5.46],
  ["M: kopalnica", 2.6, -3.6, 5.46],
  ["M: spalnica", -3.5, -3.0, 5.46],
  ["M: soba", 2.6, 1.6, 5.46],
  ["M: dnevni s kuhinjo", -2.6, 3.6, 5.46],
];

const ZACETEK = [-9.5, 0.03, -6.9]; // na uvozu s ceste

function kljuc(x, y, z) {
  return `${Math.round(x / KORAK)}|${Math.round(z / KORAK)}|${Math.round(y / 0.2)}`;
}

function najdiTla(tla, x, z, stopala) {
  let naj = null;
  for (const b of tla) {
    if (x < b[0] - 0.1 || x > b[3] + 0.1 || z < b[2] - 0.1 || z > b[5] + 0.1) continue;
    const vrh = b[4];
    if (vrh <= stopala + 0.45 && (naj === null || vrh > naj)) naj = vrh;
  }
  return naj;
}

function blokira(kolizije, x, z, stopala) {
  for (const b of kolizije) {
    if (
      x + RADIJ > b[0] && x - RADIJ < b[3] &&
      z + RADIJ > b[2] && z - RADIJ < b[5] &&
      b[4] > stopala + PRESTOP && b[1] < stopala + VISINA
    ) {
      return true;
    }
  }
  return false;
}

const brskalnik = await chromium.launch({ executablePath: izvedljivka });
const stran = await brskalnik.newPage();
await stran.goto(url, { waitUntil: "networkidle" });
await stran.waitForFunction(() => window.__hisaQA !== undefined, null, { timeout: 60000 });
const qa = await stran.evaluate(() => window.__hisaQA);
await brskalnik.close();

console.log(`QA prehodnosti: ${qa.kolizije.length} kolizij, ${qa.tla.length} pohodnih površin`);

// BFS
const obiskano = new Set();
const vrsta = [[ZACETEK[0], ZACETEK[1], ZACETEK[2]]];
obiskano.add(kljuc(...ZACETEK));
const dosegljivaTla = [];
let korakov = 0;
while (vrsta.length > 0 && korakov < 600000) {
  korakov++;
  const [x, y, z] = vrsta.shift();
  dosegljivaTla.push([x, y, z]);
  for (const [dx, dz] of [[KORAK, 0], [-KORAK, 0], [0, KORAK], [0, -KORAK]]) {
    const nx = x + dx;
    const nz = z + dz;
    if (Math.abs(nx) > 30 || Math.abs(nz) > 30) continue;
    if (blokira(qa.kolizije, nx, nz, y)) continue;
    let vrh = najdiTla(qa.tla, nx, nz, y);
    // zunaj hiše je podlaga raven teren na y=0 (enako kot v kontrole.ts)
    if (vrh === null && y <= 0.5) vrh = 0.03;
    if (vrh === null) continue; // prepad/izven pohodnega
    const k = kljuc(nx, vrh, nz);
    if (obiskano.has(k)) continue;
    obiskano.add(k);
    vrsta.push([nx, vrh, nz]);
  }
}
console.log(`Prehojenih celic: ${dosegljivaTla.length} (korakov ${korakov})`);

let napak = 0;
for (const [ime, cx, cz, cy] of CILJI) {
  let zadetek = false;
  for (const [x, y, z] of dosegljivaTla) {
    if (Math.abs(x - cx) <= 0.55 && Math.abs(z - cz) <= 0.55 && Math.abs(y - cy) <= 0.6) {
      zadetek = true;
      break;
    }
  }
  if (zadetek) console.log(`  OK   ${ime}`);
  else {
    let najbl = Infinity;
    let najblCelica = null;
    for (const [x, y, z] of dosegljivaTla) {
      if (Math.abs(y - cy) > 0.6) continue;
      const d = Math.hypot(x - cx, z - cz);
      if (d < najbl) {
        najbl = d;
        najblCelica = [x, y, z];
      }
    }
    console.log(`  !!   NEDOSEGLJIVO: ${ime} (${cx}, ${cz}, y~${cy}) — najbližje: ${najblCelica ? najblCelica.map((v) => v.toFixed(2)).join(",") : "nič na tej višini"} (${najbl.toFixed(2)} m)`);
    napak++;
  }
}
if (napak > 0) {
  console.log(`SKUPAJ: ${napak} nedosegljivih ciljev`);
  process.exit(1);
}
console.log("SKUPAJ: vsi cilji dosegljivi ✔");
