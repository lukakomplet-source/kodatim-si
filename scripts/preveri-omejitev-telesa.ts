import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";

/**
 * Ali časovna omejitev in omejitev velikosti RES varujeta proces strani?
 *
 * 17. 9. 2026 ob 15:20 se je proces strani (next start, vrata 3001) sesul in
 * kodatim.si je bil za pol minute nedosegljiv. Sum: obogatitev registra prenaša
 * strani poljubnih podjetij skozi ISTI proces, `providerFetch` pa časovnik
 * prekliče v `finally`, torej takoj ko pridejo glave — branje telesa
 * (`await r.text()`) po tem ni omejeno ne s časom ne z velikostjo.
 *
 * Ta preizkus postavi lokalni strežnik, ki (1) telo pošilja zelo počasi in
 * (2) pošlje ogromno telo, ter izmeri, kaj se zgodi. Vse je lokalno — noben
 * tuj strežnik ni obremenjen.
 *
 *   npx tsx scripts/preveri-omejitev-telesa.ts
 */

type ModuleLoadFn = (request: string, ...rest: unknown[]) => unknown;
const ModuleAny = Module as unknown as { _load: ModuleLoadFn };
const originalLoad = ModuleAny._load;
ModuleAny._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, ...rest);
};

function naloziOkolje(): void {
  const vsebina = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  for (const vrstica of vsebina.split("\n")) {
    const t = vrstica.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
    if (!process.env[k]) process.env[k] = v;
  }
}

const MB = (b: number) => `${Math.round(b / 1048576)} MB`;

async function main(): Promise<void> {
  naloziOkolje();
  const { providerFetch, preberiTeloOmejeno, jeBesedilnaStran } = await import("@/lib/publicEnrichment/httpClient");

  // Strežnik za preizkus: /pocasi pošilja 60 sekund po koščkih, /ogromno pošlje
  // 400 MB HTML-a, /video se predstavi kot video datoteka.
  const streznik = createServer((zahteva, odgovor) => {
    const pot = zahteva.url ?? "/";
    if (pot.startsWith("/pocasi")) {
      odgovor.writeHead(200, { "Content-Type": "text/html" });
      let poslano = 0;
      const casovnik = setInterval(() => {
        poslano += 1;
        odgovor.write("<p>drobec</p>");
        if (poslano >= 60) {
          clearInterval(casovnik);
          odgovor.end();
        }
      }, 1000);
      zahteva.on("close", () => clearInterval(casovnik));
      return;
    }
    if (pot.startsWith("/ogromno")) {
      odgovor.writeHead(200, { "Content-Type": "text/html" });
      const kos = "<div>" + "x".repeat(1_000_000) + "</div>";
      let i = 0;
      const posiljaj = () => {
        while (i < 400) {
          i += 1;
          if (!odgovor.write(kos)) {
            odgovor.once("drain", posiljaj);
            return;
          }
        }
        odgovor.end();
      };
      posiljaj();
      return;
    }
    if (pot.startsWith("/video")) {
      odgovor.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": "104857600" });
      odgovor.end(Buffer.alloc(1024));
      return;
    }
    odgovor.writeHead(404).end();
  });
  await new Promise<void>((r) => streznik.listen(45231, "127.0.0.1", r));

  // 1) Počasno telo: zahteva ima 8 s časovno omejitev — ali velja tudi za telo?
  {
    const zacetek = Date.now();
    const r = await providerFetch("website", "http://127.0.0.1:45231/pocasi", { maxAttempts: 1, timeoutMs: 8_000 });
    const doGlave = Date.now() - zacetek;
    const { besedilo, prirezano } = await preberiTeloOmejeno(r);
    const doKonca = Date.now() - zacetek;
    console.log(`   prirezano: ${prirezano}`);
    console.log(
      `1) POCASNO TELO: glave v ${doGlave} ms (omejitev 8.000 ms), celotno branje ${doKonca} ms, ${besedilo.length} znakov`
    );
    console.log(
      `   ${doKonca > 20_000 ? "✗ omejitev NE velja za telo — zahteva je držala proces " + Math.round(doKonca / 1000) + " s" : "✓ telo omejeno na " + Math.round(doKonca / 1000) + " s"}`
    );
  }

  // 2) Ogromno telo: koliko pomnilnika porabi ena sama stran?
  {
    const pred = process.memoryUsage();
    const zacetek = Date.now();
    const r = await providerFetch("website", "http://127.0.0.1:45231/ogromno", { maxAttempts: 1, timeoutMs: 8_000 });
    const { besedilo } = await preberiTeloOmejeno(r);
    const po = process.memoryUsage();
    console.log(
      `2) OGROMNO TELO: prebranih ${MB(besedilo.length)} v ${Date.now() - zacetek} ms; ` +
        `kopica ${MB(pred.heapUsed)} -> ${MB(po.heapUsed)}, RSS ${MB(pred.rss)} -> ${MB(po.rss)}`
    );
    console.log(
      `   ${besedilo.length > 50_000_000 ? "✗ ni omejitve velikosti — ena stran lahko poje ves pomnilnik procesa" : "✓ velikost omejena na " + MB(besedilo.length)}`
    );
    // Še razčlenjevanje, kot ga dela obogatitev.
    const { stripHtmlToText } = await import("@/lib/publicEnrichment/htmlText");
    const zacetek2 = Date.now();
    const besedilo2 = stripHtmlToText(besedilo.slice(0, 20_000_000));
    console.log(`   razclenjevanje 20 MB: ${Date.now() - zacetek2} ms -> ${besedilo2.length} znakov (blokira dogodkovno zanko)`);
  }

  // 3) Video: ali se sploh preveri, da gre za HTML?
  {
    const r = await providerFetch("website", "http://127.0.0.1:45231/video", { maxAttempts: 1, timeoutMs: 8_000 });
    console.log(`3) NE-HTML: Content-Type "${r.headers.get("content-type")}", Content-Length ${r.headers.get("content-length")}`);
    console.log(`   ${jeBesedilnaStran(r) ? "✗ obravnavan kot stran" : "✓ zavrnjen pred branjem (ni besedilna vsebina)"}`);
    await r.body?.cancel().catch(() => {});
  }

  streznik.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
