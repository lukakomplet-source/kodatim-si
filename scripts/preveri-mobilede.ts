import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";

/**
 * Ali specifikacija za mobile.de na PRAVIH izginulih oglasih obrodi kaj
 * uporabnega — in ali se kje kaj izmisli.
 *
 * Pogleda troje: (1) da JSON od AI sploh pride in se razčleni, (2) da so
 * razponi aritmetično skladni z oglasom, (3) da v obvezni opremi ni izraza,
 * ki mu v oglasu nič ne ustreza (najpogostejši način, da model „doda“ opremo).
 *
 *   npx tsx scripts/preveri-mobilede.ts [koliko]
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
  avtonet_id: string;
  naziv: string | null;
  znamka: string | null;
  model: string | null;
  letnik: number | null;
  km: number | null;
  kw: number | null;
  gorivo: string | null;
  menjalnik: string | null;
  pogon: string | null;
  cena_eur: number | null;
  karoserija: string | null;
  oprema_kljucna: Record<string, unknown> | null;
};

/** Isti prevod kot v knjižnici — sonda ga potrebuje za preverjanje podmnožice. */
let nemskoZaSlug: (slug: string) => string | undefined = () => undefined;

async function main(): Promise<void> {
  naloziOkolje();
  const knjiznica = await import("@/lib/avtonet/mobileDeSpec");
  const { pripraviMobileDe } = knjiznica;
  nemskoZaSlug = knjiznica.nemskiIzrazZaOpremo;
  const koliko = Number(process.argv[2] ?? 3);
  const db = process.env.AVTONET_DB_URL || "http://localhost:8000";
  const kljuc = process.env.AVTONET_DB_KEY ?? "";

  const r = await fetch(
    `${db}/rest/v1/avtonet_oglasi?select=avtonet_id,naziv,znamka,model,letnik,km,kw,gorivo,menjalnik,pogon,cena_eur,karoserija,oprema_kljucna` +
      `&status=neq.aktiven&cena_eur=not.is.null&kw=not.is.null&order=status_spremenjen.desc&limit=${koliko}`,
    { headers: { apikey: kljuc, Authorization: `Bearer ${kljuc}` } }
  );
  if (!r.ok) throw new Error(`baza ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const vrstice = (await r.json()) as Vrstica[];
  console.log(`preizkušam ${vrstice.length} izginulih oglasov\n`);

  for (const v of vrstice) {
    const oprema = Object.keys(v.oprema_kljucna ?? {});
    const zacetek = Date.now();
    const izid = await pripraviMobileDe({
      znamka: v.znamka,
      model: v.model,
      naziv: v.naziv,
      letnik: v.letnik,
      km: v.km,
      kw: v.kw,
      gorivo: v.gorivo,
      menjalnik: v.menjalnik,
      pogon: v.pogon,
      karoserija: v.karoserija,
      oprema,
      cena: v.cena_eur,
    });
    const ms = Date.now() - zacetek;

    console.log(`— ${v.naziv ?? `${v.znamka} ${v.model}`}`);
    console.log(`  vhod: ${v.letnik} · ${v.km?.toLocaleString("sl-SI")} km · ${v.kw} kW · ${v.gorivo ?? "?"} · ${v.menjalnik ?? "?"} · ${v.pogon ?? "?"}`);
    console.log(`  oprema v bazi (${oprema.length}): ${oprema.join(", ") || "—"}`);
    console.log(`  iskalniNiz: ${izid.iskalniNiz}`);
    const r2 = izid.razponi;
    console.log(`  razponi: EZ ${r2.letoOd}–${r2.letoDo} · do ${r2.kmDo?.toLocaleString("sl-SI")} km · ${r2.kwOd}–${r2.kwDo} kW (${r2.psOd}–${r2.psDo} PS)`);
    if (izid.nemsko) {
      console.log(`  nemsko: ${izid.nemsko.karoserija ?? "?"} | ${izid.nemsko.kraftstoff ?? "?"} | ${izid.nemsko.getriebe ?? "?"} | ${izid.nemsko.antrieb ?? "?"}`);
      console.log(`  obvezno: ${izid.nemsko.obveznaOprema.join(", ") || "—"}`);
      console.log(`  zaželeno: ${izid.nemsko.zazelenaOprema.join(", ") || "—"}`);
      console.log(`  opozorila: ${izid.nemsko.opozorila.join(" | ") || "—"}`);
    } else {
      console.log(`  BREZ PREVODA: ${izid.opozorilo}`);
    }

    // Preverbe, ki jih lahko naredi koda.
    const napake: string[] = [];
    if (v.letnik && r2.letoOd !== v.letnik - 1) napake.push("letnica od ne ustreza");
    if (v.km && r2.kmDo !== null && r2.kmDo < v.km) napake.push("zgornja meja km je pod kilometri oglasa");
    if (v.kw && r2.kwOd !== null && r2.kwOd > v.kw) napake.push("spodnja meja moči je nad močjo oglasa");
    if (/\d{4}/.test(izid.iskalniNiz)) napake.push("iskalni niz vsebuje letnico (ne sodi vanj)");
    // Oprema mora biti PODMNOŽICA tega, kar ima oglas v bazi: nemški izrazi
    // pridejo iz preslikave po slugih, zato vsak izraz brez svojega sluga
    // pomeni, da se je v seznam prikradlo nekaj, česar avto nima.
    const dovoljeni = new Set(oprema.map((s) => nemskoZaSlug(s)).filter(Boolean));
    for (const o of [...(izid.nemsko?.obveznaOprema ?? []), ...(izid.nemsko?.zazelenaOprema ?? [])]) {
      if (!dovoljeni.has(o)) napake.push(`"${o}" ne ustreza nobeni opremi tega oglasa`);
    }
    console.log(`  ${napake.length === 0 ? "✓ preverbe v redu" : "✗ " + napake.join("; ")} (${ms} ms)\n`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
