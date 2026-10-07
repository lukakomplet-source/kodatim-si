// Promo video hiše Parmova 4 (3 enote, ločeni vhodi, prerez etaž).
//
// Odpre /3d-hisa?video=1 v Chromiumu na TUKAJŠNJI grafični kartici, izriše
// sličice eno za drugo (engine/video.ts — čista funkcija časa) in jih sproti
// shrani na D:, nato jih ffmpeg sestavi v MP4. Že izrisane sličice preskoči,
// zato se prekinjen izris nadaljuje, kjer je obstal.
//
//   Kopiraj v worker-avtonet (tam je playwright-core) in poženi:
//   node video-hisa.mjs [url] [izhodna mapa] [vzorcev] [širina]
//
// Privzeto: http://localhost:3001/3d-hisa?video=1, D:\kodatim-render\video\parmova4, 12, 1920.

import { chromium } from "playwright-core";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const url = process.argv[2] ?? "http://localhost:3001/3d-hisa?video=1&stanje=prenova";
const mapa = process.argv[3] ?? "D:\\kodatim-render\\video\\parmova4";
const vzorcev = Number(process.argv[4] ?? 12);
const W = Number(process.argv[5] ?? 1920);
const H = Math.round((W * 9) / 16);
const izvedljivka =
  process.env.CHROMIUM_POT ?? "C:\\Users\\lukak\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe";
const ffmpeg = process.env.FFMPEG ?? "D:\\kodatim-render\\orodja\\ffmpeg\\bin\\ffmpeg.exe";
const slicice = join(mapa, "slicice");
mkdirSync(slicice, { recursive: true });

/**
 * Brskalnik se odpre ZNOVA vsakih NA_BRSKALNIK sličic. 7. 10. 2026 je WebGL po
 * ~100–120 zaporednih sličicah izgubil grafično kartico: prvič je zajem obvisel
 * (91), drugič je 1.495 sličic tiho izrisal ČRNIH (samo oznake). Svež kontekst
 * pred tem pragom je zanesljivejši od iskanja puščanja v motorju.
 */
const NA_BRSKALNIK = 60;
let brskalnik;
let stran;
async function odpri() {
  if (brskalnik) await brskalnik.close().catch(() => {});
  brskalnik = await chromium.launch({
    executablePath: izvedljivka,
    headless: true,
    args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
  });
  stran = await brskalnik.newPage({ viewport: { width: 1280, height: 720 } });
  await stran.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  await stran.waitForFunction(() => window.__hisaVideo !== undefined, null, { timeout: 180000 });
}
await odpri();
const { dolzina, fps } = await stran.evaluate(() => ({ dolzina: window.__hisaVideo.dolzina, fps: window.__hisaVideo.fps }));
const skupaj = Math.round(dolzina * fps);
console.log(`video: ${dolzina} s × ${fps} fps = ${skupaj} sličic, ${W}×${H}, ${vzorcev} vzorcev`);

// Pregled: CASI="0,5,13" izriše samo te trenutke (v mapo pregled) in konča.
if (process.env.CASI) {
  const pregled = join(mapa, "pregled");
  mkdirSync(pregled, { recursive: true });
  for (const t of process.env.CASI.split(",").map(Number)) {
    const b64 = await stran.evaluate(([t, w, h, v]) => window.__hisaVideo.slicica(t, w, h, v), [t, W, H, vzorcev]);
    writeFileSync(join(pregled, `t${String(t).padStart(4, "0")}.jpg`), Buffer.from(b64, "base64"));
    console.log(`pregled t=${t}`);
  }
  await brskalnik.close();
  process.exit(0);
}

const zacetek = Date.now();
let narejenih = 0;
let poskusov = 0;
for (let i = 0; i < skupaj; i++) {
  const pot = join(slicice, `s${String(i).padStart(5, "0")}.jpg`);
  if (existsSync(pot)) continue;
  if (narejenih > 0 && narejenih % NA_BRSKALNIK === 0) await odpri();
  let b64 = null;
  try {
    b64 = await stran.evaluate(([t, w, h, v]) => window.__hisaVideo.slicica(t, w, h, v), [i / fps, W, H, vzorcev]);
  } catch (e) {
    // Občasno ("The source image could not be decoded") — enako kot prazna sličica.
    console.log(`sličica ${i}: ${String(e).split(/\r?\n/)[0]}`);
  }
  const buf = Buffer.from(b64 ?? "", "base64");
  // Črna 3D slika (izgubljen WebGL) da JPEG 13–100 kB (samo oznake), prava
  // 1080p sličica 300–500 kB. Ne shrani, odpri brskalnik znova.
  if (buf.length < 150000) {
    if (++poskusov > 3) throw new Error(`sličica ${i} je po 3 poskusih še prazna (${buf.length} B)`);
    console.log(`sličica ${i} je prazna (${buf.length} B) — znova odpiram brskalnik`);
    await odpri();
    i--;
    continue;
  }
  poskusov = 0;
  writeFileSync(pot, buf);
  narejenih++;
  if (narejenih % 25 === 0) {
    const naSlicico = (Date.now() - zacetek) / narejenih / 1000;
    console.log(`${i + 1}/${skupaj} · ${naSlicico.toFixed(2)} s/sličico · še ~${Math.round(((skupaj - i - 1) * naSlicico) / 60)} min`);
  }
}
await brskalnik.close();

const izhod = join(mapa, "Parmova4_Vojnik_3_enote.mp4");
execFileSync(
  ffmpeg,
  ["-y", "-framerate", String(fps), "-i", join(slicice, "s%05d.jpg"), "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", izhod],
  { stdio: "inherit" }
);
console.log(`KONČANO: ${izhod}`);
