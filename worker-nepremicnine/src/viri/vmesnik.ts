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

/**
 * Kar je na detajlni strani in česar kartica na seznamu nima.
 *
 * Vsa polja so izbirna in vsako se zapiše SAMO, kadar je bilo res prebrano.
 * `undefined` pomeni "vir tega ne pove" in pusti obstoječo vrednost pri miru;
 * `null` pomeni "vir izrecno pravi, da tega ni". Nič se ne ugiba iz opisa in
 * nič ne pride iz modela — prazno polje je poštenejše od izmišljenega.
 */
export type Detajl = {
  stSob?: number | null;
  /** Spalnice niso sobe — vir ju loči, zato ju ločimo tudi mi. */
  stSpalnic?: number | null;
  stKopalnic?: number | null;
  povrsinaM2?: number | null;
  zemljisceM2?: number | null;
  letoIzgradnje?: number | null;
  letoAdaptacije?: number | null;
  nadstropje?: string | null;
  etaznost?: string | null;
  energetskiRazred?: string | null;
  ogrevanje?: string | null;
  stanje?: string | null;
  opremljenost?: string | null;
  lastnistvo?: string | null;
  parkirno?: string | null;
  balkon?: boolean | null;
  terasa?: boolean | null;
  vrt?: boolean | null;
  klet?: boolean | null;
  dvigalo?: boolean | null;
  sifraOglasa?: string | null;
  datumObjave?: string | null;
  posrednik?: string | null;
  agencija?: string | null;
  telefon?: string | null;
  opis?: string | null;
  cenaEur?: number | null;
  kraj?: string | null;
  /** URL-ji slik na izvirniku. Datotek NE kopiramo (slikePolitika). */
  slikeUrls?: string[] | null;
  /** Surova tabela lastnosti, kakor jo stran pove — brez izgube pri prevodu. */
  lastnosti?: Record<string, string>;
};

/** Kako se pri viru bere 2. faza. Brez tega adapter detajlov nima. */
export type DetajlPolitika = {
  /** Razmik med detajlnimi stranmi. Nikoli manj od Crawl-delay vira. */
  zamikMs: number;
  /** Največ detajlnih strani na en krog — baza se polni v dneh, ne v uri. */
  kvota: number;
  preberi(page: Page): Promise<Detajl>;
};

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
  /**
   * Največ obiskov strani na DAN, čez vse kroge skupaj.
   *
   * Ločeno od `najvecStrani`, ki velja za en krog. Ko je urnik dobil štiri
   * termine, je bil vsak krog zase vljuden (30 obiskov), dan pa ne (120) — in
   * vir je začel vračati strani brez kartic. Vljudnost se meri po dnevu, ker
   * jo tako meri tudi vir.
   */
  dnevnaMejaStrani?: number;
  /**
   * INKREMENTALNO BRANJE — najmočnejši vzvod, ki ga imamo.
   *
   * Če vir seznam razvrsti od najnovejšega, so novi oglasi na prvih straneh.
   * Takrat se ni treba prebiti skozi cel katalog: ko dve strani zapored ne
   * prineseta niti enega oglasa, ki ga BAZA še ne pozna, smo se dohiteli in
   * ostalo je že pri nas. Pri bolhi to pomeni ~15 zahtevkov na dan namesto
   * ~160 — in prav količina je tisto, kar je vir spravilo do zavračanja.
   *
   * Zastavica je zato TRDITEV O VIRU in ne nastavitev okusa: vklopi se šele,
   * ko je razvrstitev izmerjena (`npm run test:razvrstitev`). Če seznam ni
   * razvrščen po novosti, so novi in stari oglasi pomešani in zgodnja
   * ustavitev bi tiho izpustila del trga — natanko napaka, ki nas je pri
   * števcu strani stala dve tretjini kataloga.
   */
  razvrsceniPoNovosti?: boolean;
  /** Koliko ur počakamo, če vir vseeno zavrne (spoštovanje blokade). */
  hlajenjeUr?: number;
  /**
   * 2. faza: branje detajlnih strani. Adapter brez tega ostane enofazen —
   * glavna zanka ga preprosto preskoči, namesto da bi ugibala selektorje.
   */
  detajli?: DetajlPolitika;
  /**
   * Crawl-delay, kakor ga zahteva robots.txt tega vira, v sekundah.
   * `null` pomeni "robots.txt ga NE navaja" in ne "nič sekund" — razlika je
   * pomembna, ker konzola sicer trdi, da vir dovoljuje branje brez premora.
   * Naš dejanski razmik je `omejitve.zamikMs` in je nikoli ne sme podkoračiti.
   */
  crawlDelayS?: number | null;
  /** Kaj o zajemu pravijo pogoji uporabe tega vira — vidno v konzoli. */
  pravno?: string;
  rezine(): Rezina[];
  seznamUrl(r: Rezina, stran: number): string;
  /**
   * `skupajZadetkov` je število, ki ga o rezini pove VIR SAM (npr.
   * "Št. ustreznih oglasov: 0"). Loči dve stanji, ki sta na videz enaki in
   * imata nasprotni rešitvi:
   *
   *   0 zadetkov  = kategorija je res prazna (garaž na Koroškem ni) -> pojdi naprej
   *   ni podatka  = stran brez kartic je lahko mehka blokada        -> previdno, premor
   *
   * 20. 8. 2026 je ta razlika stala cel obhod: rotacija rezin je pristala na
   * prazni kategoriji, zbiralnik jo je razglasil za blokado, prekinil pregled
   * in viru zapisal šesturno hlajenje — vir pa nas sploh ni oviral.
   *
   * Adapter, ki tega števila ne zna prebrati, vrne null in obdrži previdno
   * vedenje.
   */
  preberiSeznam(page: Page): Promise<{
    kartice: SurovaKartica[];
    zadnjaStran: number | null;
    skupajZadetkov?: number | null;
  }>;
  normaliziraj(k: SurovaKartica, r: Rezina): NormaliziranOglas;
};
