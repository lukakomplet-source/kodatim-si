/** Datum predloga (Harvey ga hrani v UTC, »YYYY-MM-DD HH:MM:SS«) po slovensko. */
export function datumPredloga(ustvarjeno: string): string {
  const d = new Date(`${ustvarjeno.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("sl-SI", { timeZone: "Europe/Ljubljana", day: "numeric", month: "numeric", year: "numeric" });
}
