import type { NormaliziranOglas } from "../db.js";
import type { Rezina, SurovaKartica, VirAdapter } from "./vmesnik.js";
import { brezEntitet, prenesi } from "./http.js";

/**
 * gov.si — JAVNE OBJAVE DRŽAVE: dražbe, javna zbiranja ponudb, namere.
 *
 * Kje so deali: država (MNZ, Ministrstvo za obrambo, DRSI …) prodaja stanovanja,
 * hiše, zemljišča in stare objekte po izklicni ceni iz cenitve. Po ZSPDSLS-1 je
 * objava na spletni strani upravljavca pogosto EDINO mesto, kjer se pojavijo —
 * nobenega od teh oglasov ni na portalih.
 *
 * Pravna presoja (28.–29. 9. 2026, presoja + dva skeptika): robots.txt gov.si
 * dovoljuje /zbirke/javne-objave/, zaščite ni, pogoji uporabe portala gov.si
 * samodejnega dostopa ne omejujejo; objave so informacije javnega značaja.
 *
 * Seznam je strežniško izrisana tabela (table.tender-list-table). Cene v njem
 * NI — izklicna cena je v razpisu (PDF), ki ga ne beremo; oglas zato nosi
 * ceno "neznana" in povezavo na razpis. Seznam je majhen (nekaj objav na
 * vrsto), zato ena stran s 100 zadetki na vrsto zadošča.
 */

const VIR = "gov.si";
const OSNOVA = "https://www.gov.si";

type RezinaGov = Rezina & { vrsta: number; opis: string };

/** 5 = javne dražbe, 10 = javna zbiranja ponudb, 11 = namere o neposredni pogodbi. */
const REZINE: RezinaGov[] = [
  { oznaka: "drazbe", vrsta: 5, opis: "Javna dražba" },
  { oznaka: "zbiranja-ponudb", vrsta: 10, opis: "Javno zbiranje ponudb" },
  { oznaka: "namere-neposredna", vrsta: 11, opis: "Namera o sklenitvi neposredne pogodbe" },
];

function seznamUrl(r: Rezina): string {
  return `${OSNOVA}/zbirke/javne-objave/?type=${(r as RezinaGov).vrsta}&status=ongoing&nrOfItems=100`;
}

/**
 * Nepremičnina ali ne? Finančna uprava na istem seznamu prodaja avtomobile in
 * stroje, obramba pralne stroje. Nepremičnino izda besedišče naslova: parcela,
 * k. o., ID znak, stanovanje, zemljišče, stavba, poslovni prostor.
 */
export function jeNepremicnina(naslov: string): boolean {
  const t = naslov.toLowerCase();
  if (/avtomobil|vozil|stroj|oprema|plovil|motorn|traktor|prikolic/.test(t) && !/nepremičn|parc/.test(t)) return false;
  // Brezplačna raba (za društva) ni posel; javno naročilo za "zamenjavo peči
  // v objektu" ni prodaja — zato mora biti poleg nepremičnine tudi posel.
  if (/brezplačn/.test(t)) return false;
  const posel = /prodaj|dražb|oddaj|najem|odsvoj|neposredn\w* pogodb/.test(t);
  return posel && /nepremičn|parc\.|parcel|k\.\s*o\.|id znak|stanovanj|zemljišč|stavb|poslovn\w* prostor|hiš[ae]|garaž/.test(t);
}

function tipIz(naslov: string): string | null {
  const t = naslov.toLowerCase();
  if (/stanovanj/.test(t)) return "stanovanje";
  if (/poslovn\w* prostor|poslovn\w* stavb/.test(t)) return "poslovni_prostor";
  if (/garaž/.test(t)) return "garaza";
  if (/hiš[ae]|stanovanjsk\w* stavb/.test(t)) return "hisa";
  if (/zemljišč|parc|k\.\s*o\./.test(t)) return "posest";
  return null;
}

/** "k. o. 1405-Mali Videm" → "Mali Videm"; "…, Naselje na Šahtu 15, Kisovec" → "Kisovec". */
function krajIz(naslov: string): string | null {
  const ko = naslov.match(/k\.\s*o\.\s*\d{3,4}\s*[-–]\s*([A-ZČŠŽ][\wčšžćđ .-]{2,60})/);
  if (ko) {
    // Ime k. o. se konča pred dopolnilom: "Selnica ob Muri v deležu do celote".
    const ime = ko[1].split(/\s+(?:v\s+deležu|do\s+celote|s\s+|in\s+|ter\s+|parc)|,/)[0].trim();
    return ime || null;
  }
  const naslovni = naslov.match(/z naslovom[^,]*,\s*([A-ZČŠŽ][\wčšžćđ .-]{2,40})\s*$/);
  return naslovni ? naslovni[1].trim() : null;
}

/** Čisto razčlenjevanje strani — brez omrežja. */
export function karticeIzHtml(
  html: string
): { kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov: number | null } {
  const tabela = html.slice(html.indexOf("tender-list-table"));
  const telo = tabela.slice(tabela.indexOf("<tbody"), tabela.indexOf("</tbody>"));
  const kartice: SurovaKartica[] = [];
  for (const vrstica of telo.split("<tr").slice(1)) {
    const celica = (razred: string) =>
      brezEntitet((vrstica.match(new RegExp(`class="${razred}[^"]*"[^>]*>\\s*<div class="cell">([\\s\\S]*?)</div>`))?.[1] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const povezava = vrstica.match(/<a href="(\/zbirke\/javne-objave\/[^"]+)"/)?.[1];
    const naslov = celica("td-title");
    if (!povezava || !naslov || !jeNepremicnina(naslov)) continue;
    const sifra = celica("td-id");
    const izdajatelj = celica("td-publisher");
    const objava = celica("td-published-date");
    const rok = celica("td-due-date");
    kartice.push({
      url: `${OSNOVA}${povezava}`,
      virId: povezava.replace(/^\/zbirke\/javne-objave\/|\/$/g, ""),
      lokacija: krajIz(naslov),
      naslovVrstica: naslov,
      opis: [naslov, izdajatelj && `Prodajalec: ${izdajatelj}`, sifra && `Šifra: ${sifra}`, objava && `Objavljeno ${objava}`, rok && `Rok za prijavo ${rok}`]
        .filter(Boolean)
        .join(". "),
      cenaBesedilo: null,
      telefon: null,
      agencija: izdajatelj || null,
      slika: null,
      stSlik: null,
      surovo: { sifra, izdajatelj, objava, rok },
    });
  }
  // En seznam s 100 zadetki na vrsto; več strani pri tekočih objavah ni.
  return { kartice, zadnjaStran: 1, skupajZadetkov: null };
}

async function preberiHttp(r: Rezina, _stran: number, ua: string) {
  return karticeIzHtml(await prenesi(seznamUrl(r), ua));
}

export function normaliziraj(k: SurovaKartica, r: Rezina): NormaliziranOglas {
  const rez = r as RezinaGov;
  const naslov = k.naslovVrstica ?? "";
  return {
    vir: VIR,
    virId: k.virId,
    url: k.url,
    naslov: `${rez.opis}: ${naslov}`.slice(0, 300),
    tip: tipIz(naslov),
    podtip: rez.oznaka,
    posel: /oddaj|najem/i.test(naslov) ? "oddaja" : "prodaja",
    regija: null,
    kraj: k.lokacija,
    // Izklicna cena je v razpisu (PDF), ne na seznamu — raje prazno kot ugibano.
    cenaEur: null,
    povrsinaM2: null,
    zemljisceM2: null,
    letoIzgradnje: null,
    letoAdaptacije: null,
    nadstropje: null,
    vecEnot: false,
    stEnot: null,
    stEnotOcena: null,
    loceneKuhinje: null,
    looceniVhodi: null,
    zaObnovo: false,
    zaInvesticijo: false,
    opis: k.opis,
    prodajalec: k.agencija,
    agencija: null,
    telefon: null,
    slikaUrl: null,
    stSlik: null,
    raw: { ...(k.surovo ?? {}), rezina: rez.oznaka },
  };
}

export const adapter: VirAdapter = {
  vir: VIR,
  omejitve: { zamikMs: 10_000 },
  crawlDelayS: null,
  pricakovanRazpon: [0, 400],
  slikePolitika: "referenca",
  dovoljenArhivSlik: false,
  svezKontekstNaStran: false,
  // Tri vrste × ena stran. Meje so varovalke.
  najvecStrani: 6,
  najvecStraniNaRezino: 1,
  dnevnaMejaStrani: 12,
  dnevniProracunVira: 15,
  razvrsceniPoNovosti: false,
  hlajenjeUr: 24,
  pravno:
    "robots.txt gov.si dovoljuje /zbirke/javne-objave/, Crawl-delay ni naveden, zaščite ni. Pogoji portala gov.si " +
    "samodejnega dostopa ne omejujejo; javne objave o razpolaganju z državnim premoženjem so informacije javnega " +
    "značaja. Presoja in dva neodvisna skeptika (28.–29. 9. 2026) omejitve niso našli. Beremo samo seznam (brez PDF prilog).",
  rezine: () => REZINE,
  seznamUrl: (r) => seznamUrl(r),
  preberiHttp,
  preberiSeznam: async () => {
    throw new Error("gov.si se bere brez brskalnika (preberiHttp)");
  },
  normaliziraj,
};
