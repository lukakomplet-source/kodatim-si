/**
 * Vpiše manjkajočo SKD kodo leadom, ki so bili uvoženi brez nje.
 *
 *   npx tsx --conditions=react-server scripts/popravi-skd.mts 77.110,77.120,46.710
 *   npx tsx --conditions=react-server scripts/popravi-skd.mts 77.110 --zares
 *
 * Zakaj je to potrebno: SKD koda je na AJPES DETAJL strani, ki jo način „samo
 * kontakti“ namenoma preskoči. 17. 08. je zato 862 od 891 uvoženih podjetij
 * pristalo brez kode — in kampanja, ki cilja po SKD, jih ni videla, čeprav so
 * bila najdena točno po tisti kodi.
 *
 * Kodo tu ne ugibamo: za vsako podano kodo znova vprašamo AJPES (isto iskanje,
 * kot ga je opravil Lead skrejp) in kodo vpišemo samo podjetjem, ki jih register
 * pod njo res vrne. Ujemanje po matični → davčni → imenu, v tem vrstnem redu.
 *
 * Privzeto samo poroča; zapiše šele z `--zares`.
 */

import { readFileSync, existsSync } from "node:fs";

for (const pot of [".env.local", ".env"]) {
  if (!existsSync(pot)) continue;
  for (const vrstica of readFileSync(pot, "utf8").split(/\r?\n/)) {
    const m = vrstica.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const { createClient } = await import("@supabase/supabase-js");
const { runSlice, fetchMunicipalities } = await import("../src/lib/publicEnrichment/ajpesExhaustive.ts");
const { skdByCode } = await import("../src/lib/skd.ts");

const args = process.argv.slice(2);
const zares = args.includes("--zares");
const kode = (args.find((a) => !a.startsWith("--")) ?? "")
  .split(/[,;\s]+/)
  .map((k) => k.trim())
  .filter(Boolean);

if (kode.length === 0) {
  console.log("Uporaba: popravi-skd.mts 77.110,46.710 [--zares]");
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/** Vsi leadi, po straneh — PostgREST vrne največ 1000 na poizvedbo. */
type Lead = {
  id: string;
  company_name: string;
  vat_id: string | null;
  custom_fields: Record<string, string> | null;
};
const leadi: Lead[] = [];
for (let od = 0; ; od += 1000) {
  const { data, error } = await db
    .from("intel_leads")
    .select("id, company_name, vat_id, custom_fields")
    .range(od, od + 999);
  if (error) throw new Error(error.message);
  const kos = (data ?? []) as Lead[];
  leadi.push(...kos);
  if (kos.length < 1000) break;
}

const kljuc = (v: string | null | undefined) => (v ?? "").replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
const poMaticni = new Map<string, Lead>();
const poDavcni = new Map<string, Lead>();
const poImenu = new Map<string, Lead>();
for (const l of leadi) {
  const mat = kljuc(l.custom_fields?.registration_number);
  const dav = kljuc(l.vat_id);
  if (mat) poMaticni.set(mat, l);
  if (dav) poDavcni.set(dav, l);
  poImenu.set(l.company_name.trim().toLowerCase(), l);
}
console.log(`leadov v bazi: ${leadi.length} (brez SKD: ${leadi.filter((l) => !l.custom_fields?.skd_code).length})`);

const obcine = await fetchMunicipalities();
const posodobitve = new Map<string, { koda: string; ime: string; lead: Lead }>();
let zeImajo = 0;
let neNajdeni = 0;

for (const koda of kode) {
  const ime = skdByCode(koda)?.label ?? "";
  // Enako kot Lead skrejp: če koda preseže 100 zadetkov, gremo po občinah.
  const koren = await runSlice({ activity: koda, status: "1", isRoot: true });
  const rezine = koren.children.length > 0 ? koren.children : [];
  const vrstice = [...koren.rows];
  for (const r of rezine) {
    const izid = await runSlice(r);
    vrstice.push(...izid.rows);
    process.stdout.write(`\r  ${koda}: ${vrstice.length} vrstic (${r.municipality ?? ""})            `);
  }
  console.log(`\r  ${koda} (${ime}): AJPES vrnil ${vrstice.length} podjetij${obcine.length ? "" : ""}`);

  for (const v of vrstice) {
    const najden =
      poMaticni.get(kljuc(v.registrationNumber)) ??
      poDavcni.get(kljuc(v.vatId)) ??
      poImenu.get(v.name.trim().toLowerCase()) ??
      (v.shortName ? poImenu.get(v.shortName.trim().toLowerCase()) : undefined);
    if (!najden) {
      neNajdeni += 1;
      continue;
    }
    if (najden.custom_fields?.skd_code) {
      zeImajo += 1;
      continue;
    }
    posodobitve.set(najden.id, { koda, ime, lead: najden });
  }
}

console.log(
  `\nza popravek: ${posodobitve.size} leadov · že imajo kodo: ${zeImajo} · v bazi jih ni: ${neNajdeni}`
);
for (const [, p] of [...posodobitve].slice(0, 8)) {
  console.log(`  ${p.lead.company_name.slice(0, 44).padEnd(44)} -> ${p.koda}`);
}

if (!zares) {
  console.log("\n(samo poročilo — za zapis dodaj --zares)");
  process.exit(0);
}

let zapisanih = 0;
for (const [id, p] of posodobitve) {
  const custom = { ...(p.lead.custom_fields ?? {}) };
  custom.skd_code = p.koda;
  if (p.ime && !custom.skd_name) custom.skd_name = p.ime;
  custom.skd_vir = "iskalna koda (dopolnjeno naknadno)";
  const { error } = await db.from("intel_leads").update({ custom_fields: custom }).eq("id", id);
  if (error) console.log(`  napaka pri ${p.lead.company_name}: ${error.message}`);
  else zapisanih += 1;
}
console.log(`\nzapisanih: ${zapisanih}`);
