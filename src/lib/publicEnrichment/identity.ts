/**
 * Cross-source identity verification.
 *
 * Slovenian company names are not unique — searching "DEJAN VIDOVIĆ S.P."
 * surfaces both DŠ 90206118 and the unrelated "K. V. T. MOBILE, Dejan Vidović,
 * s. p." (DŠ 33732531). Name matching alone therefore cannot prove that
 * CompanyWall and Bizi are describing the company AJPES resolved, and merging
 * on name alone silently blends two companies into one lead.
 *
 * So once any source states a tax number (davčna) or a registration number
 * (matična), every later source must agree with it. A source that contradicts
 * it is discarded whole — never partially merged — and the reason is recorded.
 */

export type CompanyIdentity = {
  vat_id?: string | null;
  registration_number?: string | null;
};

/** "SI 33450340" and "33450340" are the same number. */
function digitsOnly(value?: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * AJPES publishes the 7-digit matična, CompanyWall the 10-digit form with the
 * establishment suffix ("6178898" vs "6178898000"). Those are the same company,
 * so a prefix match counts — but only from 7 digits up, so short fragments can
 * never accidentally match an unrelated number.
 */
function registrationMatches(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 7 && long.startsWith(short);
}

/**
 * Returns a Slovenian, human-readable reason when the two sources describe
 * DIFFERENT companies, or null when they agree — or when there is simply
 * nothing to compare yet, in which case the candidate is accepted and becomes
 * part of the established identity.
 */
export function identityConflict(
  established: CompanyIdentity,
  candidate: CompanyIdentity
): string | null {
  const establishedVat = digitsOnly(established.vat_id);
  const candidateVat = digitsOnly(candidate.vat_id);
  if (establishedVat && candidateVat && establishedVat !== candidateVat) {
    return `davčna številka se ne ujema (potrjeno ${established.vat_id}, ta vir ${candidate.vat_id}) — gre za drugo podjetje z enakim imenom`;
  }

  const establishedReg = digitsOnly(established.registration_number);
  const candidateReg = digitsOnly(candidate.registration_number);
  if (establishedReg && candidateReg && !registrationMatches(establishedReg, candidateReg)) {
    return `matična številka se ne ujema (potrjeno ${established.registration_number}, ta vir ${candidate.registration_number}) — gre za drugo podjetje z enakim imenom`;
  }

  return null;
}

/** Folds a verified source's numbers into the running identity. */
export function mergeIdentity(established: CompanyIdentity, candidate: CompanyIdentity): CompanyIdentity {
  return {
    vat_id: established.vat_id || candidate.vat_id || null,
    registration_number: established.registration_number || candidate.registration_number || null,
  };
}
