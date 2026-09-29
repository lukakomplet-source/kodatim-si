import { readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";

/**
 * Drugi krog obogatitve registra s Firecrawl iskalnikom — v okviru kreditov.
 *
 * Prvi krog je pri 228.554 podjetjih lahko samo ugibal domeno, ker DuckDuckGo
 * od 17. 9. 2026 vrača CAPTCHO. Firecrawl na brezplačnem paketu da 1.000
 * kreditov na mesec (preverjeno 28. 9. 2026), zato jih porabimo tam, kjer je
 * izplen največji: d.o.o./d.d. (izmerjeno 21 % s stranjo, s.p. 2 %) z
 * razločnim imenom (pri „AB d.o.o.“ iskalnik ne najde ničesar zanesljivega).
 *
 * Stran šteje samo, če prestane ISTI dokaz lastništva kot v redni poti
 * (davčna, celotno ime ali razločna beseda na strani) — nič se ne ugiba.
 *
 *   npx tsx scripts/obogati-z-iskalnikom.ts [najvec_podjetij]
 */

type ModuleLoadFn = (request: string, ...rest: unknown[]) => unknown;
const M = Module as unknown as { _load: ModuleLoadFn };
const izvirni = M._load;
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return izvirni.call(this, request, ...rest);
};
for (const v of readFileSync(resolve(process.cwd(), ".env.local"), "utf-8").split("\n")) {
  const t = v.trim();
  const i = t.indexOf("=");
  if (!t || t.startsWith("#") || i < 0) continue;
  const k = t.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = t.slice(i + 1).trim().replace(/^"(.*)"$/, "$1");
}

const LOG = "C:\\Users\\lukak\\avtonet-db\\iskalnik-drugi-krog.log";
const DB = process.env.AVTONET_DB_URL || "http://localhost:8000";
const KLJUC = process.env.AVTONET_DB_KEY ?? "";
const FC = process.env.FIRECRAWL_API_KEY ?? "";
/** Ne porabimo zadnjih kreditov — za ročna iskanja v Lead Intelligence. */
const REZERVA_KREDITOV = 30;

function log(m: string): void {
  const vrstica = `${new Date().toISOString()} ${m}`;
  console.log(vrstica);
  try {
    appendFileSync(LOG, vrstica + "\n");
  } catch {
    // ni razlog za padec
  }
}

async function krediti(): Promise<number | null> {
  try {
    const r = await fetch("https://api.firecrawl.dev/v1/team/credit-usage", { headers: { Authorization: `Bearer ${FC}` } });
    const j = (await r.json()) as { data?: { remaining_credits?: number } };
    return j.data?.remaining_credits ?? null;
  } catch {
    return null;
  }
}

type Vrstica = {
  id: number;
  naziv: string;
  kratki_naziv: string | null;
  kraj: string | null;
  davcna: string | null;
  spletna_stran: string | null;
  eposta: string | null;
  telefon: string | null;
};

async function main(): Promise<void> {
  const najvec = Number(process.argv[2] ?? 1000);
  const { searchWeb } = await import("@/lib/firecrawl");
  const { hostOf, identifyingTokens, pageBelongsToCompany } = await import("@/lib/publicEnrichment/websiteSearch");
  const { providerFetch, preberiTeloOmejeno, jeBesedilnaStran } = await import("@/lib/publicEnrichment/httpClient");
  const { stripHtmlToText } = await import("@/lib/publicEnrichment/htmlText");
  const { BLOCKED_DOMAINS } = await import("@/lib/enrichment/blockedDomains");
  const { kontaktiSSpleta } = await import("@/lib/publicEnrichment/registerSplet");

  const zacetni = await krediti();
  log(`Drugi krog z iskalnikom: kreditov na voljo ${zacetni}, rezerva ${REZERVA_KREDITOV}.`);
  if (zacetni === null || zacetni <= REZERVA_KREDITOV) return;

  // Prioriteta 1 = d.o.o./d.d. (dodeli jo delavec), brez e-pošte, še v registru.
  const r = await fetch(
    `${DB}/rest/v1/podjetja_register?select=id,naziv,kratki_naziv,kraj,davcna,spletna_stran,eposta,telefon` +
      `&splet_status=eq.brez_iskanja&splet_prioriteta=eq.1&eposta=is.null&ni_vec_od=is.null&limit=6000`,
    { headers: { apikey: KLJUC, Authorization: `Bearer ${KLJUC}` } }
  );
  const vse = (await r.json()) as Vrstica[];
  // Razločno ime: vsaj ena beseda s 6+ črkami, ki ni splošna (identifyingTokens
  // že izloči „storitve“, „trgovina“ ipd.).
  const obetavni = vse
    .filter((v) => identifyingTokens(v.kratki_naziv || v.naziv).some((t) => t.length >= 6))
    .sort(() => Math.random() - 0.5)
    .slice(0, najvec);
  log(`Izbranih ${obetavni.length} od ${vse.length} (razločno ime).`);

  let iskanj = 0;
  let najdenih = 0;
  let zEposto = 0;
  let sTelefonom = 0;
  let ustavi = false;

  /** Lastna stran je ena na podjetje: domena, ki jo že ima drugo podjetje, ni ta. */
  const zeDrugega = async (host: string): Promise<boolean> => {
    const golo = host.replace(/^www\./, "");
    const r2 = await fetch(`${DB}/rest/v1/podjetja_register?select=id&spletna_stran=ilike.*${encodeURIComponent(golo)}&limit=1`, {
      headers: { apikey: KLJUC, Authorization: `Bearer ${KLJUC}` },
    });
    return ((await r2.json()) as unknown[]).length > 0;
  };

  const iskalnik = async (vhod: { naziv: string; kratkiNaziv?: string | null; kraj?: string | null; davcna?: string | null }, preizkuseni: string[]) => {
    const ime = (vhod.kratkiNaziv || vhod.naziv).split(",")[0].trim();
    const zetoni = identifyingTokens(vhod.kratkiNaziv || vhod.naziv);
    const davcna = (vhod.davcna ?? "").replace(/\D/g, "");
    iskanj += 1;
    let zadetki;
    try {
      zadetki = await searchWeb([ime, vhod.kraj].filter(Boolean).join(" "), { limit: 5 });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/402|credit|insufficient/i.test(m)) ustavi = true;
      throw e;
    }
    const hosti = [...new Set(zadetki.map((z) => hostOf(z.url ?? "")).filter((h): h is string => Boolean(h)))]
      .filter((h) => !BLOCKED_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`)))
      .filter((h) => !preizkuseni.includes(h))
      .slice(0, 3);
    for (const host of hosti) {
      try {
        const o = await providerFetch("website", `https://${host}`, { maxAttempts: 1, timeoutMs: 8_000 });
        if (!o.ok || !jeBesedilnaStran(o)) {
          await o.body?.cancel().catch(() => {});
          continue;
        }
        const { besedilo } = await preberiTeloOmejeno(o);
        const tekst = stripHtmlToText(besedilo);
        const dokaz = pageBelongsToCompany(tekst, host, zetoni, davcna);
        // Iskalnik rad vrne imenike, ki podjetje samo NAŠTEVAJO (28. 9. 2026:
        // javnipodatki.si, parcelnik.si). Zato pri iskanju velja samo močan
        // dokaz — davčna ali celotno ime — ne ena razločna beseda.
        if (!dokaz || !/dav[cč]na|celotno ime/i.test(dokaz)) continue;
        // Imenik ima na isti strani več različnih davčnih številk.
        const davcne = new Set(tekst.match(/\b(?:SI\s?)?\d{8}\b/g) ?? []);
        if (davcne.size >= 3) continue;
        if (await zeDrugega(host)) continue;
        return { host, opomba: `najdena s Firecrawl iskanjem (${host}) — ${dokaz}` };
      } catch {
        // naslednji zadetek
      }
    }
    return null;
  };

  for (const [i, v] of obetavni.entries()) {
    if (ustavi) break;
    if (i % 20 === 0) {
      const k = await krediti();
      if (k !== null && k <= REZERVA_KREDITOV) {
        log(`Kreditov ostalo ${k} — ustavljam (rezerva).`);
        break;
      }
    }
    try {
      const o = await kontaktiSSpleta({ naziv: v.naziv, kratkiNaziv: v.kratki_naziv, kraj: v.kraj, davcna: v.davcna, iskalnik });
      const posodobitev: Record<string, unknown> = {
        splet_ob: new Date().toISOString(),
        splet_status: o.stanje,
        splet_opomba: o.opomba.slice(0, 400) || null,
      };
      if (o.stanje === "najdena") {
        najdenih += 1;
        if (!v.spletna_stran && o.spletnaStran) posodobitev.spletna_stran = o.spletnaStran;
        if (!v.eposta && o.eposta) {
          posodobitev.eposta = o.eposta;
          zEposto += 1;
        }
        if (!v.telefon && o.telefon) {
          posodobitev.telefon = o.telefon;
          sTelefonom += 1;
        }
        posodobitev.detajli_status = "splet";
      }
      await fetch(`${DB}/rest/v1/podjetja_register?id=eq.${v.id}`, {
        method: "PATCH",
        headers: { apikey: KLJUC, Authorization: `Bearer ${KLJUC}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(posodobitev),
      });
      if (o.stanje === "najdena") log(`  NAJDENA ${v.naziv.slice(0, 50)} -> ${o.spletnaStran} ${o.eposta ?? ""} ${o.telefon ?? ""}`);
    } catch (e) {
      log(`  napaka ${v.naziv.slice(0, 40)}: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
    }
    if ((i + 1) % 25 === 0) log(`Napredek: ${i + 1} podjetij, ${iskanj} iskanj, najdenih ${najdenih}, e-pošt ${zEposto}, telefonov ${sTelefonom}.`);
  }
  const konec = await krediti();
  log(
    `KONEC: ${iskanj} iskanj, najdenih strani ${najdenih}, novih e-pošt ${zEposto}, telefonov ${sTelefonom}; ` +
      `kreditov prej ${zacetni}, zdaj ${konec} (${zacetni !== null && konec !== null ? ((zacetni - konec) / Math.max(1, iskanj)).toFixed(2) : "?"} na iskanje).`
  );
}

main().catch((e) => {
  log(`Usodna napaka: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
});
