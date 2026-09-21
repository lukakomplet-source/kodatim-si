import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";

/**
 * Ali branje registra po kazalcu res deluje in ostane hitro.
 *
 * Preveri troje: (1) prvi paket s štetjem, (2) da naslednji paketi ne
 * podvajajo ali preskakujejo vrstic, (3) da paket globoko v tabeli ni
 * počasnejši od prvega — zaradi tega je kazalec po `id` in ne odmik.
 *
 *   npx tsx scripts/preveri-register-pakete.ts
 */

type ModuleLoadFn = (request: string, ...rest: unknown[]) => unknown;
const ModuleAny = Module as unknown as { _load: ModuleLoadFn };
const originalLoad = ModuleAny._load;
ModuleAny._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, ...rest);
};

function naloziOkolje(): void {
  let vsebina: string;
  try {
    vsebina = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  } catch {
    return;
  }
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

async function main(): Promise<void> {
  naloziOkolje();
  const { preberiPaket, preberiNapredek, ocistiIskanje } = await import("@/lib/registerPodjetij");

  const brezFiltrov = {
    q: "",
    skd: "",
    kraj: "",
    samoEposta: false,
    samoBrezDetajlov: false,
    vkljuciIzginule: false,
  };

  const videni = new Set<number>();
  let kazalec: number | null = null;
  for (let i = 1; i <= 4; i += 1) {
    const zacetek = Date.now();
    const p = await preberiPaket(brezFiltrov, kazalec, i === 1);
    const ms = Date.now() - zacetek;
    const podvojenih = p.vrstice.filter((v) => videni.has(v.id)).length;
    for (const v of p.vrstice) videni.add(v.id);
    console.log(
      `paket ${i}: ${p.vrstice.length} vrstic v ${ms} ms, kazalec ${kazalec ?? "-"} -> ${p.zadnjiId}, ` +
        `še: ${p.se}, skupaj: ${p.skupaj ?? "(ne štejem)"}, podvojenih: ${podvojenih}`
    );
    kazalec = p.zadnjiId;
  }

  // Globoko v tabeli: če bi bral z odmikom, bi bil ta paket dosti počasnejši.
  const globoko = Date.now();
  const p = await preberiPaket(brezFiltrov, 240_000, false);
  console.log(`globok paket (id > 240.000): ${p.vrstice.length} vrstic v ${Date.now() - globoko} ms`);

  // Filtri.
  for (const [opis, f] of [
    ["iskanje 'kompletko'", { ...brezFiltrov, q: "kompletko" }],
    ["nevarni znaki v iskanju", { ...brezFiltrov, q: "d.o.o., (test)*" }],
    ["samo z e-posto", { ...brezFiltrov, samoEposta: true }],
    ["kraj Maribor", { ...brezFiltrov, kraj: "Maribor" }],
    ["SKD 62", { ...brezFiltrov, skd: "62" }],
  ] as const) {
    const t = Date.now();
    const r = await preberiPaket(f, null, true);
    console.log(`${opis}: ${r.skupaj} zadetkov, prvi paket ${r.vrstice.length} v ${Date.now() - t} ms`);
  }
  console.log(`ocistiIskanje("d.o.o., (test)*") -> "${ocistiIskanje("d.o.o., (test)*")}"`);

  const n = await preberiNapredek();
  console.log("napredek:", JSON.stringify(n));
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
