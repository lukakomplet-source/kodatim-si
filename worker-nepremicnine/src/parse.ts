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
export function stevilo(v: string | undefined): number | null {
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

/**
 * NASTANITVENI OBJEKTI — hotel, penzion, gostišče, apartmajska hiša …
 *
 * Povod: uporabnik išče "hotele nad 10 ali 12 enot" za booking. V bazi je bilo
 * 28. 9. 2026 med 79.511 aktivnimi oglasi NIČ takih z zaznanimi ≥10 enotami —
 * ne zato, ker jih ni, ampak ker je izOpisa() poznal samo "stanovanja",
 * "apartmaje" in "enote". Hotel ne piše "ima 25 enot", piše "hotel s 25
 * sobami", "13 enot / 28 postelj", "penzion z restavracijo in 11 sobami".
 *
 * Sobe štejejo kot enote SAMO v nastanitvenem kontekstu. "Hiša s 5 sobami" je
 * ena družinska hiša, ne pet enot; "penzion z 11 sobami" pa je enajst enot za
 * oddajo. Zato se najprej ugotovi vrsta objekta, šele nato se štejejo sobe.
 *
 * Pasti, izmerjene na resničnih oglasih:
 *   - "STUDIO APARTMA. BLIŽINA HOTELA BELVEDERE"  -> stanovanje, ne hotel
 *   - "stanovanje v luksuznem aparthotelu"          -> ena enota v hotelu
 *   - "ZAZIDLJIVA PARCELA NAD HOTELOM METROPOL"      -> parcela
 *   - "Dnevna soba z 2 ležišči" (projekt vile)       -> ni nastanitev
 * Beseda za objekt, pred katero stoji "bližina", "nad", "ob", "v" ..., opisuje
 * SOSEDA in ne predmeta prodaje.
 */
export type Nastanitev = {
  /** hotel | penzion | hostel | motel | apartmajska_hisa | turisticna_kmetija | gostisce | nastanitveni_objekt */
  vrsta: string | null;
  sob: number | null;
  apartmajev: number | null;
  /** Ležišča/postelje — niso enote, a so edina številka, ki jo marsikateri oglas pove. */
  lezisc: number | null;
  /** Nastanitvene enote, ki jih oglas TRDI (sobe, apartmaji, "N enot"). */
  enot: number | null;
  /** Ocena enot iz ležišč (÷ 2,5), kadar oglas enot ne pove. Nikoli trditev. */
  enotOcena: number | null;
};

const VRSTE_NASTANITVE: [string, RegExp][] = [
  // Vrstni red je prednost: "gostinski objekt, hotel, apartmaji" je hotel.
  ["hotel", /(?:apart[\s-]?)?hotel(?:a|u|om|i|ov|e)?\b|hotelsk[a-zčšž]*\s+(?:kompleks|objekt|poslopj|sob)|\bgarni\b/g],
  ["penzion", /\bpenzion[a-zčšž]*/g],
  ["hostel", /\bhostel[a-zčšž]*/g],
  ["motel", /\bmotel[a-zčšž]*/g],
  [
    "apartmajska_hisa",
    // Brez "turistični objekt": to je siolova KATEGORIJA ("Turistični objekt,
    // Vikend"), ki je apartmajsko hišo naredila iz vsakega vikenda. "Hiša z
    // apartmajem" (ednina) je ena hiša; šteje šele množina ali število ≥ 3.
    /apartmajsk[a-zčšž]*\s+(?:hiš|objekt|vil|kompleks|naselj)|(?:hiš|vil)[a-zčšž]*\s+[sz]\s+apartma(?:ji|jema)\b/g,
  ],
  ["turisticna_kmetija", /turističn[a-zčšž]*\s+kmetij/g],
  ["gostisce", /\bgostišč[a-zčšž]*|\bgostisc[a-z]*|gostinsk[a-zčšž]*\s+(?:objekt|nastanitv)/g],
  // "kamp" namenoma NI vrsta: v bazi je bil v 20 zadetkih skoraj vedno sosed
  // ("100 m od Kampa Natura"), možnost ("kamp prikolica") ali ena hiška v
  // kampu — natančnost prenizka za filter, ki obljublja nastanitveni objekt.
  ["nastanitveni_objekt", /nastanitven[a-zčšž]*\s+(?:objekt|kapacitet|enot)|nočitven[a-zčšž]*\s+kapacitet|sob[a-z]*\s+za\s+(?:oddajo|goste|turiste)/g],
];

/**
 * Kar stoji tik pred besedo in pove, da gre za soseda: "v bližini hotela",
 * "nad hotelom", "200 m od hotela", "v luksuznem aparthotelu".
 */
const SOSED_PRED = /(?:bližin[a-zčšž]*|blizu|nasproti|poleg|zraven|\bnad|\bpod|\bob|\bpri|\bod|\bdo|\bza|\bv(?:\s+(?:luksuzn|nov|prenovljen|znan|priljubljen)[a-zčšž]*)?)\s+$/;

/**
 * Pri hiši, parceli in vikendu mora vrsta stati NA ZAČETKU (naslov in prvi
 * stavki). Tam oglas pove, kaj prodaja; dlje v opisu so sosedje ("Hotel Union
 * je pet minut stran"). Poslovni in počitniški objekti tega pogoja nimajo, ker
 * je pri njih hotel pogosto šele v tretjem stavku.
 */
const SAMO_ZACETEK = new Set(["hisa", "posest", "vikend"]);
const ZACETEK_ZNAKOV = 150;

/**
 * MOŽNOST NI TRDITEV. "možnost ureditve 15 enot", "projekt za 20 apartmajev",
 * "could be converted into 12 rooms" niso enote, ki OBSTAJAJO — so ideja
 * prodajalca. izOpisa() to loči že od začetka (stEnot proti stEnotOcena); ta
 * detektor je prvotno vse zapisal kot trditev, kar je recenzent adapterja
 * thinkslovenia.com ujel na "možnost 15 enot" → st_enot 15 (29. 9. 2026).
 */
const MOZNOST_PRED = /(možnost|mogoč|lahko|\bbi\s|potencial|predvid|uredit|preuredit|projekt|dovoljen|zazidal|izdela|possib|could|potential|option|project|planned|permit|convert)/;

function vseStevilke(t: string, re: RegExp, min: number, max: number): { trditev: number | null; moznost: number | null } {
  let trditev: number | null = null;
  let moznost: number | null = null;
  for (const m of t.matchAll(re)) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < min || n > max) continue;
    const kje = m.index ?? 0;
    if (MOZNOST_PRED.test(t.slice(Math.max(0, kje - 40), kje))) {
      if (moznost === null || n > moznost) moznost = n;
    } else if (trditev === null || n > trditev) trditev = n;
  }
  return { trditev, moznost };
}

export function nastanitevIz(besedilo: string, tip?: string | null): Nastanitev {
  const prazno: Nastanitev = { vrsta: null, sob: null, apartmajev: null, lezisc: null, enot: null, enotOcena: null };
  // Eno stanovanje ali garaža ni nastanitveni objekt, kakor koli ga opis hvali
  // ("stanovanje v aparthotelu", "studio v bližini hotela").
  if (tip === "stanovanje" || tip === "garaza") return prazno;
  const t = ` ${besedilo.toLowerCase().replace(/\s+/g, " ")} `;

  let vrsta: string | null = null;
  for (const [ime, re] of VRSTE_NASTANITVE) {
    for (const m of t.matchAll(re)) {
      const kje = m.index ?? 0;
      if (SOSED_PRED.test(t.slice(Math.max(0, kje - 28), kje))) continue;
      if (tip && SAMO_ZACETEK.has(tip) && kje > ZACETEK_ZNAKOV) continue;
      vrsta = ime;
      break;
    }
    if (vrsta) break;
  }

  // (?<![\d.,]) — "2004 sobe" ne sme dati 004 sob in "1.466 m²" ne 466.
  const B = "[a-zčšžćđ]+\\s+";
  const sobV = vseStevilke(t, new RegExp(`(?<![\\d.,])(\\d{1,3})\\s*(?:${B}){0,2}sob(?:ami|ah|e)?\\b`, "g"), 1, 500);
  const apartmajevV = vseStevilke(
    t,
    // Samo množina: "5 apartmajev", "3 apartmaji", "2 apartmaja". Ednina ob
    // številu je šifra ("Medulin REGI 117 Apartma 42 m2" ni 117 apartmajev).
    new RegExp(`(?<![\\d.,])(\\d{1,3})\\s*(?:${B}){0,2}apartma(?:jev|ji|jih|ja|je|jema)\\b`, "g"),
    2,
    300
  );
  const enotV = vseStevilke(t, new RegExp(`(?<![\\d.,])(\\d{1,3})\\s*(?:${B}){0,2}enot(?:e|ami|ah)?\\b`, "g"), 2, 500);
  // "60+10 ležišč" — osnovna in dodatna; štejemo osnovna.
  const leziscV = vseStevilke(t, /(?<![\d.,])(\d{1,4})\s*(?:\+\s*\d{1,3}\s*)?(?:[a-zčšžćđ]+\s+)?(?:ležišč|lezisc|postelj)/g, 4, 3000);

  const sob = sobV.trditev;
  const apartmajev = apartmajevV.trditev;
  const enotBesedilo = enotV.trditev;
  const lezisc = leziscV.trditev ?? leziscV.moznost;
  const moznihEnot = [sobV.moznost, apartmajevV.moznost, enotV.moznost].filter((x): x is number => x !== null);

  // Hiša s tremi ali več apartmaji JE apartmajska hiša, tudi če tega ne reče.
  if (!vrsta && apartmajev !== null && apartmajev >= 3) vrsta = "apartmajska_hisa";
  if (!vrsta) return prazno;

  /**
   * Enote = NAJVEČJA trditev, ne vsota. "20 sob in 5 apartmajev" je lahko 25
   * enot ali pa 20 sob v petih apartmajih — iz besedila se tega ne da ločiti.
   * Podcenitev skrije oglas pod mejo "10+", precenitev pa bi pokazala penzion
   * s šestimi sobami kot hotel z dvanajstimi; prvo je manjše zlo.
   */
  const trditve = [sob, apartmajev, enotBesedilo].filter((x): x is number => x !== null);
  const enot = trditve.length > 0 ? Math.max(...trditve) : null;
  // Ocena: najprej možnost, ki jo vir sam omeni ("možnost 15 enot"), sicer iz ležišč.
  const enotOcena =
    enot !== null ? null : moznihEnot.length > 0 ? Math.max(...moznihEnot) : lezisc !== null ? Math.max(1, Math.round(lezisc / 2.5)) : null;
  return { vrsta, sob, apartmajev, lezisc, enot, enotOcena };
}
