import type { Page } from "playwright";
import { izOpisa, stevilo } from "../parse.js";
import type { NormaliziranOglas } from "../db.js";
import type { Detajl, Rezina as BazniRezina, SurovaKartica, VirAdapter } from "./vmesnik.js";

/**
 * Adapter za kvadrat.si (Edifi Marketplaces, Švica).
 *
 * TA VIR JE DRUGAČEN OD OSTALIH ŠTIRIH: kvadrat.si je SAM AGREGATOR. Vsak
 * oglas nosi zapis `source`, npr.
 * `{ sourceName: "atrium", sourceUrl: "https://www.atrium.si/oglas/522791-…" }`.
 * Vzorec dvanajstih oglasov (15. 9. 2026) je pokazal, da pobira z AGENCIJSKIH
 * strani — bazarealestate.com (7 od 12), abc-nepremicnine.si (2),
 * stoja-trade.si, ljubljananepremicnine.si, agenti-nep.si — in NE z velikih
 * portalov. Z nobenim od naših štirih virov se ne prekriva, zato prinaša
 * resnično nov inventar in ne podvojitev. Ker pa je vsebina iz druge roke,
 * izvirno povezavo ohranimo v `lastnosti.izvirnik`: oglas vedno kaže nazaj na
 * agencijo, ki ga je objavila.
 *
 * ZAKAJ BEREMO KATEGORIJE IN NE SITEMAPA. Sitemap bi bil bistveno cenejši (en
 * zahtevek za vseh 2.836 oglasov), a pove samo naslove — ne posla in ne vrste.
 * `posel` je v `NormaliziranOglas` obvezen in ga 2. faza ne more nastaviti
 * (`Detajl` tega polja nima), zato mora priti iz 1. faze. Edino mesto, kjer ga
 * vir pove PRED odprtjem oglasa, je pot kategorije (`/ads/buy/house/maribor`).
 * Sitemap zato uporabimo samo kot vir seznama kategorij (spodnji `OBCINE`),
 * brati pa je treba kategorije.
 *
 * PAGINACIJE NI: `?page=2` in `?p=2` vrneta isto prvo kartico (preverjeno
 * 15. 9. 2026), zato je vsaka rezina natanko ena stran. Občinske rezine so
 * majhne (Maribor hiše 28, Ljubljana stanovanja 50), zato to ni izguba.
 * Nacionalne poti brez občine (`/ads/buy/flat`) vrnejo samo 16 napovednikov in
 * so neuporabne.
 *
 * Strani se brez JavaScripta ne izrišejo (Angular/Ionic), s Playwrightom se.
 * Detajlna stran ima strežniški izris in v `<script id="serverApp-state">`
 * nosi CEL oglas kot JSON — to beremo, ker je neprimerno bolj zanesljivo od
 * selektorjev nad Ionic komponentami.
 *
 * PRAVNO (preverjeno 15. 9. 2026):
 *  - robots.txt prepoveduje samo tehnične poti (/admin, /api, /backend, /src,
 *    /config, /node_modules …). Seznami in oglasi so dovoljeni. `Crawl-delay`
 *    NI naveden, `Content-Signal` ga ni. Poti `/api` se ne dotikamo — podatke
 *    vzamemo iz HTML-a strani, ki jo tako ali tako obiščemo.
 *  - Pogoji (različica 12. 6. 2024) NIKJER ne omenjajo robotov, avtomatskih
 *    poizvedb, meta-iskanja ali scrapinga. To je edini slovenski nepremičninski
 *    portal med devetimi pregledanimi, ki takšne prepovedi nima. Imajo pa v
 *    2. točki splošen pridržek avtorskih pravic na gradivu, zato slik NE
 *    kopiramo (`slikePolitika: "referenca"`, `dovoljenArhivSlik: false`).
 *
 * Kot vsak nov vir je tudi ta v `nep_viri` vpisan IZKLOPLJEN; vklopi ga lahko
 * samo človek v konzoli, kjer je ob gumbu izpisano zgornje pravno pojasnilo.
 */

export const VIR = "kvadrat.si";

const KORENSKI = "https://kvadrat.si";

type KvadratRezina = BazniRezina & {
  posel: "prodaja" | "oddaja";
  potPosel: "buy" | "rent";
  potVrsta: string;
  tip: string;
  obcina: string;
};

/** Vrste, kakor jih vir piše v poti, in naš ustrezni tip. */
const VRSTE: { pot: string; tip: string }[] = [
  { pot: "house", tip: "hisa" },
  { pot: "flat", tip: "stanovanje" },
  { pot: "apartment", tip: "apartma" },
  { pot: "room", tip: "soba" },
  { pot: "weekend", tip: "pocitniski_objekt" },
  { pot: "land", tip: "posest" },
  { pot: "commercial", tip: "poslovni_prostor" },
  { pot: "farm", tip: "kmetija" },
  { pot: "parking", tip: "garaza" },
];

/**
 * Občine, kakor jih vir piše v poti — prebrano iz njegovega `sitemap.xml`
 * (15. 9. 2026) in ne ugibano: vir ima svoje zapise („bezigrad" kot samostojna
 * enota, poleg občin tudi regije „gorenjska", „podravska" in nekaj tujih
 * krajev), zato bi vsak naš „lepši" seznam pomenil 404 na polovici poti.
 */
const OBCINE: string[] = [
  "ajdovscina", "ankaran", "apace", "beltinci", "benedikt", "bezigrad", "bistrica-ob-sotli",
  "bled", "bloke", "bohinj", "borovnica", "bovec", "braslovce", "brda", "brezice",
  "brezovica", "cankova", "celje", "cerklje-na-gorenjskem", "cerknica", "cerkno",
  "cerkvenjak", "cirkulane", "crensovci", "crna-na-koroskem", "crnomelj", "destrnik",
  "divaca", "dobje", "dobrepolje", "dobrna", "dobrova-polhov-gradec", "dobrovnik",
  "dol-pri-ljubljani", "dolenjske-toplice", "domzale", "dornava", "dravograd", "duplek",
  "gorenja-vas-poljane", "gorenjska", "goriska", "gorisnica", "gorizia", "gorje",
  "gornja-radgona", "gornji-grad", "gornji-petrovci", "grad", "grosuplje", "hajdina",
  "hoce-slivnica", "hodos", "horjul", "hrastnik", "hrpelje-kozina", "idrija", "ig",
  "ilirska-bistrica", "ivancna-gorica", "izola", "jesenice", "jezersko",
  "jugovzhodna-slovenija", "jursinci", "kamnik", "kanal", "kidricevo", "kobarid", "kobilje",
  "kocevje", "komen", "komenda", "koper", "koroska", "kostanjevica-na-krki", "kostel",
  "kozje", "kranj", "kranjska-gora", "krizevci", "krsko", "kungota", "kuzma", "kyrenia",
  "lasko", "lenart", "lendava", "litija", "ljubljana", "ljubno", "ljutomer", "log-dragomer",
  "logatec", "loska-dolina", "loski-potok", "lovrenc-na-pohorju", "luce", "lukovica",
  "majsperk", "makole", "maribor", "markovci", "medvode", "menges", "metlika", "mezica",
  "miklavz-na-dravskem-polju", "miren-kostanjevica", "mirna", "mirna-pec", "mislinja",
  "mokronog-trebelno", "moravce", "moravske-toplice", "mozirje", "murska-sobota", "muta",
  "naklo", "nazarje", "nova-gorica", "novo-mesto", "obalno-kraska", "odranci", "oplotnica",
  "ormoz", "osilnica", "osrednjeslovenska", "paphos", "pesnica", "piran", "pivka",
  "podcetrtek", "podlehnik", "podravska", "podravska-kidricevo-spodnji-gaj-pri-pragerskem",
  "podvelka", "poljcane", "polzela", "pomurska", "postojna", "prebold", "preddvor",
  "prevalje", "ptuj", "puconci", "race-fram", "radece", "radenci", "radlje-ob-dravi",
  "radovljica", "ravne-na-koroskem", "razkrizje", "recica-ob-savinji", "rence-vogrsko",
  "ribnica", "ribnica-na-pohorju", "rogaska-slatina", "rogasovci", "rogatec", "ruse",
  "salovci", "savinjska", "savudrija", "selnica-ob-dravi", "semic", "sempeter-vrtojba",
  "sencur", "sentilj", "sentjernej", "sentjur", "sentjur-pri-celju", "sentrupert", "sevnica",
  "sezana", "sibensko-kninska-zupanija", "skocjan", "skofja-loka", "skofljica",
  "slovenj-gradec", "slovenska-bistrica", "slovenske-konjice", "smarje-pri-jelsah",
  "smarjeske-toplice", "smartno-ob-paki", "smartno-pri-litiji", "sodrazica", "solcava",
  "sostanj", "spodnjeposavska", "sredisce-ob-dravi", "starse", "store", "straza",
  "sveta-ana", "sveta-trojica-v-slovenskih-goricah", "sveti-andraz-v-slovenskih-goricah",
  "sveti-jurij-ob-scavnici", "sveti-jurij-v-slovenskih-goricah", "sveti-tomaz", "tabor",
  "tisina", "tolmin", "trbovlje", "trebnje", "trnovska-vas", "trzic", "trzin", "turnisce",
  "umag", "velenje", "velika-polana", "velike-lasce", "verzej", "videm", "vipava", "vitanje",
  "vodice", "vojnik", "vransko", "vrhnika", "vrsar", "vse-regije", "vuzenica",
  "zagorje-ob-savi", "zalec", "zavrc", "zelezniki", "zetale", "ziri", "zirovnica", "zrece",
  "zuzemberk"
];

function stev(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function niz(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// --- 1. faza: kategorijske strani -----------------------------------------

function rezine(): KvadratRezina[] {
  const vse: KvadratRezina[] = [];
  for (const p of [
    { potPosel: "buy" as const, posel: "prodaja" as const },
    { potPosel: "rent" as const, posel: "oddaja" as const },
  ]) {
    for (const v of VRSTE) {
      for (const obcina of OBCINE) {
        vse.push({
          oznaka: `${p.potPosel}/${v.pot}/${obcina}`,
          posel: p.posel,
          potPosel: p.potPosel,
          potVrsta: v.pot,
          tip: v.tip,
          obcina,
        });
      }
    }
  }
  return vse;
}

function seznamUrl(r: KvadratRezina, stran: number): string {
  // Paginacije ni: `?page=2` in `?p=2` vrneta isto prvo kartico. Rezina je
  // zato natanko ena stran in vsaka nadaljnja bi bila isti obisk dvakrat.
  if (stran > 1) throw new Error(`kvadrat.si nima paginacije (zahtevana stran ${stran})`);
  return `${KORENSKI}/ads/${r.potPosel}/${r.potVrsta}/${r.obcina}`;
}

/** Kar brskalnik vrne s seznama; razčlenitev teče v Node. */
type SurovaKvadratKartica = {
  href: string;
  besedilo: string;
  slika: string | null;
};

async function preberiSeznam(page: Page): Promise<{
  kartice: SurovaKartica[];
  zadnjaStran: number | null;
  skupajZadetkov?: number | null;
}> {
  // VIRTUALNO DRSENJE. Ionic izrise besedilo kartice samo, dokler je ta v
  // vidnem polju, in ga ob odmiku spet odstrani. Zato ne gre ne brati "po
  // drsenju" (prve kartice so takrat ze prazne) ne brati "brez drsenja" (vidnih
  // je le ~20 od 150). Pobiramo torej MED drsenjem: po vsakem koraku poberemo
  // kartice, ki trenutno imajo besedilo, in jih zlijemo v slovar po naslovu.
  // Merjeno 15. 9. 2026: rent/flat/ljubljana da brez tega 18 popolnih zapisov
  // od 150, s tem pa vse.
  const surove = await page.evaluate<SurovaKvadratKartica[]>(async () => {
    const zbrano = new Map<string, SurovaKvadratKartica>();
    let brezNovih = 0;
    for (let korak = 0; korak < 60 && brezNovih < 3; korak += 1) {
      const prej = zbrano.size;
      for (const a of Array.from(document.querySelectorAll('a[href^="/ad/"]'))) {
        const href = a.getAttribute("href") ?? "";
        if (!/^\/ad\/[a-f0-9]{24}$/.test(href)) continue;
        let k: HTMLElement = a as HTMLElement;
        for (let i = 0; i < 6 && k.parentElement; i += 1) {
          if (k.tagName === "ION-CARD") break;
          k = k.parentElement;
        }
        const besedilo = (k.innerText || "").replace(/\s+/g, " ").trim();
        // Prazna kartica pomeni "trenutno ni izrisana" in NE "ni podatkov":
        // ze zbranega zapisa zato nikoli ne povozimo s prazno razlicico.
        const staro = zbrano.get(href);
        if (staro && staro.besedilo.length >= besedilo.length) continue;
        zbrano.set(href, {
          href,
          besedilo,
          slika: k.querySelector("img")?.getAttribute("src") ?? null,
        });
      }
      brezNovih = zbrano.size > prej ? 0 : brezNovih + 1;
      window.scrollBy(0, Math.round(window.innerHeight * 0.8));
      for (const v of Array.from(document.querySelectorAll("ion-content"))) {
        const el = v as HTMLElement & { scrollByPoint?: (x: number, y: number, ms: number) => Promise<void> };
        if (typeof el.scrollByPoint === "function") {
          await el.scrollByPoint(0, Math.round(window.innerHeight * 0.8), 0);
        }
      }
      await new Promise((r) => setTimeout(r, 450));
    }
    // Kartice, ki se nikoli ne izrisejo, OBDRZIMO: naslov je veljaven, posel in
    // tip poznamo iz rezine, vse ostalo pa doda 2. faza. Zavreci oglas zato, ker
    // ga brskalnik ni utegnil izrisati, bi pomenilo tiho luknjo v katalogu.
    return Array.from(zbrano.values());
  });

  const kartice: SurovaKartica[] = surove.map((s) => {
    // Vzorec besedila kartice (15. 9. 2026):
    //   "1 / 5 Zabnica, Gorenjska, 4209 Zabnica Parcela, nakup, 270,000EUR, 561m2 Vir: baza (24.04.2026)"
    //   "1 / 5 1000 Bezigrad 4-sobno, najem, 2,300EUR/mesec, 111.2m2 Vir: stoja (11.09.2026)"
    //
    // DVE PASTI, obe ugotovljeni na zivih karticah:
    //  1. LOKACIJA SAMA VSEBUJE VEJICE ("Zabnica, Gorenjska, 4209 Zabnica"),
    //     zato rezanje po prvi vejici odreze kraj na pol. Zanesljiva sidra sta
    //     ", nakup," in ", najem,": vse pred njima je lokacija + vrsta, zadnja
    //     beseda pa je vrsta ("Parcela", "4-sobno").
    //  2. VIR PISE STEVILA PO ANGLESKO: vejica loci tisocice ("270,000EUR",
    //     "2,434m2"), pika pa decimalke ("111.2m2"). Skupni `cenaIz`/`izOpisa`
    //     pricakujeta slovenski zapis in bi iz "2,434m2" naredila 434 - zato
    //     stevilke razclenimo tukaj in ju za ti dve polji ne klicemo.
    const predPoslom = /^(.*?),\s*(?:nakup|najem)\s*,/.exec(s.besedilo)?.[1] ?? null;
    const brezStevca = (predPoslom ?? "")
      .replace(/^\d+\s*\/\s*\d+\s*/, "")
      .replace(/^-?\d+%\s*/, "")
      .trim();
    // Zadnja beseda je vrsta nepremicnine, ki jo ze poznamo iz rezine.
    const deliLok = brezStevca.split(/\s+/).filter(Boolean);
    const celaLokacija = deliLok.length > 1 ? deliLok.slice(0, -1).join(" ") : "";
    // Za `kraj` vzamemo najbolj specificen del - prvega pred vejico - in mu
    // odstranimo postno stevilko ("1000 Bezigrad" -> "Bezigrad").
    const lokacija =
      celaLokacija
        .split(",")[0]
        .replace(/^\d{4}\s+/, "")
        .trim() || null;

    const cenaTxt = /([\d,]+(?:\.\d+)?)\s*€/.exec(s.besedilo)?.[1] ?? null;
    const cena = cenaTxt ? Number(cenaTxt.replace(/,/g, "")) : null;
    const povrTxt = /([\d,]+(?:\.\d+)?)\s*m²/.exec(s.besedilo)?.[1] ?? null;
    const povrsina = povrTxt ? Number(povrTxt.replace(/,/g, "")) : null;

    const izvor = /Vir:\s*([\w.-]+)/.exec(s.besedilo)?.[1] ?? null;
    const odSlik = /^(\d+)\s*\/\s*(\d+)/.exec(s.besedilo)?.[2] ?? null;
    return {
      url: `${KORENSKI}${s.href}`,
      virId: s.href.replace("/ad/", ""),
      lokacija,
      naslovVrstica: s.besedilo.slice(0, 200) || null,
      opis: null,
      // Ze prevedena v stevilko; `normaliziraj` je ne poslje se skozi `cenaIz`.
      cenaBesedilo: cena !== null && Number.isFinite(cena) ? String(cena) : null,
      telefon: null,
      // „agencija" je pri tem viru IZVORNI PORTAL, ne posrednik — vir posrednika
      // na seznamu ne pove, izvor pa je za agregator pomembnejši podatek.
      agencija: izvor,
      slika: s.slika,
      stSlik: stevilo(odSlik ?? undefined),
      povrsinaKartica: povrsina !== null && Number.isFinite(povrsina) ? povrsina : null,
    } as SurovaKartica & { povrsinaKartica: number | null };
  });

  // Ena stran na rezino. Prazna kategorija je pri tem viru res prazna in ne
  // mehka blokada, zato vrnemo 0 kot izmerjeno število in ne null.
  return { kartice, zadnjaStran: 1, skupajZadetkov: kartice.length };
}

function normaliziraj(r: SurovaKartica, rezina: KvadratRezina): NormaliziranOglas {
  // `izOpisa` tu sluzi SAMO za zastavice (vecEnot, zaObnovo ...); stevilke
  // razclenimo zgoraj sami, ker vir pise po anglesko.
  const iz = izOpisa(r.naslovVrstica ?? "");
  const sKartice = (r as SurovaKartica & { povrsinaKartica?: number | null }).povrsinaKartica ?? null;
  return {
    vir: VIR,
    virId: r.virId,
    url: r.url,
    naslov: r.naslovVrstica,
    tip: rezina.tip,
    podtip: null,
    posel: rezina.posel,
    regija: null,
    kraj: r.lokacija,
    cenaEur: r.cenaBesedilo ? Number(r.cenaBesedilo) : null,
    povrsinaM2: sKartice ?? iz.povrsinaM2,
    zemljisceM2: iz.zemljisceM2,
    letoIzgradnje: iz.letoIzgradnje,
    letoAdaptacije: iz.letoAdaptacije,
    nadstropje: iz.nadstropje,
    vecEnot: iz.vecEnot,
    stEnot: iz.stEnot,
    stEnotOcena: iz.stEnotOcena,
    loceneKuhinje: iz.loceneKuhinje,
    looceniVhodi: iz.looceniVhodi,
    zaObnovo: iz.zaObnovo,
    zaInvesticijo: iz.zaInvesticijo,
    opis: null,
    prodajalec: null,
    agencija: r.agencija,
    telefon: null,
    slikaUrl: r.slika,
    stSlik: r.stSlik,
    raw: r as unknown as Record<string, unknown>,
  };
}

// --- 2. faza: detajlna stran ----------------------------------------------

type SurovDetajlKvadrat = {
  lastnost: Record<string, unknown> | null;
  slike: string[];
};

/**
 * Iz strani potegne `serverApp-state` in iz njega zapis oglasa.
 *
 * Stanje je slovar, čigar ključi so URL-ji zaledja; zanima nas tisti z
 * `/api/properties/<id>`. Do zaledja NE hodimo sami (robots.txt prepoveduje
 * `/api`) — beremo samo to, kar je stran že prinesla s sabo.
 */
async function preberi(page: Page): Promise<Detajl> {
  const surovo = await page.evaluate<SurovDetajlKvadrat>(() => {
    const prazno: SurovDetajlKvadrat = { lastnost: null, slike: [] };
    const el = document.querySelector("script#serverApp-state");
    if (!el) return prazno;
    let stanje: Record<string, unknown>;
    try {
      stanje = JSON.parse(el.textContent || "{}") as Record<string, unknown>;
    } catch {
      return prazno;
    }
    let lastnost: Record<string, unknown> | null = null;
    const slike: string[] = [];
    for (const [kljuc, vrednost] of Object.entries(stanje)) {
      if (!vrednost || typeof vrednost !== "object") continue;
      if (kljuc.includes("/api/properties/") && !lastnost) {
        lastnost = vrednost as Record<string, unknown>;
      }
      if (kljuc.includes("/api/files/list/")) {
        const dat = (vrednost as { files?: unknown }).files;
        if (Array.isArray(dat)) {
          for (const f of dat) {
            const id = (f as { _id?: unknown })?._id;
            if (typeof id === "string") {
              slike.push(`https://api01.kvadrat.si/api/files/image/${id}`);
            }
          }
        }
      }
    }
    return { lastnost, slike };
  });

  const p = surovo.lastnost;
  if (!p) return {};

  const lokacija = (p.located ?? {}) as Record<string, unknown>;
  const cena = (p.price ?? {}) as Record<string, unknown>;
  const izvor = (p.source ?? {}) as Record<string, unknown>;
  const ugodnosti = (p.amenities ?? {}) as Record<string, unknown>;
  const ogrevanje = (p.heating ?? {}) as Record<string, unknown>;

  const vrsteOgrevanja = Object.entries(ogrevanje)
    .filter(([, v]) => v === true)
    .map(([k]) => k);

  const lastnosti: Record<string, string> = {};
  for (const [k, v] of Object.entries(ugodnosti)) {
    if (v === true) lastnosti[k] = "da";
  }
  const izvirnik = niz(izvor.sourceUrl);
  if (izvirnik) lastnosti.izvirnik = izvirnik;
  const izvorniPortal = niz(izvor.sourceName);
  if (izvorniPortal) lastnosti.izvorni_portal = izvorniPortal;

  return {
    povrsinaM2: stev(p.floorSize),
    zemljisceM2: stev(p.landSize),
    letoIzgradnje: stev(p.yearBuilt),
    letoAdaptacije: stev(p.yearRenovated),
    stSob: stev(p.rooms),
    stSpalnic: stev(p.bedrooms),
    stKopalnic: stev(p.bathrooms),
    cenaEur: stev(cena.current),
    kraj: niz(lokacija.district) ?? niz(lokacija.county),
    opis: niz(p.description),
    datumObjave: niz(p.created)?.slice(0, 10) ?? null,
    dvigalo: typeof ugodnosti.lift === "boolean" ? (ugodnosti.lift as boolean) : null,
    ogrevanje: vrsteOgrevanja.length > 0 ? vrsteOgrevanja.join(", ") : null,
    // Slike ostanejo SAMO kot naslovi: gradivo je avtorsko zaščiteno (2. točka
    // pogojev), vir pa je poleg tega sam agregator tujih fotografij.
    slikeUrls: surovo.slike.length > 0 ? surovo.slike : null,
    lastnosti,
  };
}

export const adapter: VirAdapter = {
  vir: VIR,
  // Crawl-delay ni naveden, zato si ga določimo sami in raje predolgega.
  omejitve: { zamikMs: 8_000 },
  crawlDelayS: null,
  pricakovanRazpon: [500, 20_000],
  slikePolitika: "referenca",
  dovoljenArhivSlik: false,
  svezKontekstNaStran: false,
  // Rezina je ena stran; meji sta zato varovalki, ne proračun.
  najvecStrani: 200,
  najvecStraniNaRezino: 1,
  dnevnaMejaStrani: 200,
  dnevniProracunVira: 300,
  // Kategorije niso razvrščene po novosti, zato zgodnja ustavitev ne pride v poštev.
  razvrsceniPoNovosti: false,
  hlajenjeUr: 12,
  detajli: {
    zamikMs: 8_000,
    kvota: 100,
    preberi,
  },
  pravno:
    "robots.txt (15. 9. 2026) prepoveduje samo tehnične poti (/admin, /api, /backend, /src …); " +
    "seznami in oglasi so dovoljeni, Crawl-delay ni naveden, Content-Signal ga ni. " +
    "Pogoji (12. 6. 2024) NIKJER ne omenjajo robotov, avtomatskih poizvedb, meta-iskanja ali " +
    "scrapinga — edini tak med devetimi pregledanimi slovenskimi portali. Imajo pa splošen " +
    "pridržek avtorskih pravic na gradivu, zato slik ne kopiramo. POZOR: kvadrat.si je sam " +
    "agregator agencijskih strani (bazarealestate.com, abc-nepremicnine.si, stoja-trade.si …); " +
    "vsebina je iz druge roke, zato vsak oglas hrani povezavo na izvirnik pri agenciji.",
  rezine,
  seznamUrl,
  preberiSeznam,
  normaliziraj,
};
