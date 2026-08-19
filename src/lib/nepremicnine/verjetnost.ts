/**
 * Meje verjetnosti za podatke, ki pridejo iz oglasov.
 *
 * Viri objavljajo nesmisle, ki jih naš razčlenjevalnik zvesto prebere:
 * "Bivalna površina: 239000 m2" pri oglasu z naslovom "136m2" (prodajalec je
 * v polje površine vpisal ceno), "140.000 m2, hiša". Vrednosti NE popravljamo
 * in ne brišemo — oglas ostane tak, kot je pri viru — jih pa izločimo iz
 * povprečij, median in ocen, ker ena taka vrstica pokvari vse izračune.
 */

/** Zgornja meja BIVALNE površine po tipu; zemljišče je namenoma neomejeno. */
const MEJA_POVRSINE: Record<string, number> = {
  stanovanje: 1000,
  hisa: 3000,
  poslovni_prostor: 20000,
  garaza: 500,
  vikend: 1000,
  pocitniski_objekt: 2000,
};

export function verjetnaPovrsina(tip: string | null, m2: number | null | undefined): boolean {
  if (m2 === null || m2 === undefined) return false;
  const v = Number(m2);
  if (!Number.isFinite(v) || v <= 5) return false;
  const meja = tip ? MEJA_POVRSINE[tip] : undefined;
  return meja === undefined ? v <= 50000 : v <= meja;
}

/** Površina, kadar ji lahko zaupamo za izračun; sicer null. */
export function povrsinaZaIzracun(tip: string | null, m2: number | null | undefined): number | null {
  return verjetnaPovrsina(tip, m2) ? Number(m2) : null;
}
