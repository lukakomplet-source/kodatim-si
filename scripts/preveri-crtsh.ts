import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";

/**
 * Ali javni dnevniki SSL certifikatov (crt.sh) najdejo stran podjetja, ki je
 * ugibanje domene ni? Brez ključa, brez CAPTCHE, brez stroška. SAMO MERI —
 * v bazo ne piše ničesar.
 *
 *   npx tsx scripts/preveri-crtsh.ts [koliko]
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
const spanec = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Vrstica = { id: number; naziv: string; kratki_naziv: string | null; kraj: string | null; davcna: string | null };

async function main(): Promise<void> {
  const koliko = Number(process.argv[2] ?? 40);
  const { identifyingTokens, pageBelongsToCompany } = await import("@/lib/publicEnrichment/websiteSearch");
  const { providerFetch, preberiTeloOmejeno, jeBesedilnaStran } = await import("@/lib/publicEnrichment/httpClient");
  const { stripHtmlToText } = await import("@/lib/publicEnrichment/htmlText");
  const { kandidatiDomen } = await import("@/lib/publicEnrichment/registerSplet");
  const DB = process.env.AVTONET_DB_URL || "http://localhost:8000";
  const K = process.env.AVTONET_DB_KEY ?? "";

  const r = await fetch(
    `${DB}/rest/v1/podjetja_register?select=id,naziv,kratki_naziv,kraj,davcna&splet_status=eq.brez_iskanja&splet_prioriteta=eq.1&eposta=is.null&ni_vec_od=is.null&limit=4000`,
    { headers: { apikey: K, Authorization: `Bearer ${K}` } }
  );
  const vzorec = ((await r.json()) as Vrstica[])
    .filter((v) => identifyingTokens(v.kratki_naziv || v.naziv).some((t) => t.length >= 5))
    .sort(() => Math.random() - 0.5)
    .slice(0, koliko);

  let najdenih = 0;
  let poizvedb = 0;
  let napakCrt = 0;
  const zacetek = Date.now();
  for (const v of vzorec) {
    const zetoni = identifyingTokens(v.kratki_naziv || v.naziv);
    const kljucni = [...zetoni].sort((a, b) => b.length - a.length)[0];
    const davcna = (v.davcna ?? "").replace(/\D/g, "");
    const ugibane = new Set(kandidatiDomen(v.kratki_naziv, v.naziv));
    let izid = "—";
    try {
      poizvedb += 1;
      const odg = await fetch(`https://crt.sh/?q=${encodeURIComponent(`%${kljucni}%`)}&output=json&exclude=expired`, {
        signal: AbortSignal.timeout(40_000),
        headers: { "User-Agent": "kodatim-register/1.0 (luka.komplet@gmail.com)" },
      });
      if (!odg.ok) throw new Error(`crt.sh ${odg.status}`);
      const zapisi = (await odg.json()) as { name_value: string }[];
      const domene = [
        ...new Set(
          zapisi
            .flatMap((z) => z.name_value.split("\n"))
            .map((d) => d.toLowerCase().replace(/^\*\./, "").replace(/^www\./, ""))
            .filter((d) => /\.(si|com|eu|net)$/.test(d) && d.split(".").length === 2)
            .filter((d) => !ugibane.has(d))
        ),
      ].slice(0, 6);
      for (const host of domene) {
        try {
          const o = await providerFetch("website", `https://${host}`, { maxAttempts: 1, timeoutMs: 8_000 });
          if (!o.ok || !jeBesedilnaStran(o)) {
            await o.body?.cancel().catch(() => {});
            continue;
          }
          const tekst = stripHtmlToText((await preberiTeloOmejeno(o)).besedilo);
          const dokaz = pageBelongsToCompany(tekst, host, zetoni, davcna);
          if (dokaz && /dav[cč]na|celotno ime/i.test(dokaz)) {
            izid = `NAJDENA ${host} — ${dokaz}`;
            najdenih += 1;
            break;
          }
        } catch {
          // naslednja
        }
      }
      if (izid === "—") izid = `${domene.length} domen s „${kljucni}“, nobena ne prestane dokaza`;
    } catch (e) {
      napakCrt += 1;
      izid = `crt.sh napaka: ${e instanceof Error ? e.message.slice(0, 60) : e}`;
    }
    console.log(`${(v.kratki_naziv || v.naziv).slice(0, 36).padEnd(36)} | ${izid}`);
    await spanec(3_000); // vljudno do brezplačne storitve
  }
  const s = (Date.now() - zacetek) / 1000;
  console.log(
    `\nVZOREC ${vzorec.length}: najdenih ${najdenih} (${Math.round((100 * najdenih) / vzorec.length)} %), napak crt.sh ${napakCrt}, ${(s / vzorec.length).toFixed(1)} s na podjetje`
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
