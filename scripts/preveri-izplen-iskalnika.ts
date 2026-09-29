import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";

/**
 * Koliko bi pridobili, če bi pri „brez strani“ vprašali še iskalnik?
 *
 * 22. 9. 2026: od 107.000 obdelanih podjetij jih ima najdeno stran 16 %
 * (d.o.o. 21 %, s.p. 2 %), 83 % pa je končalo kot „brez_iskanja“ — torej samo
 * z ugibanjem domene, ker je DuckDuckGo od 17. 9. na vsako poizvedbo vrnil
 * CAPTCHA. Preden karkoli spremenim, hočem vedeti, KOLIKO od teh v resnici
 * ima spletno stran; sicer bi optimiziral nekaj, česar ni.
 *
 * Vzorec vzame naključna podjetja, ki so označena kot brez strani, in za vsako
 * vpraša Firecrawl (ključ že imamo). Zadetek šteje samo, če stran prestane
 * ISTI dokaz lastništva kot v redni poti — davčna ali celotno ime na strani.
 *
 *   npx tsx scripts/preveri-izplen-iskalnika.ts [koliko] [prioriteta]
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

type Vrstica = {
  naziv: string;
  kratki_naziv: string | null;
  kraj: string | null;
  davcna: string | null;
  splet_prioriteta: number;
};

async function main(): Promise<void> {
  naloziOkolje();
  const { searchWeb } = await import("@/lib/firecrawl");
  const { hostOf, identifyingTokens, pageBelongsToCompany } = await import("@/lib/publicEnrichment/websiteSearch");
  const { providerFetch, preberiTeloOmejeno, jeBesedilnaStran } = await import("@/lib/publicEnrichment/httpClient");
  const { stripHtmlToText } = await import("@/lib/publicEnrichment/htmlText");
  const { BLOCKED_DOMAINS } = await import("@/lib/enrichment/blockedDomains");

  const koliko = Number(process.argv[2] ?? 12);
  const prioriteta = process.argv[3] ?? "1";
  const db = process.env.AVTONET_DB_URL || "http://localhost:8000";
  const kljuc = process.env.AVTONET_DB_KEY ?? "";

  const r = await fetch(
    `${db}/rest/v1/podjetja_register?select=naziv,kratki_naziv,kraj,davcna,splet_prioriteta` +
      `&splet_status=eq.brez_iskanja&splet_prioriteta=eq.${prioriteta}&ni_vec_od=is.null&limit=${koliko * 4}`,
    { headers: { apikey: kljuc, Authorization: `Bearer ${kljuc}` } }
  );
  const vse = (await r.json()) as Vrstica[];
  // Naključni izbor iz paketa, da ne merimo vedno istega dela abecede.
  const vzorec = vse.sort(() => Math.random() - 0.5).slice(0, koliko);

  let najdenih = 0;
  let brezZadetka = 0;
  let zavrnjenih = 0;
  let porabaIskanj = 0;

  for (const v of vzorec) {
    const ime = (v.kratki_naziv || v.naziv).split(",")[0].trim();
    const poizvedba = [ime, v.kraj].filter(Boolean).join(" ");
    const zetoni = identifyingTokens(v.kratki_naziv || v.naziv);
    const davcna = (v.davcna ?? "").replace(/\D/g, "");
    let izid = "—";
    try {
      porabaIskanj += 1;
      const zadetki = await searchWeb(poizvedba, { limit: 8 });
      const kandidati = zadetki
        .map((z) => hostOf(z.url ?? ""))
        .filter((h): h is string => Boolean(h))
        .filter((h) => !BLOCKED_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`)));
      const enkratni = [...new Set(kandidati)].slice(0, 5);

      for (const host of enkratni) {
        try {
          const o = await providerFetch("website", `https://${host}`, { maxAttempts: 1, timeoutMs: 8_000 });
          if (!o.ok || !jeBesedilnaStran(o)) continue;
          const { besedilo } = await preberiTeloOmejeno(o);
          const dokaz = pageBelongsToCompany(stripHtmlToText(besedilo), host, zetoni, davcna);
          if (dokaz) {
            najdenih += 1;
            izid = `NAJDENA https://${host} — ${dokaz}`;
            break;
          }
          zavrnjenih += 1;
          izid = `${host} brez dokaza`;
        } catch {
          izid = `${host} se ni odzval`;
        }
      }
      if (izid === "—") {
        brezZadetka += 1;
        izid = enkratni.length === 0 ? "iskalnik ni vrnil uporabnih zadetkov" : "noben zadetek ni prestal dokaza";
      }
    } catch (e) {
      izid = `iskanje ni uspelo: ${e instanceof Error ? e.message.slice(0, 80) : e}`;
    }
    console.log(`${ime.slice(0, 34).padEnd(34)} | ${izid}`);
  }

  console.log(
    `\nvzorec ${vzorec.length} (prioriteta ${prioriteta}): NAJDENIH ${najdenih} = ${Math.round((najdenih / vzorec.length) * 100)} %` +
      `, brez zadetka ${brezZadetka}, zavrnjenih brez dokaza ${zavrnjenih}` +
      `\nporabljenih iskanj pri Firecrawl: ${porabaIskanj}`
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
