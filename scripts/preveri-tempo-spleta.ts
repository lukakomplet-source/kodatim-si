import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { lookup } from "node:dns/promises";
import Module from "node:module";

/**
 * Kam gre čas pri obogatitvi enega podjetja?
 *
 * 19. 9. 2026 je obogatitev tekla 230 podjetij na uro, čeprav štirje bralci
 * ob dveh sočasnih zahtevah obljubljajo veliko več. Ta skript razbije čas na
 * dele: koliko domen sploh preverimo, koliko časa vzame DNS in koliko prenos
 * naslovne strani — da popravek meri, ne ugiba.
 *
 *   npx tsx scripts/preveri-tempo-spleta.ts [koliko]
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

type Vrstica = { naziv: string; kratki_naziv: string | null; kraj: string | null; davcna: string | null };

async function dnsCas(host: string): Promise<{ ms: number; obstaja: boolean }> {
  const t = Date.now();
  try {
    await Promise.race([
      lookup(host),
      new Promise((_, zavrni) => setTimeout(() => zavrni(new Error("rok")), 3_000)),
    ]);
    return { ms: Date.now() - t, obstaja: true };
  } catch {
    return { ms: Date.now() - t, obstaja: false };
  }
}

async function main(): Promise<void> {
  naloziOkolje();
  const { kandidatiDomen } = await import("@/lib/publicEnrichment/registerSplet");
  const { providerFetch } = await import("@/lib/publicEnrichment/httpClient");
  const koliko = Number(process.argv[2] ?? 8);
  const db = process.env.AVTONET_DB_URL || "http://localhost:8000";
  const kljuc = process.env.AVTONET_DB_KEY ?? "";

  const r = await fetch(
    `${db}/rest/v1/podjetja_register?select=naziv,kratki_naziv,kraj,davcna&splet_ob=is.null&ni_vec_od=is.null&splet_prioriteta=eq.1&order=id.asc&limit=${koliko}`,
    { headers: { apikey: kljuc, Authorization: `Bearer ${kljuc}` } }
  );
  const vrstice = (await r.json()) as Vrstica[];

  let skupajDns = 0;
  let skupajFetch = 0;
  let skupajKandidatov = 0;
  let skupajZivih = 0;
  const zacetekVseh = Date.now();

  for (const v of vrstice) {
    const kandidati = kandidatiDomen(v.kratki_naziv, v.naziv);
    skupajKandidatov += kandidati.length;
    let dnsMs = 0;
    let fetchMs = 0;
    let zivih = 0;
    for (const host of kandidati) {
      const d = await dnsCas(host);
      dnsMs += d.ms;
      if (!d.obstaja) continue;
      zivih += 1;
      const t = Date.now();
      try {
        await providerFetch("website", `https://${host}`, { maxAttempts: 1, timeoutMs: 8_000 });
      } catch {
        // Tudi neuspeh je strošek — prav to merimo.
      }
      fetchMs += Date.now() - t;
    }
    skupajDns += dnsMs;
    skupajFetch += fetchMs;
    skupajZivih += zivih;
    console.log(
      `${(v.kratki_naziv ?? v.naziv).slice(0, 34).padEnd(34)} | kandidatov ${kandidati.length}, zivih ${zivih} | DNS ${dnsMs} ms | prenos ${fetchMs} ms | skupaj ${dnsMs + fetchMs} ms`
    );
  }

  const n = vrstice.length || 1;
  const skupno = Date.now() - zacetekVseh;
  console.log(
    `\n${vrstice.length} podjetij v ${Math.round(skupno / 1000)} s → ${Math.round(skupno / n)} ms na podjetje` +
      `\n  DNS: ${Math.round(skupajDns / n)} ms/podjetje (${skupajKandidatov / n} kandidatov, od tega ${Math.round((skupajZivih / n) * 10) / 10} živih)` +
      `\n  prenos naslovnih strani: ${Math.round(skupajFetch / n)} ms/podjetje` +
      `\n  pri 2 socasnih zahtevah to pomeni ~${Math.round((2 * 3600_000) / (skupno / n))} podjetij/uro`
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
