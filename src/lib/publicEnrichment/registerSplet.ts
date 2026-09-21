import "server-only";
import { lookup } from "node:dns/promises";
import { jeBesedilnaStran, preberiTeloOmejeno, providerFetch } from "./httpClient";
import { msUntilNextSlot } from "./rateLimiter";
import { stripHtmlToText } from "./htmlText";
import { hostOf, identifyingTokens, normalize, pageBelongsToCompany, searchEngineAvailable, searchForWebsite } from "./websiteSearch";
import { BLOCKED_DOMAINS } from "@/lib/enrichment/blockedDomains";

/**
 * Kontakti podjetja z njegove lastne spletne strani — za register, v masi.
 *
 * Zakaj ta pot: AJPES od 15. 9. 2026 kartice podjetij ščiti z reCAPTCHA in
 * jih da ~10 na ~10 ur (izmerjeno v dnevniku delavca). Za 253.000 podjetij je
 * to trideset let. Spletna stran podjetja je edini vir kontaktov, ki ni
 * odvisen od tuje kvote: ena stran, en lastnik, javno objavljen kontakt.
 *
 * Zakaj brez umetne inteligence: ponudnik `providers/website.ts` za vsako
 * stran kliče OpenAI — pri 250.000 straneh je to strošek v stotinah evrov za
 * podatek, ki ga da regex. E-pošta in telefon imata obliko; ta se ne ugiba.
 *
 * Vrstni red: najprej ugibanje domene iz imena (brez iskalnika — DNS in ena
 * zahteva, dokaz lastništva na strani), šele nato DuckDuckGo. Iskalnik je
 * ozko grlo: ena zahteva naenkrat z razmikom, ob 403 hlajenje in nikoli
 * obhod. Vsaka domena, ki jo ugibanje najde, je ena zahteva manj tja.
 */

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "sl-SI,sl;q=0.9",
};

/** Ena spletna stran ne sme držati delavca dlje od tega. */
const ROK_MS = 45_000;
const ZAHTEVA_MS = 8_000;
const NAJVEC_KANDIDATOV_DOMEN = 5;
const NAJVEC_KONTAKTNIH_STRANI = 2;

/** Besede pravne oblike in polnila, ki ničesar ne identificirajo. */
const POLNILA = new Set([
  "doo", "d", "o", "sp", "dd", "kd", "zoo", "so", "p", "s", "k", "z", "n", "e",
  "podjetje", "storitve", "storitev", "trgovina", "proizvodnja", "in", "za", "ter", "druge", "drugo",
  "the", "zavod", "drustvo", "zadruga", "nosilec", "dejavnosti", "dejavnost", "posredovanje",
]);

export type VhodSpleta = {
  naziv: string;
  kratkiNaziv?: string | null;
  kraj?: string | null;
  davcna?: string | null;
};

export type IzidSpleta = {
  /**
   * „brez_iskanja“: ugibanje domene ni uspelo, iskalnik pa ni bil na voljo
   * (CAPTCHA/hlajenje). Ni isto kot „ni_strani“ — te vrstice kasnejši prehod
   * z iskalnim API-jem lahko dopolni; „ni_strani“ je dokončen odgovor.
   */
  stanje: "najdena" | "ni_strani" | "brez_iskanja";
  spletnaStran: string | null;
  eposta: string | null;
  telefon: string | null;
  /** Kako je bila stran najdena oziroma zakaj ni — v slovenščini, za nadzor. */
  opomba: string;
  zahtev: number;
};

/** Besede imena v izvirnem vrstnem redu (za sestavljanje domene). */
function besedeImena(ime: string): string[] {
  return normalize(ime)
    .split(" ")
    .filter((b) => b.length >= 2 && !POLNILA.has(b) && !/^\d+$/.test(b));
}

/**
 * Domene, ki bi jih podjetje s tem imenom najverjetneje imelo.
 *
 * „MLINAR POHIŠTVO d.o.o.“ → mlinarpohistvo.si, mlinar-pohistvo.si, mlinar.si,
 * mlinarpohistvo.com. Ugibanje je poceni (DNS + ena zahteva), napačen zadetek
 * pa ustavi dokaz lastništva — ista pravila kot pri iskalniku.
 */
export function kandidatiDomen(kratkiNaziv: string | null | undefined, naziv: string): string[] {
  const osnova = (kratkiNaziv && kratkiNaziv.trim()) || naziv.split(",")[0] || naziv;
  const besede = besedeImena(osnova).slice(0, 3);
  if (besede.length === 0) return [];
  const skupaj = besede.join("");
  const sPomisljaji = besede.join("-");
  const kandidati: string[] = [];
  const dodaj = (oznaka: string, tld: string) => {
    if (oznaka.length < 3 || oznaka.length > 40) return;
    const d = `${oznaka}.${tld}`;
    if (!kandidati.includes(d)) kandidati.push(d);
  };
  dodaj(skupaj, "si");
  if (besede.length > 1) dodaj(sPomisljaji, "si");
  if (besede.length > 1 && besede[0].length >= 5) dodaj(besede[0], "si");
  dodaj(skupaj, "com");
  dodaj(skupaj, "eu");
  return kandidati.slice(0, NAJVEC_KANDIDATOV_DOMEN);
}

/**
 * Domena iz same prve besede („pintar.si“ za PINTAR EQUINE d.o.o.) je lahko
 * od kogarkoli s tem priimkom. Zanjo „domena vsebuje pintar“ ni dokaz —
 * potrebna je davčna številka ali celotno ime na strani. Napačno pripisana
 * e-pošta je hujša od manjkajoče.
 */
function jeDomenaPrveBesede(host: string, kratkiNaziv: string | null | undefined, naziv: string): boolean {
  const osnova = (kratkiNaziv && kratkiNaziv.trim()) || naziv.split(",")[0] || naziv;
  const besede = besedeImena(osnova);
  return besede.length > 1 && host === `${besede[0]}.si`;
}

/**
 * DNS prek sistemskega razreševalnika (`lookup`, getaddrinfo).
 *
 * 21. 9. 2026 sem to zamenjal s `Resolver` (c-ares), ker ne rabi bazena niti
 * — in v petnajstih minutah napačno označil 800 podjetij kot „brez strani“.
 * Razlog: c-ares na tem računalniku prebere nastavitve in dobi strežnik
 * 127.0.0.1, kjer ni nikogar, zato je vsaka domena vrnila ECONNREFUSED.
 * Izmerjeno takoj zatem: `resolve4("google.com")` → ECONNREFUSED,
 * `lookup("google.com")` → 172.217.20.78.
 *
 * `lookup` uporablja nastavitve operacijskega sistema in dela. Teče na
 * bazenu niti libuv (privzeto štiri), zato ima zaganjalnik strani nastavljen
 * UV_THREADPOOL_SIZE — sicer bi pri osmih sočasnih obogatitvah DNS postal
 * novo ozko grlo. Časovnik poizvedbe ne prekliče, le neha čakati; ker je rok
 * kratek, to niti ne zadrži dolgo.
 */
async function domenaObstaja(host: string): Promise<boolean> {
  let casovnik: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      lookup(host),
      new Promise((_, zavrni) => {
        casovnik = setTimeout(() => zavrni(new Error("dns rok")), 3_000);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    // Brez tega ostane na vsako preverjeno domeno živ časovnik tri sekunde.
    if (casovnik) clearTimeout(casovnik);
  }
}

type Stran = { url: string; host: string; html: string };

/** Naslovna stran, https in ob neuspehu http. Ena zahteva na poskus, brez ponovitev. */
async function naslovnaStran(host: string, stevec: { n: number }): Promise<Stran | null> {
  for (const shema of ["https", "http"]) {
    stevec.n += 1;
    try {
      const r = await providerFetch("website", `${shema}://${host}`, { headers: HEADERS, maxAttempts: 1, timeoutMs: ZAHTEVA_MS });
      if (!r.ok) continue;
      // Ne vsak odgovor je stran: korenski naslov zna vrniti tudi video ali
      // arhiv. Telo beremo omejeno — glej preberiTeloOmejeno v httpClient.ts.
      if (!jeBesedilnaStran(r)) {
        await r.body?.cancel().catch(() => {});
        continue;
      }
      const { besedilo: html } = await preberiTeloOmejeno(r);
      const koncniHost = hostOf(r.url) ?? host;
      if (BLOCKED_DOMAINS.some((d) => koncniHost === d || koncniHost.endsWith(`.${d}`))) return null;
      return { url: r.url || `${shema}://${host}`, host: koncniHost, html };
    } catch {
      // Naslednja shema ali naslednji kandidat.
    }
  }
  return null;
}

// --- kontakti ----------------------------------------------------------------

/** Naslovi, ki jih strani vsebujejo, a niso kontakt tega podjetja. */
const SUM_EPOSTE =
  /(example|sentry|wixpress|wix\.com|domain\.com|email\.com|yourdomain|mysite|yoursite|test\.com|localhost|schema\.org|w3\.org|googleapis|gstatic|cloudflare|\.png$|\.jpe?g$|\.gif$|\.svg$|\.webp$|\.css$|\.js$)/i;
const SUM_LOKALNI = new Set(["email", "e-mail", "name", "ime", "user", "username", "vas", "vasa", "your", "someone", "mail", "xxx", "test"]);
const ZAZELENI_LOKALNI = ["info", "prodaja", "tajnistvo", "office", "kontakt", "narocila", "uprava", "pisarna", "sales", "trgovina", "servis"];

function odkodirajOsnovno(html: string): string {
  return html
    .replace(/&#64;|&commat;/gi, "@")
    .replace(/&#46;|&period;/gi, ".")
    .replace(/\s*\[\s*(at|afna)\s*\]\s*|\s*\(\s*(at|afna)\s*\)\s*/gi, "@")
    .replace(/\s*\[\s*(dot|pika)\s*\]\s*/gi, ".");
}

/**
 * Vzorec za e-pošto — brez gnezdenega ponavljanja.
 *
 * Prejšnji vzorec `…@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+` je imel ponavljanje
 * znotraj ponavljanja in je na pravi strani (dbk.si, 808 kB) tekel **39
 * sekund** — izmerjeno 19. 9. 2026. Ker je JavaScript enonitni, je ves ta čas
 * stala tudi javna stran; zaradi tega je obogatitev tekla 230 podjetij na uro
 * namesto tisočev, zahteva pa je zamudila lastni 60-sekundni rok, ker se
 * časovnik ni imel kdaj sprožiti.
 *
 * Nov vzorec ima domeno v enem samem znakovnem razredu (brez gnezdenja) in
 * zahteva črkovno končnico: 150 ms na isti strani. Je tudi natančnejši —
 * tistih 39 sekund je prejšnji porabil, da je „našel“ `ol-mapbox-style@13.0.1`,
 * torej različico paketa in ne e-pošte.
 */
const VZOREC_EPOSTE = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}/g;
const VZOREC_MAILTO = /mailto:([^"'?\s<>]{1,320})/gi;
/** Varovalka: iskanje kontaktov nikoli ne teče čez več kot toliko znakov. */
const NAJVEC_ZNAKOV_ZA_ISKANJE = 1_000_000;

/** Najboljša e-pošta na straneh podjetja; null, če je ni. */
export function najdiEposto(htmlji: string[], domena: string): string | null {
  const ocene = new Map<string, number>();
  const golaDomena = domena.replace(/^www\./, "");
  for (const surovCel of htmlji) {
    const surov = surovCel.slice(0, NAJVEC_ZNAKOV_ZA_ISKANJE);
    const html = odkodirajOsnovno(surov);
    const vMailto = new Set<string>();
    for (const m of html.matchAll(VZOREC_MAILTO)) vMailto.add(m[1].toLowerCase());
    for (const m of html.matchAll(VZOREC_EPOSTE)) {
      const e = m[0].toLowerCase().replace(/^[._%+-]+/, "");
      if (e.length > 80 || SUM_EPOSTE.test(e)) continue;
      const [lokalni, dom] = e.split("@");
      if (!lokalni || !dom || SUM_LOKALNI.has(lokalni)) continue;
      // Končnica mora biti beseda, ne del datoteke ali številke različice.
      if (!/\.[a-z]{2,}$/.test(dom)) continue;
      let ocena = 1;
      if (dom === golaDomena || golaDomena.endsWith(`.${dom}`) || dom.endsWith(`.${golaDomena}`)) ocena += 10;
      if (ZAZELENI_LOKALNI.some((z) => lokalni.startsWith(z))) ocena += 5;
      if (/noreply|no-reply|webmaster|postmaster|abuse/.test(lokalni)) ocena -= 6;
      if (vMailto.has(e)) ocena += 3;
      ocene.set(e, Math.max(ocene.get(e) ?? -Infinity, ocena));
    }
  }
  let najboljsa: string | null = null;
  let najvec = 0;
  for (const [e, o] of ocene) {
    if (o > najvec) {
      najvec = o;
      najboljsa = e;
    }
  }
  return najboljsa;
}

/** Devet števk z vodilno ničlo — slovenska nacionalna oblika. */
function normalizirajTelefon(surov: string): string | null {
  let stevke = surov.replace(/[^\d+]/g, "");
  if (stevke.startsWith("+386")) stevke = "0" + stevke.slice(4);
  else if (stevke.startsWith("00386")) stevke = "0" + stevke.slice(5);
  stevke = stevke.replace(/\+/g, "");
  if (stevke.length !== 9 || !stevke.startsWith("0")) return null;
  // Ista števka devetkrat ali očitno zaporedje ni telefon.
  if (/^(\d)\1{8}$/.test(stevke) || stevke === "012345678") return null;
  // Mobilne predpone so tri števke (031, 041, 070 …), stacionarne dve (01, 02 …).
  const mobilni = /^0(30|31|40|41|51|64|65|68|69|70|71)/.test(stevke);
  return mobilni ? `${stevke.slice(0, 3)} ${stevke.slice(3, 6)} ${stevke.slice(6)}` : `${stevke.slice(0, 2)} ${stevke.slice(2, 5)} ${stevke.slice(5, 7)} ${stevke.slice(7)}`;
}

/** Najbolj verjeten telefon; `tel:` povezave imajo prednost pred golim besedilom. */
export function najdiTelefon(htmlji: string[]): string | null {
  const ocene = new Map<string, number>();
  const zabelezi = (kandidat: string, ocena: number) => {
    const t = normalizirajTelefon(kandidat);
    if (t) ocene.set(t, Math.max(ocene.get(t) ?? -Infinity, ocena));
  };
  for (const celotenHtml of htmlji) {
    const html = celotenHtml.slice(0, NAJVEC_ZNAKOV_ZA_ISKANJE);
    for (const m of html.matchAll(/href=["']tel:([^"']{1,40})["']/gi)) {
      // decodeURIComponent vrže na pokvarjenem zapisu (npr. "%E0") in bi brez
      // te ograje vrgla stran celotno obogatitev tega podjetja.
      let vrednost = m[1];
      try {
        vrednost = decodeURIComponent(vrednost);
      } catch {
        // Uporabimo, kar je zapisano — številka je pogosto berljiva tudi tako.
      }
      zabelezi(vrednost, 10);
    }
    const besedilo = stripHtmlToText(html);
    for (const m of besedilo.matchAll(/(?:\+386|00386|(?<![\d,])0)[\d][\d\s/()-]{6,13}\d/g)) {
      const pred = besedilo.slice(Math.max(0, m.index! - 28), m.index!);
      // Transakcijski račun, matična in davčna so prav tako nizi števk z
      // ničlo — brez tega bi „SI56 0400 1004 8222 084“ postal telefon.
      if (/(SI\s?\d{2}|TRR|IBAN|mati[cč]|dav[cč]|DDV|ra[cč]un|[cč]rtna|[sš]t\.?\s*(vpisa|reg))[\s:.]*[\d\s]*$/i.test(pred)) continue;
      const blizu = /(tel|telefon|gsm|mobi|klic|faks|fax|\bT\s*:|\bM\s*:|\bF\s*:)/i.test(pred);
      // Faks ni telefon, a je bolje kot nič; telefon ima prednost.
      zabelezi(m[0], /faks|fax|\bF\s*:/i.test(pred) ? 1 : blizu ? 6 : 2);
    }
  }
  let najboljsi: string | null = null;
  let najvec = 0;
  for (const [t, o] of ocene) {
    if (o > najvec) {
      najvec = o;
      najboljsi = t;
    }
  }
  return najboljsi;
}

/** Povezave na kontaktno stran znotraj iste domene. */
export function kontaktnePovezave(html: string, osnova: string): string[] {
  const izhod: string[] = [];
  const hostOsnove = hostOf(osnova);
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = m[1];
    const besedilo = m[2].replace(/<[^>]+>/g, " ");
    if (!/kontakt|contact|o-nas|o_nas|onas|about|impressum|kje-smo|lokacij/i.test(href) && !/kontakt|contact|o nas|about/i.test(besedilo)) continue;
    try {
      const u = new URL(href, osnova);
      if (!/^https?:$/.test(u.protocol)) continue;
      if (hostOf(u.toString()) !== hostOsnove) continue;
      u.hash = "";
      const s = u.toString();
      if (!izhod.includes(s) && s !== osnova) izhod.push(s);
    } catch {
      // Neveljavna povezava ni razlog za neuspeh strani.
    }
    if (izhod.length >= NAJVEC_KONTAKTNIH_STRANI) break;
  }
  return izhod;
}

// --- glavna pot ----------------------------------------------------------------

export async function kontaktiSSpleta(vhod: VhodSpleta): Promise<IzidSpleta> {
  const rok = Date.now() + ROK_MS;
  const stevec = { n: 0 };
  const zapiski: string[] = [];
  const zetoni = identifyingTokens(vhod.kratkiNaziv || vhod.naziv);
  const zetoniDolgi = zetoni.length > 0 ? zetoni : identifyingTokens(vhod.naziv);
  const davcnaStevke = (vhod.davcna ?? "").replace(/\D/g, "");

  let stran: Stran | null = null;
  let kako = "";
  const preizkuseni: string[] = [];

  // 1. Ugibanje domene iz imena — vsi kandidati HKRATI.
  //
  // Zaporedno preverjanje je pomenilo do pet krogov po (DNS 3 s + https 8 s +
  // http 8 s), povprecno 4 s na podjetje, ceprav gre za pet RAZLICNIH
  // streznikov, ki drug z drugim nimajo nic. Ker je to cisto cakanje, jih
  // preverimo naenkrat; vrstni red kandidatov ostane merilo, kateri obvelja.
  const kandidati = kandidatiDomen(vhod.kratkiNaziv, vhod.naziv);
  preizkuseni.push(...kandidati);
  if (kandidati.length > 0 && Date.now() < rok) {
    const zivi = (
      await Promise.all(kandidati.map(async (h) => ((await domenaObstaja(h)) ? h : null)))
    ).filter((h): h is string => h !== null);

    const strani = await Promise.all(
      zivi.map(async (h) => {
        try {
          return await naslovnaStran(h, stevec);
        } catch {
          return null;
        }
      })
    );

    for (let i = 0; i < zivi.length; i += 1) {
      const host = zivi[i];
      const s = strani[i];
      if (!s) continue;
      const dokaz = pageBelongsToCompany(stripHtmlToText(s.html), s.host, zetoniDolgi, davcnaStevke);
      if (!dokaz) {
        zapiski.push(`${host} obstaja, a brez dokaza, da je od tega podjetja`);
        continue;
      }
      if (jeDomenaPrveBesede(host, vhod.kratkiNaziv, vhod.naziv) && !/dav[cč]na|celotno ime/.test(dokaz)) {
        zapiski.push(`${host} obstaja, a je iz same prve besede imena in brez davčne ali celotnega imena na strani`);
        continue;
      }
      stran = s;
      kako = `domena ugibana iz imena (${host}) in potrjena — ${dokaz}`;
      break;
    }
  }

  // 2. Iskalnik, samo če ugibanje ni obrodilo — in samo, če je res na voljo.
  //
  // 16.–17. 9. 2026: DDG je na vsako iskanje vračal 403/CAPTCHO, prilagodljivi
  // omejevalnik je razmik za „google“ napihnil na 120 s in vseh šest bralcev
  // je čakalo v njegovi vrsti — delavec je po 120 s obupal, tempo je padel s
  // 3.600 na 300 podjetij na uro. Če je naslednje mesto v vrsti dlje kot 5 s
  // stran, iskalnik ni „na voljo“, ampak nas odriva; takrat ga preskočimo in
  // vrstica dobi pošteno stanje „brez_iskanja“. Stikalo v okolju iskalnik
  // izklopi povsem, dokler ni zamenjan z API-jem.
  let iskanoZIskalnikom = false;
  const iskalnikDovoljen =
    process.env.REGISTER_SPLET_BREZ_ISKALNIKA !== "1" && searchEngineAvailable() && msUntilNextSlot("google") < 5_000;
  if (!stran && Date.now() < rok && iskalnikDovoljen) {
    stevec.n += 1;
    const r = await searchForWebsite(vhod.kratkiNaziv || vhod.naziv, {
      city: vhod.kraj ?? null,
      vatId: vhod.davcna ?? null,
      fallbackName: vhod.naziv,
      skipHosts: preizkuseni,
    });
    iskanoZIskalnikom = !r.challenged;
    if (r.website) {
      const host = hostOf(r.website) ?? "";
      const s = await naslovnaStran(host, stevec);
      if (s) {
        stran = s;
        kako = r.note;
      } else {
        zapiski.push(`${host} najdena z iskanjem, a naslovna stran se ni odzvala`);
      }
    } else {
      zapiski.push(r.note);
    }
  }

  if (!stran) {
    return {
      stanje: iskanoZIskalnikom ? "ni_strani" : "brez_iskanja",
      spletnaStran: null,
      eposta: null,
      telefon: null,
      opomba:
        (iskanoZIskalnikom ? "" : "iskalnik ni bil na voljo (CAPTCHA/hlajenje), preverjeno samo ugibanje domene; ") +
        (zapiski.join("; ") || "spletne strani ni bilo mogoče najti").slice(0, 380),
      zahtev: stevec.n,
    };
  }

  // 3. Kontakti: naslovna stran in do dve kontaktni.
  const htmlji = [stran.html];
  for (const url of kontaktnePovezave(stran.html, stran.url)) {
    if (Date.now() > rok) break;
    stevec.n += 1;
    try {
      const r = await providerFetch("website", url, { headers: HEADERS, maxAttempts: 1, timeoutMs: ZAHTEVA_MS });
      if (r.ok && jeBesedilnaStran(r)) htmlji.push((await preberiTeloOmejeno(r)).besedilo);
      else await r.body?.cancel().catch(() => {});
    } catch {
      // Kontaktna stran je dodatek; naslovna je pogosto dovolj.
    }
  }

  const eposta = najdiEposto(htmlji, stran.host);
  const telefon = najdiTelefon(htmlji);
  return {
    stanje: "najdena",
    spletnaStran: `https://${stran.host}`,
    eposta,
    telefon,
    opomba: `${kako}; prebranih strani: ${htmlji.length}${eposta ? "" : "; e-pošte na straneh ni"}${telefon ? "" : "; telefona na straneh ni"}`.slice(0, 400),
    zahtev: stevec.n,
  };
}
