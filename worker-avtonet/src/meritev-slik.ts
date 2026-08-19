import "dotenv/config";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { connect } from "./db.js";

/**
 * Koliko bi res zasedle slike? Meritev, ne ocena.
 *
 * Prenese vzorec resničnih slik obeh virov, izmeri izvirno velikost in
 * dimenzije, nato naredi različice (sličica / srednja / polna) v WebP in AVIF
 * ter izmeri vsako. Iz tega je mogoče izračunati skupno zasedenost za celotno
 * bazo — brez ugibanja.
 *
 *   npx tsx src/meritev-slik.ts [koliko]
 */

const KOLIKO = Number(process.argv[2] ?? 20);
const mapa = join(tmpdir(), "meritev-slik");

type Meritev = { vir: string; bajti: number; sirina: number; visina: number; razlicice: Record<string, number> };

const kb = (b: number) => Math.round(b / 102.4) / 10;

async function prenesi(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

async function main() {
  mkdirSync(mapa, { recursive: true });
  const db = connect();

  // Nepremičnine: kartica nosi POLNO sliko (izmerjeno 1280 px), ne sličice.
  const { data: nep } = await db
    .from("nep_oglasi")
    .select("slika_url")
    .eq("status", "aktiven")
    .eq("vir", "nepremicnine.net")
    .not("slika_url", "is", null)
    .limit(KOLIKO);
  // Avti: prva slika galerije je polna, ostale so _small.
  const { data: avti } = await db
    .from("avtonet_oglasi")
    .select("slike_urls")
    .not("slike_urls", "is", null)
    .limit(KOLIKO);

  const urlji: { vir: string; url: string }[] = [
    ...((nep ?? []) as { slika_url: string }[]).map((r) => ({ vir: "nepremicnine.net", url: r.slika_url })),
    ...((avti ?? []) as { slike_urls: string[] }[])
      .flatMap((r) => r.slike_urls ?? [])
      .filter((u) => !u.includes("_small"))
      .map((u) => ({ vir: "avto.net", url: u })),
  ];

  const meritve: Meritev[] = [];
  for (const [i, x] of urlji.entries()) {
    const buf = await prenesi(x.url);
    if (!buf) {
      console.log(`  preskočeno (ni prenosa): ${x.url}`);
      continue;
    }
    const pot = join(mapa, `${i}.jpg`);
    writeFileSync(pot, buf);
    const meta = await sharp(buf).metadata();

    const razlicice: Record<string, number> = {};
    const naredi = async (ime: string, sirina: number, format: "webp" | "avif", kakovost: number) => {
      const out = await sharp(buf)
        .resize({ width: sirina, withoutEnlargement: true })
        [format]({ quality: kakovost })
        .toBuffer();
      razlicice[ime] = out.length;
    };
    await naredi("sličica 400 webp q75", 400, "webp", 75);
    await naredi("srednja 1000 webp q80", 1000, "webp", 80);
    await naredi("srednja 1000 avif q50", 1000, "avif", 50);
    await naredi("polna 1600 webp q82", 1600, "webp", 82);

    meritve.push({ vir: x.vir, bajti: buf.length, sirina: meta.width ?? 0, visina: meta.height ?? 0, razlicice });
    // Vljudno: en zahtevek na sekundo, gre za peščico slik.
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (meritve.length === 0) {
    console.log("Nobene slike ni bilo mogoče prenesti.");
    return;
  }

  const povp = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  for (const vir of [...new Set(meritve.map((m) => m.vir))]) {
    const v = meritve.filter((m) => m.vir === vir);
    const b = v.map((m) => m.bajti);
    console.log(`\n=== ${vir} (${v.length} slik)`);
    console.log(`  izvirnik: povprečje ${kb(povp(b))} kB, mediana ${kb(med(b))} kB, najmanjša ${kb(Math.min(...b))} kB, največja ${kb(Math.max(...b))} kB`);
    console.log(`  dimenzije: ${med(v.map((m) => m.sirina))} × ${med(v.map((m) => m.visina))} px (mediana)`);
    for (const ime of Object.keys(v[0].razlicice)) {
      const r = v.map((m) => m.razlicice[ime]);
      const delez = Math.round((povp(r) / povp(b)) * 100);
      console.log(`  ${ime}: povprečje ${kb(povp(r))} kB (${delez} % izvirnika)`);
    }
  }

  const vse = meritve.flatMap((m) => Object.entries(m.razlicice).map(([k, v]) => ({ k, v })));
  const skupno: Record<string, number> = {};
  for (const { k, v } of vse) skupno[k] = (skupno[k] ?? 0) + v;
  console.log("\n=== povprečja čez oba vira (za izračun zasedenosti)");
  for (const [k, v] of Object.entries(skupno)) console.log(`  ${k}: ${kb(v / meritve.length)} kB/sliko`);
  console.log(`  izvirnik: ${kb(povp(meritve.map((m) => m.bajti)))} kB/sliko`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
