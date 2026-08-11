import { readFileSync } from "node:fs";
import { razdeliNaziv, ZNAMKE_PRIVZETO } from "./parse.js";

/**
 * Brand/model/trim splitting, checked against real exported titles.
 *
 * The database held one unique "model" per advert — titles like "A6 50 TDI
 * quattro.MATRIX.VIRTUAL.ACC.MRTVI KOT.KEYLES NOVO NOVO 1.registracija 2019
 * Prevoženih 149500 km …" were being stored in the model column — which makes
 * every per-model statistic meaningless. This measures how many titles now
 * split into a plausible model instead of asserting that they do.
 *
 *   npm run test:nazivi -- "C:\\Users\\...\\sbn-auto-baza.csv"
 */

/** Same cut parseRowText applies before the title is split. */
const ZACETEK_SPECIFIKACIJE = /\b(1\.\s*registracija|Prevoženih|Gorivo|Menjalnik|Motor\s+\d|Pokliči)\b/i;

function ocisti(naziv: string): string {
  const predCeno = naziv.split(/\d[\d.]*\s*€/)[0] ?? naziv;
  const meja = predCeno.search(ZACETEK_SPECIFIKACIJE);
  return (meja > 0 ? predCeno.slice(0, meja) : predCeno).trim().slice(0, 200);
}

/** Minimal CSV reader for the export's own dialect: ';' separated, '"' quoted. */
function vrsticeCsv(vsebina: string): string[][] {
  const out: string[][] = [];
  let polje = "";
  let vrstica: string[] = [];
  let vNarekovajih = false;

  for (let i = 0; i < vsebina.length; i++) {
    const c = vsebina[i];
    if (vNarekovajih) {
      if (c === '"') {
        if (vsebina[i + 1] === '"') {
          polje += '"';
          i++;
        } else vNarekovajih = false;
      } else polje += c;
    } else if (c === '"') vNarekovajih = true;
    else if (c === ";") {
      vrstica.push(polje);
      polje = "";
    } else if (c === "\n") {
      vrstica.push(polje);
      out.push(vrstica);
      vrstica = [];
      polje = "";
    } else if (c !== "\r") polje += c;
  }
  if (polje || vrstica.length > 0) {
    vrstica.push(polje);
    out.push(vrstica);
  }
  return out;
}

function main(): void {
  const pot = process.argv[2];
  if (!pot) {
    console.error("Uporaba: npm run test:nazivi -- <pot-do-csv>");
    process.exit(1);
  }

  const vrstice = vrsticeCsv(readFileSync(pot, "utf8"));
  const glava = vrstice[0];
  const iNaziv = glava.indexOf("naziv");
  const iZnamka = glava.indexOf("znamka");
  const iModel = glava.indexOf("model");
  if (iNaziv === -1) {
    console.error("V CSV ni stolpca 'naziv'.");
    process.exit(1);
  }

  const znane = new Set(ZNAMKE_PRIVZETO.map((z) => z.toLowerCase()));
  let skupaj = 0;
  let znamkaOk = 0;
  let modelKratek = 0;
  let modelDolgPrej = 0;
  const primeri: string[] = [];

  for (const v of vrstice.slice(1)) {
    const naziv = v[iNaziv];
    if (!naziv) continue;
    skupaj++;

    const staryModel = iModel >= 0 ? (v[iModel] ?? "") : "";
    if (staryModel.length > 40) modelDolgPrej++;

    const r = razdeliNaziv(ocisti(naziv));
    if (r.znamka && znane.has(r.znamka.toLowerCase())) znamkaOk++;
    if (r.model && r.model.length <= 40) modelKratek++;

    if (primeri.length < 12) {
      primeri.push(
        `  ${(iZnamka >= 0 ? v[iZnamka] : "?").padEnd(14)} | ${r.znamka ?? "—"} / ${r.model ?? "—"} / ${
          r.verzija?.slice(0, 46) ?? "—"
        }`
      );
    }
  }

  console.log("PRIMERI (znamka iz baze | nova znamka / model / verzija):");
  console.log(primeri.join("\n"));
  console.log("");
  console.log(`Vrstic:                        ${skupaj}`);
  console.log(`Znamka prepoznana:             ${znamkaOk} (${((znamkaOk / skupaj) * 100).toFixed(1)} %)`);
  console.log(`Model kratek (<=40 znakov):    ${modelKratek} (${((modelKratek / skupaj) * 100).toFixed(1)} %)`);
  console.log(`Model predolg PREJ (v bazi):   ${modelDolgPrej} (${((modelDolgPrej / skupaj) * 100).toFixed(1)} %)`);

  const uspeh = znamkaOk / skupaj > 0.95 && modelKratek / skupaj > 0.95;
  console.log("");
  console.log(uspeh ? "TEST USPESEN." : "TEST NI USPEL — razclenjevanje se ni dovolj zanesljivo.");
  if (!uspeh) process.exitCode = 1;
}

main();
