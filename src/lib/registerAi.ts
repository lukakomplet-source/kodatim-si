import "server-only";
import { chatJSON } from "@/lib/openai";
import skdKode from "@/lib/publicEnrichment/skdCodes.json";

/**
 * AI iskanje po registru: stavek („frčade Vojnik“) -> filtri.
 *
 * AI podjetij NE išče in jih ne našteva — samo prevede stavek v dejavnosti
 * (SKD šifre), besede v nazivu in kraj. Podjetja pridejo iz baze, zato AI ne
 * more izmisliti podjetja, ki ga ni. Šifre preverimo proti pravemu seznamu:
 * model, ki vrne „43.34“ (je ni), bi sicer tiho dal nič zadetkov.
 */

type Koda = { code: string; label: string };
const KODE = skdKode as Koda[];
const SEZNAM = KODE.map((k) => `${k.code} ${k.label}`).join("\n");
const NAZIV = new Map(KODE.map((k) => [k.code, k.label]));

const SISTEM = `Si pomočnik za iskanje po slovenskem poslovnem registru (AJPES).
Uporabnik opiše, kakšno podjetje išče in kje. Vrneš SAMO filtre, nikoli imen podjetij.

Vrni JSON:
{
  "skd": ["43.910", ...],      // 1-8 šifer SKD iz spodnjega seznama, ki NAJBOLJ ustrezajo dejavnosti; točno tako zapisane
  "besede": ["krov", ...],     // 0-5 kratkih korenov besed, ki jih tako podjetje verjetno ima v NAZIVU (brez končnic: "keramik", "estrih", "krov", "gradbe")
  "kraj": "Vojnik" | null,     // kraj ali občina v imenovalniku, brez poštne številke; null, če ni naveden
  "razlaga": "…"               // ena kratka poved v slovenščini: kaj boš iskal
}

Pravila:
- Šifre izberi SAMO s seznama, 1-5 šifer. Raje manj pravih kot veliko približnih.
- Obrt in storitve na objektu (keramika, estrihi, frčade, strehe, fasade, pleskanje, okna) so GRADBENA DELA
  (41.*, 43.*), NE proizvodnja (23.*). Proizvodnjo izberi samo, če uporabnik reče "proizvodnja", "izdelava", "tovarna".
- "gradbeno podjetje" = 41.000, 43.910, 43.990, 42.990; ne elektro in ne vodovod, razen če to reče.
- Besede: samo korenine, ki so v NAZIVIH takih podjetij res pogoste, vsaj 4 črke; nikoli splošnih ali
  besed, ki so tudi priimki ali drugi pojmi ("grad" = Gradišnik, "gospod", "obla" = oblačila, "cera").
- Sklanjaj kraj v imenovalnik: "v Celju" -> "Celje", "na Ptuju" -> "Ptuj".

Primeri:
- "keramika vojnik" -> skd ["43.330"], besede ["keramik", "keramičar"], kraj "Vojnik"
- "estrihi vojnik" -> skd ["43.330", "43.350", "43.990"], besede ["estrih", "tlak"], kraj "Vojnik"
- "frčade vojnik" -> skd ["43.410", "43.910"], besede ["krov", "kleparst", "ostrešj"], kraj "Vojnik"
- "gradbeno podjetje celje" -> skd ["41.000", "43.910", "43.990"], besede ["gradbe", "zidar"], kraj "Celje"

SEZNAM SKD:
${SEZNAM}`;

function niz(v: unknown, najvec: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, najvec) : null;
}

export type AiFiltri = { skd: string[]; besede: string[]; kraj: string | null; razlaga: string | null };

export async function aiFiltriRegistra(vprasanje: string): Promise<AiFiltri> {
  type Surovo = { skd?: unknown; besede?: unknown; kraj?: unknown; razlaga?: unknown };
  // gpt-4o, ker je 26. 9. 2026 gpt-4o-mini pri novih vprašanjih izbiral širše
  // (slikopleskar v Celju: 118 zadetkov z barvami in fasadami, gpt-4o 28).
  // Seznam šifer je ~6.800 žetonov, račun pa ima za gpt-4o 30.000 na minuto:
  // ob 429 raje odgovori mini, kot da iskanje pade.
  let izid: Surovo;
  try {
    izid = await chatJSON<Surovo>(SISTEM, vprasanje, { temperature: 0, model: process.env.REGISTER_AI_MODEL || "gpt-4o" });
  } catch (e) {
    if (!(e instanceof Error && e.message.includes("(429)"))) throw e;
    izid = await chatJSON<Surovo>(SISTEM, vprasanje, { temperature: 0, model: "gpt-4o-mini" });
  }
  const skd = (Array.isArray(izid.skd) ? izid.skd : [])
    .map((k) => String(k).trim())
    .filter((k) => NAZIV.has(k))
    .slice(0, 8);
  const besede = (Array.isArray(izid.besede) ? izid.besede : [])
    .map((b) => String(b).trim().toLowerCase().replace(/[^\p{L}\p{N} -]/gu, ""))
    .filter((b) => b.length >= 4)
    .slice(0, 5);
  return { skd, besede, kraj: niz(izid.kraj, 60), razlaga: niz(izid.razlaga, 300) };
}
