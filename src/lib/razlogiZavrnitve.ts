// Brez strežniških uvozov: uporablja jih tudi OdobritevSeznam v brskalniku.

/** Razlogi zavrnitve osnutka (isti ključi kot v Harveyju, predlogi.RAZLOGI_ZAVRNITVE). */
export const RAZLOGI_ZAVRNITVE = {
  premalo_raziskave: "Premalo raziskave",
  genericno: "Preveč generično",
  napacna_ponudba: "Napačna ponudba",
  nizka_vrednost: "Prenizka vrednost",
  neustrezna_trditev: "Neustrezna trditev",
  slaba_panoga: "Slaba panoga",
  napacen_kontakt: "Napačen kontakt",
} as const;

export type RazlogZavrnitve = keyof typeof RAZLOGI_ZAVRNITVE;

export type Zavrnitev = { razlog?: RazlogZavrnitve; opomba?: string; znova?: boolean };
