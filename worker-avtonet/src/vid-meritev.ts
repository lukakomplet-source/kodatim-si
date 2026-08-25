import "dotenv/config";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

/**
 * Koliko časa vzame en oglas pri različnih nastavitvah.
 *
 * Prva meritev je pokazala 85 s na oglas pri štirih slikah po 896 px, kar je
 * premalo za 1.000 oglasov na dan. Izpis modela je kratek (450–700 znakov),
 * torej čas ne gre v pisanje odgovora, ampak v gledanje slik. Ta skripta zato
 * meri isti oglas pri različnih velikostih in številih slik — da se odločimo
 * po številkah in ne po občutku.
 */

const OLLAMA = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const MAPA = process.env.AVTONET_PDF_MAPA ?? "G:\\";

const NAVODILO = `Si ocenjevalec rabljenih vozil. Na slikah je EN avtomobil.
Odgovori IZKLJUČNO z JSON: {"oprema":[{"znacilka":"...","zaupanje":0.0-1.0}],"facelift":true|false|null,"facelift_zaupanje":0.0-1.0,"facelift_razlog":"..."}
Naštej samo opremo, ki jo na sliki res vidiš. Če česa ne vidiš zanesljivo, je ne naštej.`;

async function poskus(
  model: string,
  slike: Buffer[]
): Promise<{ ms: number; znakov: number; izsek: string }> {
  const zacetek = Date.now();
  const r = await fetch(`${OLLAMA}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: NAVODILO,
      images: slike.map((b) => b.toString("base64")),
      stream: false,
      think: false,
      options: { temperature: 0.1, num_ctx: 8192 },
    }),
  });
  const telo = (await r.json()) as { response?: string; error?: string };
  const besedilo = telo.response ?? telo.error ?? "";
  return {
    ms: Date.now() - zacetek,
    znakov: besedilo.length,
    izsek: besedilo.replace(/\s+/g, " ").slice(0, 100),
  };
}

async function main(): Promise<void> {
  const model = process.argv[2] ?? "qwen3-vl:8b";
  const oglas = process.argv[3];
  if (!oglas) throw new Error("uporaba: vid-meritev.ts <model> <avtonet_id>");

  const mapa = join(MAPA, oglas, "vid");
  if (!existsSync(mapa)) throw new Error(`ni slik v ${mapa}`);
  const poti = readdirSync(mapa)
    .filter((v) => v.toLowerCase().endsWith(".jpg"))
    .sort()
    .map((v) => join(mapa, v));

  console.log(`Model: ${model}, oglas ${oglas}, slik na voljo: ${poti.length}\n`);

  for (const [stSlik, px] of [
    [4, 896],
    [4, 640],
    [4, 448],
    [2, 896],
    [2, 640],
  ] as [number, number][]) {
    const izbrane = poti.slice(0, stSlik);
    if (izbrane.length < stSlik) continue;
    const slike = await Promise.all(
      izbrane.map((p) =>
        sharp(readFileSync(p))
          .resize({ width: px, height: px, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toBuffer()
      )
    );
    const kb = Math.round(slike.reduce((v, b) => v + b.length, 0) / 1024);
    const izid = await poskus(model, slike);
    console.log(
      `${String(stSlik).padStart(2)} slik @ ${String(px).padEnd(4)} (${String(kb).padStart(4)} KB) → ` +
        `${(izid.ms / 1000).toFixed(1).padStart(6)} s | ${String(izid.znakov).padStart(4)} znakov | ${izid.izsek}`
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
