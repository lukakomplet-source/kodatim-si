// Brez strežniških uvozov: to uporabljata tudi komponenti v brskalniku (PanikKoraki, MapaOdobritve).

/** Velikost prevoznika (28. 10. 2026): vozni park z njihove strani, promet in zaposleni iz CompanyWalla. */
export type ObsegPrevoznika = {
  tovornjaki?: number | null;
  tovornjaki_dokaz?: string;
  prihodki?: number | null;
  zaposleni?: number | null;
  leto?: string;
};

/** »vozni park 32 · 2,1 mio € prometa (2025) · 28 zaposlenih«; prazno, ko podatkov še ni. */
export function opisObsega(o: ObsegPrevoznika): string {
  const deli: string[] = [];
  if (o.tovornjaki != null) deli.push(`vozni park ${o.tovornjaki}`);
  if (o.prihodki != null) {
    const p = o.prihodki;
    const znesek =
      p >= 1_000_000
        ? `${(p / 1_000_000).toLocaleString("sl-SI", { maximumFractionDigits: 1 })} mio €`
        : `${Math.round(p / 1000).toLocaleString("sl-SI")} tisoč €`;
    deli.push(`${znesek} prometa${o.leto ? ` (${o.leto})` : ""}`);
  }
  if (o.zaposleni != null) deli.push(`${o.zaposleni.toLocaleString("sl-SI")} zaposlenih`);
  return deli.join(" · ");
}
