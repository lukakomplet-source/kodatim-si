import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { lookup } from "node:dns/promises";
import Module from "node:module";

/**
 * Koliko strani bi našli z DODATNIMI vzorci domen — brez iskalnika.
 *
 * 22. 9. 2026: iskalnik (Firecrawl) je na vzorcu dvanajstih „brez strani“
 * podjetij našel le dve, ker prva mesta zasedejo imeniki (pirs.si,
 * itis.siol.net, zemljevid.najdi.si). Povedna sta bila prav ta dva zadetka:
 *   vip-racunovodstvo.si   — kratica s pikami (V.I.P.), ki jo normalizacija
 *                            razbije na „v i p“ in vrže stran
 *   montana-zalec.si       — ime + KRAJ, vzorec, ki ga sploh ne ugibamo
 *
 * Ta skript izmeri, koliko bi dala ta dva nova vzorca na vzorcu podjetij, ki
 * so zdaj označena kot brez strani. Stane samo DNS in po eno zahtevo na živo
 * domeno — nobenega zunanjega servisa.
 *
 *   npx tsx scripts/preveri-nove-domene.ts [koliko] [prioriteta]
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

function ociscen(v: string): string {
  return v
    .toLowerCase()
    .replace(/[čć]/g, "c").replace(/š/g, "s").replace(/ž/g, "z").replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Kratica iz pikastega zapisa: „V.I.P. RAČUNOVODSTVO“ → „vip“. */
function kratica(ime: string): string | null {
  const m = ime.match(/\b(?:[A-Za-zČŠŽčšž]\.){2,}/);
  if (!m) return null;
  const k = ociscen(m[0]).replace(/\s+/g, "");
  return k.length >= 2 && k.length <= 6 ? k : null;
}

function noviKandidati(vrstica: Vrstica): string[] {
  const osnova = (vrstica.kratki_naziv || vrstica.naziv).split(",")[0];
  const polnila = new Set(["doo", "d", "o", "sp", "dd", "kd", "zoo", "in", "za", "ter", "the"]);
  const besede = ociscen(osnova).split(" ").filter((b) => b.length >= 2 && !polnila.has(b));
  const kraj = vrstica.kraj ? ociscen(vrstica.kraj).split(" ")[0] : "";
  const out: string[] = [];
  const dodaj = (d: string) => {
    if (d.length >= 5 && d.length <= 45 && !out.includes(d)) out.push(d);
  };

  // 1) ime + kraj (montana-zalec.si)
  if (besede.length > 0 && kraj && kraj.length >= 3) {
    dodaj(`${besede[0]}-${kraj}.si`);
    dodaj(`${besede[0]}${kraj}.si`);
  }
  // 2) kratica s pikami (vip-racunovodstvo.si, vip.si)
  const kr = kratica(osnova);
  if (kr) {
    const ostalo = besede.filter((b) => b !== kr);
    if (ostalo.length > 0) dodaj(`${kr}-${ostalo[0]}.si`);
    if (ostalo.length > 0) dodaj(`${kr}${ostalo[0]}.si`);
    dodaj(`${kr}.si`);
  }
  // 3) prvi dve besedi s pomišljajem (ce je besed tri ali vec)
  if (besede.length >= 3) dodaj(`${besede[0]}-${besede[1]}.si`);
  return out.slice(0, 5);
}

async function zivi(host: string): Promise<boolean> {
  try {
    await Promise.race([
      lookup(host),
      new Promise((_, z) => setTimeout(() => z(new Error("rok")), 3_000)),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  naloziOkolje();
  const { identifyingTokens, pageBelongsToCompany } = await import("@/lib/publicEnrichment/websiteSearch");
  const { providerFetch, preberiTeloOmejeno, jeBesedilnaStran } = await import("@/lib/publicEnrichment/httpClient");
  const { stripHtmlToText } = await import("@/lib/publicEnrichment/htmlText");

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

  let novih = 0;
  let sKandidati = 0;
  for (const v of vzorec) {
    const kandidati = noviKandidati(v);
    if (kandidati.length === 0) continue;
    sKandidati += 1;
    const zetoni = identifyingTokens(v.kratki_naziv || v.naziv);
    const davcna = (v.davcna ?? "").replace(/\D/g, "");
    const ziviHosti = (await Promise.all(kandidati.map(async (h) => ((await zivi(h)) ? h : null)))).filter(
      (h): h is string => h !== null
    );
    for (const host of ziviHosti) {
      try {
        const o = await providerFetch("website", `https://${host}`, { maxAttempts: 1, timeoutMs: 8_000 });
        if (!o.ok || !jeBesedilnaStran(o)) continue;
        const { besedilo } = await preberiTeloOmejeno(o);
        const dokaz = pageBelongsToCompany(stripHtmlToText(besedilo), host, zetoni, davcna);
        if (dokaz) {
          novih += 1;
          console.log(`${(v.kratki_naziv || v.naziv).slice(0, 32).padEnd(32)} | NAJDENA https://${host} — ${dokaz}`);
          break;
        }
      } catch {
        // Ta kandidat odpade.
      }
    }
  }
  console.log(
    `\nvzorec ${vzorec.length} (prioriteta ${prioriteta}), z novimi kandidati ${sKandidati}: ` +
      `NOVO NAJDENIH ${novih} = ${Math.round((novih / vzorec.length) * 100)} % vzorca`
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
