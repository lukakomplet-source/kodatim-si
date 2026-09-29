import { preberiZip } from "./zip.js";

/**
 * Najmanjši bralnik XLSX: list → vrstice celic (besedilo). XLSX je ZIP z XML-jem:
 *   xl/workbook.xml              imena listov in njihovi rId
 *   xl/_rels/workbook.xml.rels   rId → pot do lista
 *   xl/sharedStrings.xml         skupna besedila (celica t="s" hrani indeks)
 *   xl/worksheets/sheetN.xml     celice <c r="B7" t="s"><v>12</v></c>
 * Formule in slogi nas ne zanimajo — beremo shranjene vrednosti.
 */
const ent = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function stolpec(ref: string): number {
  const crke = ref.match(/^[A-Z]+/)?.[0] ?? "A";
  let n = 0;
  for (const c of crke) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

export function preberiXlsx(buf: Buffer): Map<string, string[][]> {
  const vnosi = new Map(preberiZip(buf).map((v) => [v.ime, v.podatki.toString("utf8")]));
  const skupna: string[] = [];
  for (const si of (vnosi.get("xl/sharedStrings.xml") ?? "").split("<si>").slice(1)) {
    // Besedilo je lahko razdeljeno na več <t> (obogateno besedilo).
    skupna.push(ent([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("")));
  }
  const rel = new Map<string, string>();
  for (const m of (vnosi.get("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    rel.set(m[1], m[2].replace(/^\/?xl\//, ""));
  }
  const listi = new Map<string, string[][]>();
  for (const m of (vnosi.get("xl/workbook.xml") ?? "").matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const pot = rel.get(m[2]);
    const xml = pot ? vnosi.get(`xl/${pot}`) : undefined;
    if (!xml) continue;
    const vrstice: string[][] = [];
    for (const r of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const vrstica: string[] = [];
      for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const tip = c[2].match(/t="([^"]+)"/)?.[1];
        const v = c[3]?.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? c[3]?.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
        vrstica[stolpec(c[1])] = tip === "s" ? skupna[Number(v)] ?? "" : ent(v);
      }
      vrstice[Number(r[1]) - 1] = Array.from(vrstica, (x) => (x ?? "").trim());
    }
    listi.set(ent(m[1]), Array.from(vrstice, (x) => x ?? []));
  }
  return listi;
}
