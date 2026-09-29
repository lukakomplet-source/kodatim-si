import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";

/**
 * Koliko podjetij, ki so zdaj označena kot „brez strani“, bi z novim
 * pravilom o dokazu lastništva vseeno našli?
 *
 * Meri celotno pot (kontaktiSSpleta), ne posameznega dela — tako je številka
 * primerljiva s tem, kar bo delal delavec.
 *
 *   npx tsx scripts/preveri-ponovni-poskus.ts [koliko] [prioriteta]
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

async function main(): Promise<void> {
  naloziOkolje();
  const { kontaktiSSpleta } = await import("@/lib/publicEnrichment/registerSplet");
  const koliko = Number(process.argv[2] ?? 40);
  const prioriteta = process.argv[3] ?? "1";
  const db = process.env.AVTONET_DB_URL || "http://localhost:8000";
  const kljuc = process.env.AVTONET_DB_KEY ?? "";
  const r = await fetch(
    `${db}/rest/v1/podjetja_register?select=naziv,kratki_naziv,kraj,davcna` +
      `&splet_status=eq.brez_iskanja&splet_prioriteta=eq.${prioriteta}&ni_vec_od=is.null&limit=${koliko * 3}`,
    { headers: { apikey: kljuc, Authorization: `Bearer ${kljuc}` } }
  );
  const vse = (await r.json()) as Vrstica[];
  const vzorec = vse.sort(() => Math.random() - 0.5).slice(0, koliko);

  let najdenih = 0;
  let zEposto = 0;
  const izidi = await Promise.all(
    vzorec.map(async (v) => ({
      v,
      izid: await kontaktiSSpleta({ naziv: v.naziv, kratkiNaziv: v.kratki_naziv, kraj: v.kraj, davcna: v.davcna }),
    }))
  );
  for (const { v, izid } of izidi) {
    if (izid.stanje === "najdena") {
      najdenih += 1;
      if (izid.eposta) zEposto += 1;
      console.log(`${(v.kratki_naziv || v.naziv).slice(0, 30).padEnd(30)} | ${izid.spletnaStran} | ${izid.eposta ?? "—"} | ${izid.opomba.slice(0, 70)}`);
    }
  }
  console.log(`\nvzorec ${vzorec.length}: NOVO NAJDENIH ${najdenih} (${Math.round((najdenih / vzorec.length) * 100)} %), od tega z e-posto ${zEposto}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
