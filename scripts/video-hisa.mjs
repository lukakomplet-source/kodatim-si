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

const brskalnik = await chromium.launch({
  executablePath: izvedljivka,
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const stran = await brskalnik.newPage({ viewport: { width: 1280, height: 720 } });
await stran.goto(url, { waitUntil: "networkidle", timeout: 120000 });
await stran.waitForFunction(() => window.__hisaVideo !== undefined, null, { timeout: 180000 });
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
for (let i = 0; i < skupaj; i++) {
  const pot = join(slicice, `s${String(i).padStart(5, "0")}.jpg`);
  if (existsSync(pot)) continue;
  const b64 = await stran.evaluate(
    ([t, w, h, v]) => window.__hisaVideo.slicica(t, w, h, v),
    [i / fps, W, H, vzorcev]
  );
  if (!b64) throw new Error(`sličica ${i} ni uspela`);
  writeFileSync(pot, Buffer.from(b64, "base64"));
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
