import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Ali se arhiviran PDF res postreže — po ISTI poti, kot jo hodi stran.
 *
 * Pot `/api/avtonet/pdf/[id]` poskusi disk, nato `rclone cat` iz OneDriva.
 * Ta skript ponovi oboje nad naključnim vzorcem vrstic iz `avtonet_pdfji` in
 * izmeri čas ter preveri, da dobljeni bajti res začnejo z "%PDF".
 *
 *   npx tsx scripts/preveri-pdf-oblak.ts [koliko]
 */

const izvedi = promisify(execFile);

const MAPA = process.env.AVTONET_PDF_MAPA ?? "C:\\avtonet-arhiv";
const RCLONE =
  process.env.RCLONE_EXE ??
  "C:\\Users\\lukak\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Rclone.Rclone_Microsoft.Winget.Source_8wekyb3d8bbwe\\rclone-v1.75.0-windows-amd64\\rclone.exe";
const OBLAK = process.env.AVTONET_PDF_OBLAK ?? "onedrive:avtonet-pdf";

function veljavnaOblacnaPot(datoteka: string): boolean {
  return /^\d+\/[A-Za-z0-9._-]+\.pdf$/.test(datoteka);
}

async function main(): Promise<void> {
  const koliko = Number(process.argv[2] ?? 5);
  const sql = `select id||'|'||datoteka||'|'||velikost from avtonet_pdfji where velikost > 0 order by random() limit ${koliko}`;
  const { stdout } = await izvedi("docker", ["exec", "avtonet-db-db-1", "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", sql]);
  const vrstice = stdout.split("\n").map((v) => v.trim()).filter(Boolean);

  let sDiska = 0;
  let izOblakaOk = 0;
  let neuspelo = 0;
  for (const v of vrstice) {
    const [id, datoteka, velikost] = v.split("|");
    const zacetek = Date.now();

    try {
      const buf = await readFile(join(MAPA, datoteka));
      sDiska += 1;
      console.log(`id ${id}: disk, ${Math.round(buf.length / 1024)} kB v ${Date.now() - zacetek} ms`);
      continue;
    } catch {
      // Ni na disku — sinhronizacija ga je odnesla v oblak.
    }

    if (!veljavnaOblacnaPot(datoteka)) {
      neuspelo += 1;
      console.log(`id ${id}: ZAVRNJENA POT (regex) — "${datoteka}"`);
      continue;
    }
    try {
      const { stdout: bajti } = await izvedi(RCLONE, ["cat", `${OBLAK}/${datoteka}`], {
        encoding: "buffer",
        timeout: 60_000,
        maxBuffer: 64 * 1024 * 1024,
      });
      const ms = Date.now() - zacetek;
      const jePdf = bajti.length > 4 && bajti.subarray(0, 4).toString("latin1") === "%PDF";
      if (jePdf && bajti.length >= Number(velikost) * 0.9) {
        izOblakaOk += 1;
        console.log(`id ${id}: oblak OK, ${Math.round(bajti.length / 1024)} kB v ${ms} ms`);
      } else {
        neuspelo += 1;
        console.log(`id ${id}: oblak POKVARJEN — ${bajti.length} B (pricakovano ${velikost}), zacetek "${bajti.subarray(0, 8).toString("latin1")}", ${ms} ms`);
      }
    } catch (e) {
      neuspelo += 1;
      console.log(`id ${id}: oblak NAPAKA v ${Date.now() - zacetek} ms — ${e instanceof Error ? e.message.slice(0, 120) : e}`);
    }
  }
  console.log(`\nz diska: ${sDiska}, iz oblaka: ${izOblakaOk}, NEUSPELO: ${neuspelo}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
