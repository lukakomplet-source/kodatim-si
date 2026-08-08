import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";

type ModuleLoadFn = (request: string, ...rest: unknown[]) => unknown;
const ModuleAny = Module as unknown as { _load: ModuleLoadFn };
const originalLoad = ModuleAny._load;
ModuleAny._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, ...rest);
};

function loadEnvLocal(): void {
  const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

/** The resolve-area pipeline, outside the authed route: list -> AI -> gate. */
async function main() {
  const { fetchMunicipalities } = await import("@/lib/publicEnrichment/ajpesExhaustive");
  const { chatJSON } = await import("@/lib/openai");

  const official = await fetchMunicipalities();
  const officialSet = new Set(official);
  console.log(`uradnih občin: ${official.length}\n`);

  const PROMPT = `Uporabnik opiše slovensko OBMOČJE. Tvoja naloga je GEOGRAFSKA: iz svojega znanja
o slovenski geografiji določi, katere občine ležijo v opisanem območju, in jih vrni z imeni
TOČNO takimi, kot so v priloženem uradnem seznamu občin.

POZOR: opisano območje NI ime iz seznama. "Gorenjska" ali "Savinjska regija" ni občina —
je pokrajina/regija, ki VSEBUJE občine iz seznama. Nikoli ne odgovori, da območja "ni v
seznamu"; seznam je samo črkovalnik za tvoj odgovor.

Odgovori IZKLJUČNO z veljavnim JSON objektom s ključema:
"municipalities" (polje nizov — imena občin TOČNO tako, kot so v seznamu) in
"note" (en kratek stavek v slovenščini o tem, kaj si zajel).

Pravila:
- Statistična regija ("Savinjska regija", "Podravska"): naštej VSE njene občine — statistične
  regije imajo tipično od 15 do 35 občin. Nepopoln seznam je napačen odgovor.
- Pokrajinsko ime ("Gorenjska", "Štajerska", "Dolenjska", "Primorska", "Prekmurje"): vse občine,
  ki jim to ime običajno pripada.
- "Okolica X" / "X okolica": občina X in vse sosednje občine do približno 25 km.
- Imena piši črko za črko tako, kot so v seznamu. Ime, ki ga v seznamu ni, bo zavrženo.
- Samo če opis res ni slovensko območje (npr. izmišljen kraj), vrni prazno polje in v "note"
  povej, zakaj.

Primer: "okolica Postojne" -> ["Postojna", "Pivka", "Cerknica", "Ilirska Bistrica", ...]`;

  for (const area of ["Savinjska regija", "Celje okolica", "Gorenjska", "Narnija"]) {
    const ai = await chatJSON<{ municipalities?: string[]; note?: string }>(
      PROMPT,
      `Uradni seznam občin:\n${official.join("\n")}\n\nOpisano območje: ${area}`,
      { temperature: 0.2, model: "gpt-4o" }
    );
    const raw = ai.municipalities ?? [];
    const valid = [...new Set(raw.map((m) => m.trim()).filter((m) => officialSet.has(m)))];
    const rejected = raw.filter((m) => !officialSet.has(m.trim()));
    console.log(`„${area}“ -> ${valid.length} občin (zavrnjenih: ${rejected.length})`);
    console.log(`   ${valid.slice(0, 12).join(", ")}${valid.length > 12 ? " …" : ""}`);
    if (rejected.length > 0) console.log(`   zavrnjeno: ${rejected.join(", ")}`);
    if (ai.note) console.log(`   opomba: ${ai.note}`);
    console.log();
  }
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
