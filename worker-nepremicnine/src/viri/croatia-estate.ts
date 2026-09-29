import type { NormaliziranOglas } from "../db.js";
import type { Rezina, SurovaKartica, VirAdapter } from "./vmesnik.js";
import { prenesi } from "./http.js";
import { objektiPoKljucu, rscBesedilo } from "./rsc.js";

/**
 * croatia-estate.com — hrvaška obala in HOTELI.
 *
 * Zakaj ta vir: uporabnik išče "hotele nad 10 ali 12 enot" za booking. Naši
 * slovenski viri jih skoraj nimajo; tu je kategorija s 43 hoteli in sedem od
 * prvih dvanajstih ima po 10+ sob (Split 17, Omiš 23, Dubrovnik 24, Pelješac
 * 36, Hvar 47 …) — s številom sob kot STRUKTURIRANIM poljem, ne v opisu.
 *
 * Pravna presoja (28.–29. 9. 2026, presoja + dva neodvisna skeptika):
 *   - robots.txt: ena skupina za *, prepovedani samo /monitoring*, /*?_rsc= in
 *     zablodela vrstica "*\". Poti, ki jih beremo, so dovoljene.
 *   - edina pravna besedila (sitemap-pages.xml) so posredniški splošni pogoji
 *     za naročnike in politika zasebnosti; o rabi spletišča, robotih ali
 *     zbirkah ne pravijo nič.
 *   - POGOJ: slike in zaledje gostijo na hub.broker.hr, katerega robots.txt
 *     prepoveduje VSE poti vsem robotom (prav tako www.broker.hr). Tja nikoli ne
 *     kličemo — ne po slike, ne po PDF, ne po wp-json, in tudi ne prek njihovega
 *     posrednika /_next/image, ker bi s tem obšli ta Disallow. Zato slika_url
 *     ostane prazen in arhiva slik ni.
 *
 * Tehnično: Next.js; kartice so v toku RSC strežniško izrisanega HTML-ja
 * (glej rsc.ts). 12 kartic na stran, ?page=N.
 */

const VIR = "croatia-estate.com";
const OSNOVA = "https://croatia-estate.com";

type Kartica = {
  title?: string;
  link?: string;
  isExclusive?: boolean;
  contractType?: { name?: string; translations?: Record<string, string> };
  translations?: Record<string, string>;
  location_name?: string;
  region_name?: string;
  property_type_slugs?: string[];
  price?: number | null;
  on_request?: boolean;
  seafront?: boolean;
  features?: { living_space?: string | number; land_space?: string | number; rooms?: number; sea_distance?: string | number };
};

type RezinaCe = Rezina & { vrsta: string; tip: string; podtip: string | null };

/**
 * Samo kategorije, ki služijo cilju — hoteli, poslovni objekti in vile/hiše
 * (apartmajske hiše so na obali skoraj vedno vpisane kot "house-villa").
 * Stanovanj in parcel NE beremo: v bazi je že 36.831 hrvaških oglasov z
 * nepremicnine.net, več stanovanj v Dalmaciji uporabniku ne pomaga najti
 * hotela, viru pa pomeni stotine zahtevkov.
 */
const REZINE: RezinaCe[] = [
  { oznaka: "hotel", vrsta: "hotel", tip: "poslovni_prostor", podtip: "hotel" },
  { oznaka: "commercial-property", vrsta: "commercial-property", tip: "poslovni_prostor", podtip: null },
  { oznaka: "house-villa", vrsta: "house-villa", tip: "hisa", podtip: null },
];

function seznamUrl(r: Rezina, stran: number): string {
  const osnova = `${OSNOVA}/property_type/${(r as RezinaCe).vrsta}/`;
  return stran <= 1 ? osnova : `${osnova}?page=${stran}`;
}

const stevilo = (x: unknown): number | null => {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(String(x).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Referenčna številka agencije ("2022-458") je stabilnejša od naslova in od
 * slug-a, ki se ob popravku naslova spremeni. Stoji na koncu angleškega
 * prevoda: "…-in-the-heart-of-split-2022-458".
 */
function referenca(k: Kartica): string | null {
  const en = k.translations?.en ?? "";
  return en.match(/(\d{4}-\d{1,5})$/)?.[1] ?? null;
}

async function preberiHttp(
  r: Rezina,
  stran: number,
  ua: string
): Promise<{ kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov?: number | null }> {
  return karticeIzHtml(await prenesi(seznamUrl(r, stran), ua, { jezik: "en" }), stran);
}

/** Čisto razčlenjevanje strani — brez omrežja, zato ga je mogoče preizkusiti na shranjeni strani. */
export function karticeIzHtml(
  html: string,
  stran: number
): { kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov: number | null } {
  const objekti = objektiPoKljucu<Kartica>(rscBesedilo(html), "property");

  const kartice: SurovaKartica[] = [];
  const videni = new Set<string>();
  for (const k of objekti) {
    if (!k.link || !k.title) continue;
    const id = referenca(k) ?? k.link.replace(/^\/properties\/|\/$/g, "");
    if (videni.has(id)) continue;
    videni.add(id);
    const f = k.features ?? {};
    kartice.push({
      url: `${OSNOVA}${k.link}`,
      virId: id,
      lokacija: [k.location_name, k.region_name].filter(Boolean).join(", ") || null,
      naslovVrstica: k.title,
      // Kartica nima opisa; sestavimo ga iz strukturiranih polj, da ga bere
      // detektor nastanitve in da iskalnik najde "hotel s 24 sobami".
      opis: [
        k.title,
        // Kategorija vira: "Kaštela, 21 sob" je v kategoriji hotelov, a naslov
        // besede "hotel" nima — brez tega ga detektor nastanitve ne bi prepoznal.
        (k.property_type_slugs ?? []).includes("hotel") ? "category: hotel" : null,
        f.rooms ? `${f.rooms} rooms` : null,
        stevilo(f.living_space) ? `${stevilo(f.living_space)} m2 living space` : null,
        stevilo(f.land_space) ? `${stevilo(f.land_space)} m2 land` : null,
        stevilo(f.sea_distance) !== null ? `${stevilo(f.sea_distance)} m from the sea` : null,
        k.seafront ? "seafront" : null,
        k.isExclusive ? "exclusive" : null,
      ]
        .filter(Boolean)
        .join(", "),
      // "Price on request" ima kljub temu vpisano številko (5.000.000,
      // 9.999.999) — to je nadomestek, ne cena, zato jo zavržemo.
      cenaBesedilo: k.on_request ? null : k.price ? String(k.price) : null,
      telefon: null,
      agencija: "Broker-grupa d.o.o. (croatia-estate.com)",
      slika: null, // slike so na hub.broker.hr — glej opombo zgoraj
      stSlik: null,
      // Za raw: brez prevodov (12 jezikov) in brez poti do slik na hub.broker.hr.
      surovo: { ...k, translations: undefined, reducedImageArray: undefined },
    });
  }

  // Oštevilčenje: največja številka strani med povezavami (?page=N).
  const strani = [...html.matchAll(/[?&]page=(\d+)/g)].map((m) => Number(m[1]));
  const zadnjaStran = strani.length > 0 ? Math.max(stran, ...strani) : kartice.length > 0 ? stran : null;
  return { kartice, zadnjaStran, skupajZadetkov: null };
}

export function normaliziraj(k: SurovaKartica, r: Rezina): NormaliziranOglas {
  const rez = r as RezinaCe;
  const surovo = (k.surovo ?? {}) as Kartica;
  const f = surovo.features ?? {};
  const sobe = typeof f.rooms === "number" && f.rooms > 0 ? f.rooms : null;
  const posel = /rent/i.test(surovo.contractType?.name ?? "") ? "oddaja" : "prodaja";
  // Sobe hotela SO enote (trditev vira, strukturirano polje). Sobe vile niso.
  const jeHotel = rez.vrsta === "hotel" || (surovo.property_type_slugs ?? []).includes("hotel");
  const stEnot = jeHotel && sobe !== null && sobe >= 2 ? sobe : null;
  return {
    vir: VIR,
    virId: k.virId,
    url: k.url,
    naslov: k.naslovVrstica,
    tip: rez.tip,
    podtip: rez.podtip,
    posel,
    regija: null, // hrvaška regija ni slovenska statistična regija
    kraj: surovo.location_name?.replace(/\s+city$/i, "").trim() || k.lokacija,
    cenaEur: stevilo(k.cenaBesedilo),
    povrsinaM2: stevilo(f.living_space),
    zemljisceM2: stevilo(f.land_space),
    letoIzgradnje: null,
    letoAdaptacije: null,
    nadstropje: null,
    vecEnot: stEnot !== null,
    stEnot,
    stEnotOcena: null,
    loceneKuhinje: null,
    looceniVhodi: null,
    zaObnovo: false,
    zaInvesticijo: jeHotel,
    opis: k.opis,
    prodajalec: null,
    agencija: k.agencija,
    telefon: null,
    slikaUrl: null,
    stSlik: null,
    raw: { kartica: surovo, rezina: rez.oznaka },
  };
}

export const adapter: VirAdapter = {
  vir: VIR,
  // Crawl-delay ni naveden; 8 s je naš privzeti razmik za tuje vire.
  omejitve: { zamikMs: 8_000 },
  crawlDelayS: null,
  pricakovanRazpon: [40, 8_000],
  slikePolitika: "referenca",
  dovoljenArhivSlik: false,
  svezKontekstNaStran: false,
  najvecStrani: 60,
  najvecStraniNaRezino: 40,
  dnevnaMejaStrani: 60,
  dnevniProracunVira: 80,
  razvrsceniPoNovosti: false,
  hlajenjeUr: 24,
  pravno:
    "robots.txt (29. 9. 2026): ena skupina za *, prepovedani samo /monitoring*, /*?_rsc= in \"*\\\"; " +
    "seznami /property_type/*/?page=N so dovoljeni, Crawl-delay ni naveden. Edina pravna besedila " +
    "(posredniški splošni pogoji Broker-grupa d.o.o. in politika zasebnosti) o rabi spletišča, robotih " +
    "ali zbirkah ne govorijo. POGOJ: hub.broker.hr in www.broker.hr v robots.txt prepovedujeta vse — " +
    "slik, PDF-jev in wp-json ne kličemo, tudi ne prek /_next/image. Preverjeno s presojo in dvema " +
    "neodvisnima skeptikoma (pravni + tehnični), oba nista našla omejitve.",
  rezine: () => REZINE,
  seznamUrl,
  preberiHttp,
  preberiSeznam: async () => {
    throw new Error("croatia-estate.com se bere brez brskalnika (preberiHttp)");
  },
  normaliziraj,
};
