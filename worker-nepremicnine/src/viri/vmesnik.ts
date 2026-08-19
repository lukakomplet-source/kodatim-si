import type { Page } from "playwright";
import type { NormaliziranOglas } from "../db.js";

/**
 * Skupni vmesnik vira. Vsak portal je svoj adapter s svojimi selektorji,
 * URL shemo, omejitvami in politiko slik; glavna zanka (index.ts) pozna samo
 * ta vmesnik. En pokvarjen adapter tako nikoli ne ustavi drugih virov.
 */

/** Surova kartica s seznama — najmanjši skupni imenovalec vseh virov. */
export type SurovaKartica = {
  url: string;
  virId: string;
  lokacija: string | null;
  naslovVrstica: string | null;
  opis: string | null;
  cenaBesedilo: string | null;
  telefon: string | null;
  agencija: string | null;
  slika: string | null;
  stSlik: number | null;
};

/** Enota dela: en seznam z lastno paginacijo. Adapter vanjo skrije svoje. */
export type Rezina = { oznaka: string };

export type VirAdapter = {
  /** Identiteta v bazi (nep_viri.vir, nep_oglasi.vir). */
  vir: string;
  omejitve: { zamikMs: number };
  /** Sanity razpon unikatnih oglasov — zunaj njega je verjetno pokvarjen selektor. */
  pricakovanRazpon: [number, number];
  /**
   * "referenca": slik ne kopiramo, hranimo samo URL in povezavo na izvirnik
   * (robots.txt use=reference ali prepovedani slikovni endpointi).
   * "lokalno": vir dovoli lokalno kopijo — slike gredo v nep_slike z datoteko.
   */
  slikePolitika: "referenca" | "lokalno";
  /** Svež brskalniški kontekst za vsako stran (Cloudflare strategija ipd.). */
  svezKontekstNaStran: boolean;
  /**
   * Največ strani na en pregled. Vir, ki po določenem obsegu začne zavračati,
   * se ne prebere hitreje, ampak v več dneh: vsak dan vzamemo rezino in se
   * ustavimo, preden postanemo nadležni. Brez omejitve = ni meje.
   */
  najvecStrani?: number;
  /** Koliko ur počakamo, če vir vseeno zavrne (spoštovanje blokade). */
  hlajenjeUr?: number;
  rezine(): Rezina[];
  seznamUrl(r: Rezina, stran: number): string;
  preberiSeznam(page: Page): Promise<{ kartice: SurovaKartica[]; zadnjaStran: number | null }>;
  normaliziraj(k: SurovaKartica, r: Rezina): NormaliziranOglas;
};
