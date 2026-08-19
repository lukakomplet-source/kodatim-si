/**
 * Iz opisa v strukturo — lokalno, brez LLM.
 *
 * Vir sam piše opis v napol strukturirani obliki: prvi segmenti so atributi,
 * ločeni z vejicami ("208,4 m2, samostojna, zgrajena l. 2004, adaptirana l.
 * 2014, 406 m2 zemljišča, K+P+1, ..."), šele nato pride prosto besedilo. To je
 * dar, ki ga LLM ne bi izboljšal — samo podražil in upočasnil. Robots.txt vira
 * poleg tega izrecno pravi ai-train=no; opisi zato nikoli ne potujejo v
 * zunanje modele.
 */

import { createHash } from "node:crypto";

/** Kratek odtis opisa za zaznavo sprememb (ne za varnost). */
export const opisHash = (opis: string | null): string | null =>
  opis ? createHash("sha256").update(opis).digest("hex").slice(0, 16) : null;

export type IzOpisa = {
  povrsinaM2: number | null;
  zemljisceM2: number | null;
  letoIzgradnje: number | null;
  letoAdaptacije: number | null;
  nadstropje: string | null;
  vecEnot: boolean;
  stEnot: number | null;
  stEnotOcena: number | null;
  loceneKuhinje: boolean | null;
  looceniVhodi: boolean | null;
  zaObnovo: boolean;
  zaInvesticijo: boolean;
};

const BESEDNA_STEVILA: Record<string, number> = {
  dve: 2, dvema: 2, dveh: 2, tri: 3, treh: 3, tremi: 3,
  štiri: 4, stiri: 4, štirih: 4, stirih: 4, pet: 5, petih: 5, šest: 6, sest: 6,
};

/**
 * Število iz besedila, ODPORNO NA DVA ZAPISA. Nepremicnine.net piše po
 * slovensko ("1.208,4" = tisočice s pikami, vejica decimalka), bolha.com pa
 * po angleško ("173.72m2"). Slepo brisanje pik je iz 173,72 m² naredilo
 * 17.372 m² — ista past kot pri cenah ×100.
 *
 * Pravilo: ena sama pika z NAJVEČ dvema številkama za njo in brez vejice je
 * decimalka (slovenske tisočice so vedno v skupinah po tri).
 */
function stevilo(v: string | undefined): number | null {
  if (!v) return null;
  const s = v.trim();
  const n = /^\d+\.\d{1,2}$/.test(s) ? Number(s) : Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function besednoAliStevilka(v: string): number | null {
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n;
  return BESEDNA_STEVILA[v.toLowerCase()] ?? null;
}

export function izOpisa(opis: string): IzOpisa {
  const t = opis.toLowerCase();

  // Površina: prva "N m2" pred "zemljišča" je bivalna; "N m2 zemljišča" je parcela.
  const zemljisce = t.match(/([\d.,]+)\s*m2?\s*(?:zemlj|parcel)/);
  const povrsina = t.match(/([\d.,]+)\s*m2/);
  const letoIzgradnje = t.match(/(?:zgrajen[aoi]?|izgradnj[ae]|l\.\s*izgradnje|letnik)\s*(?:l\.\s*)?(\d{4})/);
  const letoAdaptacije = t.match(/(?:adaptiran[aoi]?|prenovljen[aoi]?|obnovljen[aoi]?)\s*(?:l\.\s*)?(\d{4})/);
  const nadstropje = opis.match(/\b([KPMN](?:\+[KPMN\d]+)+|\d+\/\d+\.?\s*nad)/);

  // Več enot: trditev ("ima 3 stanovanja") proti možnosti ("možnost ureditve
  // 3 stanovanj"). Trditve gredo v stEnot, možnosti v stEnotOcena — AI potem
  // nikoli ne reče "ima", kadar vir pravi "bi lahko imela".
  const trditev = t.match(
    /(?:ima|z|s)\s+(\d+|dve|dvema|tri|treh|štiri|stiri|pet|šest|sest)\s+(?:ločen\w*\s+)?(?:stanovanj\w*|bivaln\w*\s+enot\w*|apartma\w*|enot\w*)/
  );
  const moznost = t.match(
    /možnost\w*\s+(?:ureditve|izdelave|preureditve)?\s*(?:v\s+)?(\d+|dve|dveh|tri|treh|štiri|stiri|pet)\s*(?:stanovanj\w*|enot\w*|apartma\w*)/
  );
  const splosnoVec =
    /večstanovanjsk|vec[\s-]*stanovanjsk|več\s+ločenih\s+enot|ločen\w+\s+stanovanj|dvostanovanjsk|tristanovanjsk|apartma\w*\s+za\s+odda/.test(t);

  const stEnot = trditev ? besednoAliStevilka(trditev[1]) : /dvostanovanjsk/.test(t) ? 2 : /tristanovanjsk/.test(t) ? 3 : null;
  const stEnotOcena = moznost ? besednoAliStevilka(moznost[1]) : null;

  return {
    povrsinaM2: zemljisce && povrsina && povrsina[0] === zemljisce[0] ? null : stevilo(povrsina?.[1]),
    zemljisceM2: stevilo(zemljisce?.[1]),
    letoIzgradnje: letoIzgradnje ? Number(letoIzgradnje[1]) : null,
    letoAdaptacije: letoAdaptacije ? Number(letoAdaptacije[1]) : null,
    nadstropje: nadstropje ? nadstropje[1] : null,
    vecEnot: Boolean(stEnot && stEnot >= 2) || Boolean(stEnotOcena && stEnotOcena >= 2) || splosnoVec,
    stEnot,
    stEnotOcena,
    loceneKuhinje: /ločen\w+ kuhinj|vsaka .{0,30}kuhinj|svojo kuhinj/.test(t) ? true : null,
    looceniVhodi: /ločen\w+ vhod|svoj vhod|vsaka .{0,30}vhod/.test(t) ? true : null,
    zaObnovo: /za obnovo|potrebn\w+ (?:obnove|prenove|adaptacije)|za adaptacijo|za rušenje/.test(t),
    zaInvesticijo:
      /investicij|za oddaj|oddajanj|donos|airbnb|turistič\w+ apartma|primern\w+ za najem/.test(t),
  };
}

/** Cena "250.000,00 €", "1.200 €/mesec" ali angleško "1500.50 €" -> številka. */
export function cenaIz(besedilo: string): number | null {
  const m = besedilo.match(/([\d.]{1,12}(?:,\d{1,2})?)\s*€/);
  if (!m) return null;
  const n = stevilo(m[1]);
  return n !== null && n > 0 ? n : null;
}
