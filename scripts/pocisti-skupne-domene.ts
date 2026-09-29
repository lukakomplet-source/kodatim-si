import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";

/**
 * Počisti spletne strani, ki so pripisane VEČ podjetjem hkrati.
 *
 * 28. 9. 2026: 2.694 podjetij (1.010 domen) je imelo isto stran kot vsaj eno
 * drugo — projekt.si 38×, invest.si 32×, ljubljana.si (občina) 26×. To so
 * ugibanja domene iz splošne besede v imenu, ki jih je spustil šibek dokaz
 * („razločna beseda na strani“). Lastna stran je ena na podjetje.
 *
 * Vsako tako domeno odpremo znova in podjetje OBDRŽI stran samo, če ta navaja
 * njegovo DAVČNO (celotno ime ne zadošča: 9 različnih s.p. „Matej Novak“ bi
 * vsi obdržali matejnovak.si). Povezana podjetja pod isto streho to
 * prestanejo). Ostalim zbrišemo stran, e-pošto in telefon, ki so prišli s te
 * strani, in jih vrnemo v „brez_iskanja“. Kartic AJPES (detajli_status=ok) se
 * ne dotikamo. Prejšnje vrednosti so v podjetja_splet_varnostna_20260929.
 *
 *   npx tsx scripts/pocisti-skupne-domene.ts [--zares]
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

type Vrstica = { id: number; naziv: string; kratki_naziv: string | null; davcna: string | null; spletna_stran: string; detajli_status: string | null };

async function main(): Promise<void> {
  const zares = process.argv.includes("--zares");
  const { identifyingTokens, pageBelongsToCompany } = await import("@/lib/publicEnrichment/websiteSearch");
  const { providerFetch, preberiTeloOmejeno, jeBesedilnaStran } = await import("@/lib/publicEnrichment/httpClient");
  const { stripHtmlToText } = await import("@/lib/publicEnrichment/htmlText");
  const DB = process.env.AVTONET_DB_URL || "http://localhost:8000";
  const K = process.env.AVTONET_DB_KEY ?? "";
  const glave = { apikey: K, Authorization: `Bearer ${K}` };

  const vse: Vrstica[] = [];
  for (let od = 0; ; od += 5000) {
    const r = await fetch(
      `${DB}/rest/v1/podjetja_register?select=id,naziv,kratki_naziv,davcna,spletna_stran,detajli_status&spletna_stran=not.is.null&order=id&offset=${od}&limit=5000`,
      { headers: glave }
    );
    const paket = (await r.json()) as Vrstica[];
    vse.push(...paket);
    if (paket.length < 5000) break;
  }
  const domena = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
  const poDomeni = new Map<string, Vrstica[]>();
  for (const v of vse) poDomeni.set(domena(v.spletna_stran), [...(poDomeni.get(domena(v.spletna_stran)) ?? []), v]);
  const samo = process.argv.find((a) => a.startsWith("--domena="))?.slice(9);
  const skupne = [...poDomeni.entries()].filter(([h, vv]) => vv.length >= 2 && (!samo || h === samo));
  console.log(`${vse.length} podjetij s stranjo, ${skupne.length} skupnih domen, ${skupne.reduce((s, [, vv]) => s + vv.length, 0)} podjetij na njih${zares ? "" : " — SUHI TEK, nič ne pišem"}`);

  let obdrzanih = 0;
  let pociscenih = 0;
  let nedosegljivih = 0;
  let i = 0;
  const vrsta = [...skupne];
  const delavec = async () => {
    for (;;) {
      const naslednja = vrsta.shift();
      if (!naslednja) return;
      const [host, podjetja] = naslednja;
      let tekst: string | null = null;
      try {
        const o = await providerFetch("website", `https://${host}`, { maxAttempts: 1, timeoutMs: 10_000 });
        if (o.ok && jeBesedilnaStran(o)) tekst = stripHtmlToText((await preberiTeloOmejeno(o)).besedilo);
        else await o.body?.cancel().catch(() => {});
      } catch {
        // spodaj
      }
      for (const v of podjetja) {
        if (v.detajli_status === "ok") {
          obdrzanih += 1;
          continue;
        }
        const dokaz = tekst
          ? pageBelongsToCompany(tekst, host, identifyingTokens(v.kratki_naziv || v.naziv), (v.davcna ?? "").replace(/\D/g, ""))
          : null;
        if (samo) console.log(`  ${dokaz && /dav[cč]na/i.test(dokaz) ? "OBDRŽI" : "počisti"} ${v.naziv.slice(0, 60)} | ${dokaz ?? "brez dokaza"}`);
        if (dokaz && /dav[cč]na/i.test(dokaz)) {
          obdrzanih += 1;
          continue;
        }
        if (!tekst) nedosegljivih += 1;
        pociscenih += 1;
        if (zares) {
          await fetch(`${DB}/rest/v1/podjetja_register?id=eq.${v.id}`, {
            method: "PATCH",
            headers: { ...glave, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({
              spletna_stran: null,
              eposta: null,
              telefon: null,
              splet_status: "brez_iskanja",
              detajli_status: "splet_ni",
              splet_opomba: `očiščeno 29. 9. 2026: ${host} je bila pripisana ${podjetja.length} podjetjem, stran ne navaja davčne ne celotnega imena${tekst ? "" : " (stran se ni odzvala)"}`,
            }),
          });
        }
      }
      if (++i % 100 === 0) console.log(`  ${i}/${skupne.length} domen: obdržanih ${obdrzanih}, počiščenih ${pociscenih}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, delavec));
  console.log(`KONEC: obdržanih ${obdrzanih}, počiščenih ${pociscenih} (od tega stran nedosegljiva ${nedosegljivih})${zares ? "" : " — suhi tek"}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
