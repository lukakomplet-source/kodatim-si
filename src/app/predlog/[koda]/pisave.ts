import { Archivo, Bricolage_Grotesque, Fraunces } from "next/font/google";

/**
 * Pisava naslovov demo strani po panogi podjetja (frontend-design: podoba izhaja iz
 * njihovega sveta, ne iz privzete pisave). Vse tri nastavijo isto spremenljivko
 * --font-demo, DemoStran jo uporabi za naslove.
 */
const industrija = Archivo({ subsets: ["latin", "latin-ext"], variable: "--font-demo", display: "swap" });
const hrana = Fraunces({ subsets: ["latin", "latin-ext"], variable: "--font-demo", display: "swap" });
const storitve = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], variable: "--font-demo", display: "swap" });

const INDUSTRIJA = /(proizvod|izdel|kovin|stroj|gradb|stekl|elektr|plast|alumin|veleprod|na debelo|motor|les|tisk|tekstil|papir|kemi|orodj|montaž|vrtin|varov|zaščit)/i;
const HRANA = /(hran|rib|pijač|restavr|gostin|pekar|vin|kmetij|živil|kava|sadj|mes)/i;

export function pisavaZa(dejavnost: string): string {
  if (HRANA.test(dejavnost)) return hrana.variable;
  if (INDUSTRIJA.test(dejavnost)) return industrija.variable;
  return storitve.variable;
}
