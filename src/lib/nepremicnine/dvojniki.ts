import { razdaljaKm } from "./kraji";

/**
 * ISTI OBJEKT, VEČ OGLASOV.
 *
 * Ista nepremičnina pride v bazo večkrat: agencija jo objavi na več portalih,
 * portal pa jo včasih vpiše v dve kategoriji ("Hiša, Samostojna" in
 * "Počitniški objekt, Apartma"). Kanonično povezovanje (`nepremicnina_id`) tega
 * pogosto ne ujame — 28. 9. 2026 ni povezalo NOBENEGA od šestih parov med
 * trinajstimi hoteli z ≥10 enotami, zato je iskanje isto apartmajsko hišo v
 * Bohinju pokazalo štirikrat.
 *
 * Primerjava je po parih in namenoma ozka — dva različna objekta, združena v
 * enega, sta hujša napaka od dvojnika, ker enega od njiju tiho skrijeta:
 *
 *   1. isti `nepremicnina_id`;
 *   2. isti vir, ista cena, ista površina, isti kraj (dvojnik v kategorijah);
 *   3. samo pri NASTANITVENIH objektih: ista cena, isto število enot in manj
 *      kot 30 km narazen. Površina tu ne pomaga (Bohinj: 804,5 m² na enem
 *      portalu, 757 m² na drugem), regija tudi ne (pri enem viru je pokvarjena,
 *      druga dva je nimata). Razdalja pa je nujna: penzion v Kamniku in
 *      apartmajska hiša na Pagu imata oba 1.450.000 € in 11 enot.
 */
export type ZaDvojnike = {
  id: string;
  vir: string;
  url: string;
  cena_eur: number | string | null;
  povrsina_m2: number | string | null;
  kraj: string | null;
  lat: number | null;
  lng: number | null;
  nepremicnina_id?: string | null;
  nastanitev?: string | null;
  st_enot?: number | string | null;
  st_enot_ocena?: number | string | null;
};

export type DrugOglas = { vir: string; url: string; cena: number | null };

const NAJVEC_KM = 30;

const stevilka = (x: number | string | null | undefined): number | null => {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

const enotOglasa = (v: ZaDvojnike): number | null => stevilka(v.st_enot) ?? stevilka(v.st_enot_ocena);

export function staIsti(a: ZaDvojnike, b: ZaDvojnike): boolean {
  if (a.nepremicnina_id && a.nepremicnina_id === b.nepremicnina_id) return true;

  const cenaA = stevilka(a.cena_eur);
  const cenaB = stevilka(b.cena_eur);
  // Brez cene ni primerjave: "cena po dogovoru" je skupna tisočim oglasom.
  if (cenaA === null || cenaA <= 0 || cenaA !== cenaB) return false;

  if (
    a.vir === b.vir &&
    stevilka(a.povrsina_m2) === stevilka(b.povrsina_m2) &&
    (a.kraj ?? "").trim().toLowerCase() === (b.kraj ?? "").trim().toLowerCase()
  ) {
    return true;
  }

  if (a.nastanitev && b.nastanitev) {
    const enotA = enotOglasa(a);
    if (enotA === null || enotA < 2 || enotA !== enotOglasa(b)) return false;
    if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return false;
    return razdaljaKm(a.lat, a.lng, b.lat, b.lng) <= NAJVEC_KM;
  }
  return false;
}

/**
 * Obdrži prvi oglas vsakega objekta (vrstni red klicatelja ostane) in vrne,
 * kje drugje je isti objekt objavljen — to ni le pospravljanje: razlika v ceni
 * med portali je sama po sebi podatek o poslu.
 */
export function odstraniDvojnike<T extends ZaDvojnike>(vrstice: T[]): { vrstice: T[]; tudiNa: Map<string, DrugOglas[]> } {
  const ohranjeni: T[] = [];
  const tudiNa = new Map<string, DrugOglas[]>();
  for (const v of vrstice) {
    const prvi = ohranjeni.find((o) => staIsti(o, v));
    if (!prvi) {
      ohranjeni.push(v);
      continue;
    }
    // Isti URL (isti oglas v dveh kategorijah istega vira) ni "drug oglas".
    if (v.url === prvi.url) continue;
    const seznam = tudiNa.get(prvi.id) ?? [];
    if (!seznam.some((d) => d.url === v.url)) seznam.push({ vir: v.vir, url: v.url, cena: stevilka(v.cena_eur) });
    tudiNa.set(prvi.id, seznam);
  }
  return { vrstice: ohranjeni, tudiNa };
}
