import { Archivo, Bricolage_Grotesque, Fraunces, Instrument_Serif, Space_Grotesk, Syne } from "next/font/google";

/**
 * Pisava naslovov demo strani (frontend-design: podoba izhaja iz njihovega sveta,
 * ne iz privzete pisave). Vse nastavijo isto spremenljivko --font-demo, strani jo
 * uporabijo za naslove. Starejši demi jo izberejo po panogi (pisavaZa), agentove
 * strani po imenu sloga, ki ga izbere agent (pisavaPoImenu).
 */
const industrija = Archivo({ subsets: ["latin", "latin-ext"], variable: "--font-demo", display: "swap" });
const hrana = Fraunces({ subsets: ["latin", "latin-ext"], variable: "--font-demo", display: "swap" });
const storitve = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], variable: "--font-demo", display: "swap" });
const elegantna = Instrument_Serif({ subsets: ["latin", "latin-ext"], weight: "400", variable: "--font-demo", display: "swap" });
const tehnicna = Space_Grotesk({ subsets: ["latin", "latin-ext"], variable: "--font-demo", display: "swap" });
const izrazita = Syne({ subsets: ["latin", "latin-ext"], variable: "--font-demo", display: "swap" });

const INDUSTRIJA = /(proizvod|izdel|kovin|stroj|gradb|stekl|elektr|plast|alumin|veleprod|na debelo|motor|les|tisk|tekstil|papir|kemi|orodj|montaž|vrtin|varov|zaščit)/i;
const HRANA = /(hran|rib|pijač|restavr|gostin|pekar|vin|kmetij|živil|kava|sadj|mes)/i;

export function pisavaZa(dejavnost: string): string {
  if (HRANA.test(dejavnost)) return hrana.variable;
  if (INDUSTRIJA.test(dejavnost)) return industrija.variable;
  return storitve.variable;
}

const PO_IMENU: Record<string, string> = {
  industrijska: industrija.variable,
  klasicna: hrana.variable,
  sodobna: storitve.variable,
  elegantna: elegantna.variable,
  tehnicna: tehnicna.variable,
  izrazita: izrazita.variable,
};

export function pisavaPoImenu(ime: string): string {
  return PO_IMENU[ime] ?? storitve.variable;
}
