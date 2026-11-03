import { preusmeriNaRazdelek } from "../preusmeriNaRazdelek";

/** Kratka pot razdelka iz menija (faza 3): vodi na prvo stran razdelka, ki jo uporabnik sme videti. */

export const dynamic = "force-dynamic";

export default async function KomunikacijaPage() {
  return preusmeriNaRazdelek("komunikacija");
}
