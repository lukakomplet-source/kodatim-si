/**
 * Render (kodatim.si/render): tipi in oznake, ki jih potrebujeta strežnik in
 * odjemalec. Brez "server-only", zato tu ni nič, kar bere disk ali bazo.
 */

export type RenderVrsta = "obnova" | "nekoc_danes" | "paralaksa";
export type RenderStatus = "caka" | "tece" | "rabi_tocke" | "koncano" | "napaka" | "preklicano";

export const RENDER_VRSTE: readonly RenderVrsta[] = ["obnova", "nekoc_danes", "paralaksa"];

export const RENDER_VRSTA_OZNAKE: Record<RenderVrsta, string> = {
  obnova: "Obnova stare fotografije",
  nekoc_danes: "Nekoč / danes",
  paralaksa: "2,5D gibanje",
};

export const RENDER_VRSTA_OPISI: Record<RenderVrsta, string> = {
  obnova:
    "Odstrani pike in tanke praske (samo tam, kjer so), poveča z Real-ESRGAN in po želji pobarva. Obrazov ne riše na novo.",
  nekoc_danes:
    "Staro fotografijo in današnji posnetek istega kraja poravna in naredi drsnik, video s prelivom in video z drsnikom.",
  paralaksa: "Iz ene fotografije izračuna globino in naredi kratek video s počasnim premikom kamere.",
};

export const RENDER_STATUS_OZNAKE: Record<RenderStatus, string> = {
  caka: "V vrsti",
  tece: "Teče",
  rabi_tocke: "Rabi točke",
  koncano: "Končano",
  napaka: "Napaka",
  preklicano: "Preklicano",
};

export const RENDER_STATUS_SLOGI: Record<RenderStatus, string> = {
  caka: "bg-zinc-100 text-zinc-600",
  tece: "bg-blue-50 text-blue-600",
  rabi_tocke: "bg-amber-50 text-amber-700",
  koncano: "bg-emerald-50 text-emerald-600",
  napaka: "bg-red-50 text-red-600",
  preklicano: "bg-zinc-100 text-zinc-400",
};

export type RenderVhod = { pot: string; ime?: string; vloga?: "slika" | "staro" | "danes"; velikost?: number };

export type RenderDatoteka = {
  pot: string;
  vrsta: "slika" | "video";
  opis: string;
  /** Oznaka, kadar je izdelek (delno) delo AI — prikaže se ob izdelku. */
  ai?: string | null;
  glavna?: boolean;
};

export type RenderRezultat = {
  datoteke?: RenderDatoteka[];
  primerjava?: { levo: string; desno: string; levoOznaka: string; desnoOznaka: string } | null;
  opombe?: string[];
  /** Nekoč/danes: izbrani današnji kader (za ročne točke). */
  kandidat?: string | null;
  staro?: string | null;
  inlierji?: number;
  meritevUjemanja?: { metoda?: string; inlierji?: number; pokritost?: number };
  meritve?: {
    sekund?: number;
    vramPredMB?: number | null;
    vramNajvecMB?: number | null;
    obvezaGB?: number | null;
    sproscenaOllama?: string[];
  };
};

export type RenderNaloga = {
  id: number;
  vrsta: RenderVrsta;
  status: RenderStatus;
  naziv: string | null;
  vhod: RenderVhod[];
  parametri: Record<string, unknown>;
  napredek: number;
  faza: string | null;
  rezultat: RenderRezultat | null;
  napaka: string | null;
  vir: string | null;
  vir_url: string | null;
  ustanova: string | null;
  licenca: string | null;
  objavljeno: boolean;
  ustvarjeno: string;
  zacetek: string | null;
  konec: string | null;
};

/** Pot do datoteke za <img>/<video>; strežnik sam preveri, kdo sme kaj. */
export function renderDatotekaUrl(pot: string): string {
  return `/api/render/datoteka?pot=${encodeURIComponent(pot)}`;
}

/** Velikost enega kosa pri nalaganju — glej opombo v poti za nalaganje. */
export const RENDER_KOS_BAJTOV = 8 * 1024 * 1024;
