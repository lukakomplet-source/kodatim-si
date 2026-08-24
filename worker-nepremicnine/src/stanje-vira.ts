import type { Db } from "./db.js";
import { dodajPorabo, porabaDanes, preberiBlokado, type StanjeBlokade } from "./samopopravilo.js";

/**
 * STANJE VIRA — ena sama resnica o tem, kako se vir počuti in koliko si še
 * smemo privoščiti.
 *
 * Povod je meritev, ne teorija. 24. 8. 2026 ob 21:41 je bolha vrnila CAPTCHO.
 * Zbiralnik tisti dan ni imel niti ene napake: štirje pregledi, 1.564 oglasov,
 * 0 napak. Blokado je sprožil PDF arhivar — trinajst zahtevkov v petindvajsetih
 * sekundah. Vsak proces je bil zase vljuden po SVOJI knjigi:
 *
 *     zbiralnik:  40 strani na dan, 15 s narazen   ← svoj proračun, svoj ritem
 *     arhivar:   400 zahtevkov na dan, 0,9 s       ← svoj proračun, svoj ritem
 *
 * Vir pa ne vidi dveh procesov. Vidi en naslov IP in en curek zahtevkov. Dva
 * vljudna procesa sta skupaj nevljuden odjemalec — in prav to je bila napaka,
 * ne ena ali druga številka.
 *
 * Zato je tu:
 *
 *  1. SKUPNA KNJIGA PORABE — oba procesa štejeta v isti števec (`poraba:<vir>`,
 *     isti, ki ga je zbiralnik uporabljal že prej).
 *  2. SKUPEN RITEM — pred vsakim zahtevkom se počaka, da od ZADNJEGA zahtevka
 *     kateregakoli procesa mine dovolj časa (`ritem:<vir>`). To je varovalka,
 *     ki bi včerajšnjo blokado preprečila, tudi če bi arhivar imel razmik
 *     0,9 s zapisan v kodi.
 *  3. KLASIFIKACIJA NAPAK — "vir blokira" in "vse ostalo" sta bila premalo.
 *     Spremenjen HTML ni blokada in upočasnitev ga ne popravi; časovna
 *     omejitev ni CAPTCHA.
 *  4. STANJA IN OCENA ZDRAVJA — da človek v konzoli vidi, KAJ se dogaja, ne
 *     samo, da nekaj ne dela.
 *
 * Kar ta datoteka NE počne in ne bo počela: ne obide blokade, ne skriva
 * robota, ne išče drugih poti do vsebine, ki nam jo je vir odklonil. Edini
 * dovoljeni odgovor na zavrnitev je manj zahtevkov in več časa.
 */

// ————————————————————————————————————————————————————————————————
// 1. KLASIFIKACIJA NAPAK
// ————————————————————————————————————————————————————————————————

/**
 * Vrste neuspeha. Ločene so zato, ker imajo NASPROTNE rešitve:
 * blokada zahteva umik, pokvarjen parser zahteva popravek kode (in umik bi ga
 * samo skril), prazen rezultat pa pogosto ne zahteva ničesar.
 */
export type VrstaNapake =
  | "captcha"
  | "zavrnjen_dostop"
  | "omejitev"
  | "streznik"
  | "cas_potekel"
  | "omrezje"
  | "parser"
  | "prazno"
  | "neznano";

export const OPIS_NAPAKE: Record<VrstaNapake, string> = {
  captcha: "zaslon preverjanja (CAPTCHA)",
  zavrnjen_dostop: "vir je zavrnil dostop",
  omejitev: "vir omejuje pogostost zahtevkov",
  streznik: "napaka na strani vira",
  cas_potekel: "odgovor ni prišel pravočasno",
  omrezje: "omrežna napaka",
  parser: "stran je prišla, podatkov pa ne znamo prebrati",
  prazno: "vir pravi, da zadetkov ni",
  neznano: "neznan vzrok",
};

/**
 * Katere vrste pomenijo "vir nas ustavlja".
 *
 * `streznik` in `cas_potekel` NISTA blokada: 500 je težava vira, ne naša, in
 * kaznovati sebe z 12-urnim hlajenjem zaradi njegove okvare pomeni izgubiti
 * dan zbiranja za nič. Dobita blažji odgovor (premor in manj zahtevkov).
 */
export function jeBlokada(v: VrstaNapake): boolean {
  return v === "captcha" || v === "zavrnjen_dostop" || v === "omejitev";
}

/** Ali naj se ob tej vrsti napake zbiranje pri viru takoj ustavi. */
export function ustaviKrog(v: VrstaNapake): boolean {
  return jeBlokada(v) || v === "parser";
}

const VZORCI: [VrstaNapake, RegExp][] = [
  ["captcha", /captcha|preverjanje|radware|bot manager|verifying|incident id|perfdrive/i],
  ["omejitev", /HTTP 429|too many requests|rate limit/i],
  ["zavrnjen_dostop", /HTTP 40[13]|forbidden|access denied|vir blokira/i],
  ["streznik", /HTTP 5\d\d|internal server error|bad gateway|service unavailable/i],
  ["cas_potekel", /timeout|timed out|časovna omejitev|exceeded|navigation.*interrupted/i],
  ["omrezje", /ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|net::ERR|socket hang up/i],
  ["parser", /selektor|selector|ni bilo mogoče prebrati|neznana struktura/i],
];

/**
 * Iz sporočila napake ugotovi vrsto.
 *
 * Vrstni red vzorcev je pomemben in ni naključen: Radwarov zaslon pride s
 * statusom **200**, včasih pa tudi s 403 — zato se CAPTCHA preverja PRED
 * zavrnjenim dostopom, sicer bi ista stran enkrat veljala za eno in drugič za
 * drugo, hlajenje pa bi se računalo po napačni lestvici.
 */
export function klasificiraj(sporocilo: string): VrstaNapake {
  for (const [vrsta, vzorec] of VZORCI) if (vzorec.test(sporocilo)) return vrsta;
  return "neznano";
}

/**
 * Stran se je naložila, kartic pa ni. To je razpotje, ki nas je 20. 8. 2026
 * stalo cel obhod (prazna kategorija razglašena za blokado).
 *
 *   vir sam pove "0 zadetkov"        → prazno   (garaž na Koroškem res ni)
 *   vira ne razumemo, a stran je OK  → parser   (spremenjen HTML)
 *   ne vemo ničesar                  → neznano  (previdno vedenje)
 */
export function klasificirajPrazno(opis: {
  skupajZadetkov: number | null | undefined;
  dolzinaBesedila: number;
}): VrstaNapake {
  if (opis.skupajZadetkov === 0) return "prazno";
  // Vsebinsko polna stran brez kartic pomeni, da so se selektorji razšli s
  // stranjo. Prazna stran (nekaj sto znakov) je lahko marsikaj — ne ugibamo.
  if (opis.dolzinaBesedila > 2_000) return "parser";
  return "neznano";
}

// ————————————————————————————————————————————————————————————————
// 2. SKUPEN RITEM IN SKUPNA KNJIGA PORABE
// ————————————————————————————————————————————————————————————————

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Počakaj, da od zadnjega zahtevka KATEREGAKOLI procesa mine `zamikMs`.
 *
 * Zapis je v bazi in ne v pomnilniku prav zato, ker sta procesa dva. Ne gre za
 * popolno zaklepanje — dva procesa lahko v isti stotinki prebereta isti čas in
 * oba nadaljujeta. Pri razmikih dvajsetih sekund in dveh procesih je to zelo
 * redko in stane en zahtevek, ne trinajst; popolno zaklepanje čez PostgREST bi
 * bilo dražje od težave, ki jo rešuje.
 *
 * Čakanje je omejeno na `zamikMs`: če bi v bazi pristal čas iz prihodnosti
 * (ura, ročni vpis), proces ne sme obtičati za nedoločen čas.
 */
export async function pocakajNaVrsto(db: Db, vir: string, zamikMs: number): Promise<number> {
  // Tudi zahtevek brez lastnega razmika se ZAZNAMUJE. Sicer bi proces, ki
  // razmika ne potrebuje, tiho izbrisal sled za naslednjim, ki ga potrebuje —
  // in ravno to je vrzel, skozi katero je arhivar padel v CAPTCHO.
  if (zamikMs <= 0) {
    await zaznamujZahtevek(db, vir);
    return 0;
  }
  let cakal = 0;
  try {
    const { data } = await db
      .from("nep_statistika")
      .select("podatki")
      .eq("kljuc", `ritem:${vir}`)
      .maybeSingle();
    const zadnji = Date.parse((data as { podatki?: { zadnji?: string } } | null)?.podatki?.zadnji ?? "");
    if (Number.isFinite(zadnji)) {
      cakal = Math.min(Math.max(0, zadnji + zamikMs - Date.now()), zamikMs);
      if (cakal > 0) await sleep(cakal);
    }
  } catch {
    // Če ritma ne moremo prebrati, spoštujemo lastni razmik in gremo naprej:
    // neznanje ne sme ustaviti zbiranja, sme pa nas upočasniti.
    await sleep(zamikMs);
    cakal = zamikMs;
  }
  await zaznamujZahtevek(db, vir);
  return cakal;
}

/** Zapiši, da je pravkar odšel zahtevek — za skupni ritem obeh procesov. */
export async function zaznamujZahtevek(db: Db, vir: string): Promise<void> {
  try {
    const zdaj = new Date().toISOString();
    await db.from("nep_statistika").upsert({
      kljuc: `ritem:${vir}`,
      podatki: { zadnji: zdaj },
      izracunano: zdaj,
    });
  } catch {
    // Ritem je varovalka, ne knjigovodstvo; njegova okvara ne ustavlja dela.
  }
}

// ————————————————————————————————————————————————————————————————
// 3. DNEVNI PRORAČUN VIRA — skupen za vse procese, prilagodljiv navzgor
// ————————————————————————————————————————————————————————————————

export type ProracunVira = {
  /** Koliko zahtevkov sme ta vir prejeti danes od nas SKUPAJ. */
  skupaj: number;
  /** Koliko jih je danes že odšlo (oba procesa skupaj). */
  porabljeno: number;
  /** Koliko jih ostane zbiralniku (ima prednost — novi oglasi so hitro pokvarljivi). */
  zaZbiralnik: number;
  /** Koliko jih ostane arhivarju (dobi šele preostanek nad rezervacijo). */
  zaArhiv: number;
  /** Koliko od `skupaj` je rezerviranega za zbiralnik (ostalo sme arhivar). */
  rezervacijaZbiralnika: number;
  /** Kako se je `skupaj` sestavil — za konzolo, da številka ni čarovnija. */
  pojasnilo: string;
};

type ZapisProracuna = { dan: string; skupaj: number; cistihDni: number };

function danesKljuc(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * PRORAČUN, KI SE UČI — ampak počasi in samo iz dokazov.
 *
 * Izhodišče je izmerjeno: bolha zavrne po ~50–60 zahtevkih v eni seji. Vsak
 * dan brez blokade doda `korak`, vsaka blokada vrne na osnovo. Strop je trd.
 *
 * Zakaj sploh raste: pri osnovi 60 in devetih zahtevkih na oglas bi arhiv
 * 4.628 oglasov trajal leta. Rast po dokazih je poštena pot iz tega — v
 * nasprotju s "pa poskusimo z več in bomo videli", ki je natanko tisto, kar
 * je vir 24. 8. pripeljalo do CAPTCHE.
 *
 * Kar rast NE sme biti: nadomestilo za dogovor z virom. Če je treba za en
 * arhiv čakati leto dni, je odgovor pismo Styrii (docs/pismo-bolha.md), ne
 * višja številka tukaj.
 */
export async function proracunVira(
  db: Db,
  vir: string,
  nastavitve: { osnova: number; korak?: number; strop?: number; rezervacijaZbiralnika: number }
): Promise<ProracunVira> {
  const korak = nastavitve.korak ?? 20;
  const strop = nastavitve.strop ?? nastavitve.osnova * 3;
  const dan = danesKljuc();

  let zapis: ZapisProracuna = { dan, skupaj: nastavitve.osnova, cistihDni: 0 };
  try {
    const { data } = await db
      .from("nep_statistika")
      .select("podatki")
      .eq("kljuc", `proracun:${vir}`)
      .maybeSingle();
    const p = (data as { podatki?: Partial<ZapisProracuna> } | null)?.podatki;
    if (p?.dan) {
      zapis = {
        dan: p.dan,
        skupaj: Math.min(strop, Math.max(nastavitve.osnova, Number(p.skupaj ?? nastavitve.osnova))),
        cistihDni: Math.max(0, Number(p.cistihDni ?? 0)),
      };
    }
  } catch {
    // Ob negotovosti velja osnova. Neznanje ne sme kupiti višjega proračuna.
  }

  const blok = await preberiBlokado(db, vir);
  const blokadaDanes = blok.zadnja ? danesKljuc(new Date(blok.zadnja)) === dan : false;

  if (zapis.dan !== dan) {
    // Nov dan: včerajšnji izid odloči, ali gremo za korak višje ali na osnovo.
    const vcerajBlokada = blok.zadnja
      ? danesKljuc(new Date(blok.zadnja)) === danesKljuc(new Date(Date.now() - 86_400_000))
      : false;
    zapis = vcerajBlokada
      ? { dan, skupaj: nastavitve.osnova, cistihDni: 0 }
      : { dan, skupaj: Math.min(strop, zapis.skupaj + korak), cistihDni: zapis.cistihDni + 1 };
    try {
      await db
        .from("nep_statistika")
        .upsert({ kljuc: `proracun:${vir}`, podatki: zapis, izracunano: new Date().toISOString() });
    } catch {
      /* prazno */
    }
  }

  // Blokada DANES takoj poreže proračun na osnovo, ne šele jutri.
  const skupaj = blokadaDanes ? nastavitve.osnova : zapis.skupaj;
  const porabljenoSurovo = await porabaDanes(db, vir);
  const porabljeno = Number.isFinite(porabljenoSurovo) ? porabljenoSurovo : skupaj;
  const ostanek = Math.max(0, skupaj - porabljeno);

  /**
   * DVE ŽEPKI, KI SE NE PREKRIVATA.
   *
   * Prva različica je obema porabnikoma pokazala isti preostanek: pri petih
   * preostalih zahtevkih je zbiralnik videl pet in arhivar tudi pet. Vsak zase
   * je bil v mejah, skupaj sta jih porabila deset — natanko ista napaka kot
   * tista, ki je 24. 8. pripeljala do CAPTCHE, samo eno nadstropje višje.
   *
   * Zato ločena knjiga za arhivarja (`poraba:<vir>:arhiv`). Zbiralnikova
   * poraba je razlika. Vsak žepek je omejen dvakrat: s svojo rezervacijo IN s
   * skupnim preostankom, ki ga ne more preseči nihče.
   */
  const porabaArhivaSurovo = await porabaDanes(db, `${vir}:arhiv`);
  const porabaArhiva = Number.isFinite(porabaArhivaSurovo) ? porabaArhivaSurovo : skupaj;
  const porabaZbiralnika = Math.max(0, porabljeno - porabaArhiva);
  const zepekArhiva = Math.max(0, skupaj - nastavitve.rezervacijaZbiralnika);

  return {
    skupaj,
    porabljeno,
    rezervacijaZbiralnika: nastavitve.rezervacijaZbiralnika,
    zaZbiralnik: Math.max(0, Math.min(nastavitve.rezervacijaZbiralnika - porabaZbiralnika, ostanek)),
    zaArhiv: Math.max(0, Math.min(zepekArhiva - porabaArhiva, ostanek)),
    pojasnilo: blokadaDanes
      ? `Osnova ${nastavitve.osnova} — danes je bila blokada, proračun je porezan.`
      : zapis.cistihDni > 0
        ? `${nastavitve.osnova} + ${zapis.cistihDni}× ${korak} za ${zapis.cistihDni} dni brez blokade (strop ${strop}).`
        : `Osnova ${nastavitve.osnova}.`,
  };
}

/**
 * Arhivarjev zahtevek gre v OBE knjigi: v skupno (koliko je vir danes dobil od
 * nas) in v njegovo lastno (koliko od tega je porabil arhiv). Brez druge ne bi
 * znali povedati, čigav je bil kateri zahtevek, in žepka bi se spet prekrivala.
 */
export async function dodajPoraboArhiva(db: Db, vir: string, koliko: number): Promise<void> {
  if (koliko <= 0) return;
  await dodajPorabo(db, vir, koliko);
  await dodajPorabo(db, `${vir}:arhiv`, koliko);
}

// ————————————————————————————————————————————————————————————————
// 4. STANJA IN OCENA ZDRAVJA
// ————————————————————————————————————————————————————————————————

export type Stanje =
  | "zdravo"
  | "previdno"
  | "upocasnjeno"
  | "hlajenje"
  | "preverba"
  | "okrevanje"
  | "parser_pokvarjen"
  | "izklopljen";

export const OPIS_STANJA: Record<Stanje, string> = {
  zdravo: "Zdravo",
  previdno: "Previdno",
  upocasnjeno: "Upočasnjeno",
  hlajenje: "Hlajenje po blokadi",
  preverba: "Čaka preverbo",
  okrevanje: "Okrevanje",
  parser_pokvarjen: "Branje strani ne deluje",
  izklopljen: "Izklopljen",
};

export type ZdravjeVira = {
  vir: string;
  stanje: Stanje;
  /** 0–100. Ni okrasek: pod 50 zbiralnik sam zniža obseg kroga. */
  ocena: number;
  razlog: string;
  hlajenjeDo: string | null;
  naslednjaPreverba: string | null;
  faktor: number;
  /** Ali je naslednji obisk lahko samo PREVERBA — en sam zahtevek. */
  potrebnaPreverba: boolean;
  zadnjiUspeh: string | null;
  /** Koliko ur je od zadnjega uspešnega pregleda (null, če ga še ni bilo). */
  svezinaUr: number | null;
};

/**
 * Zastavica "parser je pokvarjen" je ločena od blokade, ker ima nasprotno
 * rešitev: umik je pri blokadi zdravilo, pri pokvarjenem parserju pa samo
 * skrije, da ne beremo več ničesar.
 */
export async function preberiParserOkvaro(db: Db, vir: string): Promise<{ ob: string; opis: string } | null> {
  try {
    const { data } = await db
      .from("nep_statistika")
      .select("podatki")
      .eq("kljuc", `parser:${vir}`)
      .maybeSingle();
    const p = (data as { podatki?: { ob?: string; opis?: string; resen?: boolean } } | null)?.podatki;
    if (!p?.ob || p.resen === false) return null;
    return { ob: p.ob, opis: p.opis ?? "neznano" };
  } catch {
    return null;
  }
}

export async function zabelezParserOkvaro(db: Db, vir: string, opis: string): Promise<void> {
  await db.from("nep_statistika").upsert({
    kljuc: `parser:${vir}`,
    podatki: { ob: new Date().toISOString(), opis, resen: true },
    izracunano: new Date().toISOString(),
  });
}

/** Parser spet bere: zastavica pade. Kliče se ob prvem uspešnem branju kartic. */
export async function pocistiParserOkvaro(db: Db, vir: string): Promise<void> {
  const okvara = await preberiParserOkvaro(db, vir);
  if (!okvara) return;
  await db.from("nep_statistika").upsert({
    kljuc: `parser:${vir}`,
    podatki: { ob: okvara.ob, opis: okvara.opis, resen: false, popravljeno: new Date().toISOString() },
    izracunano: new Date().toISOString(),
  });
}

/**
 * Kdaj je čas za PREVERBO in kdaj za normalen krog.
 *
 * Doslej se je po izteku hlajenja zagnal navaden krog s štiridesetimi
 * stranmi. Če vir še ni pripravljen, to pomeni štirideset zahtevkov v novo
 * blokado. Preverba je EN zahtevek: če pade, smo izgubili enega.
 */
export function potrebujePreverbo(blok: StanjeBlokade): boolean {
  if (!blok.zadnja) return false;
  const hlajenjeMinilo = !blok.do || new Date(blok.do).getTime() <= Date.now();
  return hlajenjeMinilo && blok.cistih === 0;
}

export async function oceniZdravje(
  db: Db,
  vir: string,
  opcije: { omogocen: boolean }
): Promise<ZdravjeVira> {
  const blok = await preberiBlokado(db, vir);
  const okvara = await preberiParserOkvaro(db, vir);

  let zadnjiUspeh: string | null = null;
  try {
    const { data } = await db
      .from("nep_pregledi")
      .select("konec")
      .eq("vir", vir)
      .in("status", ["koncano", "koncano_delno"])
      .gt("najdenih", 0)
      .order("konec", { ascending: false })
      .limit(1);
    zadnjiUspeh = ((data ?? [])[0] as { konec: string | null } | undefined)?.konec ?? null;
  } catch {
    /* prazno */
  }

  const svezinaUr = zadnjiUspeh ? (Date.now() - new Date(zadnjiUspeh).getTime()) / 3_600_000 : null;
  const hlajenje = blok.do && new Date(blok.do).getTime() > Date.now() ? blok.do : null;
  const preverba = potrebujePreverbo(blok);

  let ocena = 100;
  const razlogi: string[] = [];

  if (hlajenje) {
    ocena = Math.min(ocena, 25);
    razlogi.push(blok.razlog ?? "vir nas je ustavil");
  }
  if (blok.faktor > 1) {
    ocena -= 15 * Math.log2(blok.faktor);
    razlogi.push(`beremo ${blok.faktor}× počasneje`);
  }
  if (blok.stopnja > 1) {
    ocena -= 10 * (blok.stopnja - 1);
    razlogi.push(`${blok.stopnja}. blokada zapored`);
  }
  if (svezinaUr === null) {
    ocena = Math.min(ocena, 50);
    razlogi.push("uspešnega pregleda še ni bilo");
  } else if (svezinaUr > 72) {
    ocena -= 25;
    razlogi.push(`zadnji uspešen pregled pred ${Math.round(svezinaUr / 24)} dnevi`);
  } else if (svezinaUr > 24) {
    ocena -= 10;
    razlogi.push(`zadnji uspešen pregled pred ${Math.round(svezinaUr)} urami`);
  }
  if (okvara) {
    ocena = Math.min(ocena, 40);
    razlogi.push(`branje strani ne deluje: ${okvara.opis}`);
  }

  ocena = Math.max(0, Math.min(100, Math.round(ocena)));

  const stanje: Stanje = !opcije.omogocen
    ? "izklopljen"
    : okvara
      ? "parser_pokvarjen"
      : hlajenje
        ? "hlajenje"
        : preverba
          ? "preverba"
          : blok.faktor > 1
            ? "okrevanje"
            : ocena < 75
              ? "previdno"
              : "zdravo";

  return {
    vir,
    stanje,
    ocena,
    razlog: razlogi.length > 0 ? razlogi.join("; ") : "Vse teče normalno.",
    hlajenjeDo: hlajenje,
    naslednjaPreverba: preverba ? new Date().toISOString() : (hlajenje ?? null),
    faktor: blok.faktor,
    potrebnaPreverba: preverba,
    zadnjiUspeh,
    svezinaUr: svezinaUr === null ? null : Math.round(svezinaUr * 10) / 10,
  };
}

// ————————————————————————————————————————————————————————————————
// 5. DNEVNIK VIRA
// ————————————————————————————————————————————————————————————————

export type Dogodek = {
  ob: string;
  stanje: Stanje | null;
  kaj: string;
  /** Kdo je dogodek povzročil — zbiralnik ali arhivar. Oba pišeta sem. */
  kdo: string;
  vrsta?: VrstaNapake;
};

/**
 * Časovnica na vir, najnovejše prvo, 40 zapisov.
 *
 * Ločena od `samopopravila` (skupni dnevnik posegov) zato, ker odgovarja na
 * drugo vprašanje: ne "kaj je sistem popravil", ampak "kaj se je dogajalo s
 * tem virom". Prvo bere razvijalec, drugo bere človek, ki gleda konzolo in se
 * sprašuje, zakaj bolha danes ne dela.
 */
export async function zabelezDogodek(db: Db, vir: string, d: Omit<Dogodek, "ob">): Promise<void> {
  const zapis: Dogodek = { ob: new Date().toISOString(), ...d };
  try {
    const { data } = await db
      .from("nep_statistika")
      .select("podatki")
      .eq("kljuc", `dnevnik:${vir}`)
      .maybeSingle();
    const prej = ((data as { podatki?: { dogodki?: Dogodek[] } } | null)?.podatki?.dogodki ?? []).slice(0, 39);
    await db.from("nep_statistika").upsert({
      kljuc: `dnevnik:${vir}`,
      podatki: { dogodki: [zapis, ...prej] },
      izracunano: zapis.ob,
    });
  } catch {
    // Zapis dogodka ne sme postati nov dogodek.
  }
}

export async function preberiDnevnik(db: Db, vir: string): Promise<Dogodek[]> {
  try {
    const { data } = await db
      .from("nep_statistika")
      .select("podatki")
      .eq("kljuc", `dnevnik:${vir}`)
      .maybeSingle();
    return ((data as { podatki?: { dogodki?: Dogodek[] } } | null)?.podatki?.dogodki ?? []).slice(0, 40);
  } catch {
    return [];
  }
}

// ————————————————————————————————————————————————————————————————
// 6. VAROVALKA KAKOVOSTI
// ————————————————————————————————————————————————————————————————

export type Anomalija = { jeAnomalija: boolean; opis: string };

/**
 * Ali je današnji izid tako drugačen od običajnega, da mu ne smemo verjeti.
 *
 * Namen ni statistična natančnost, ampak preprečiti, da bi pokvarjen selektor
 * čez dobre podatke zapisal prazne. Zato je prag širok in enosmeren: sumljivo
 * je samo drastično MANJ, nikoli več.
 */
export function zaznajAnomalijo(opis: {
  najdenih: number;
  strani: number;
  obicajnoNaStran: number | null;
}): Anomalija {
  if (opis.strani === 0) return { jeAnomalija: false, opis: "" };
  if (opis.obicajnoNaStran === null || opis.obicajnoNaStran <= 0) return { jeAnomalija: false, opis: "" };
  const naStran = opis.najdenih / opis.strani;
  if (naStran >= opis.obicajnoNaStran * 0.3) return { jeAnomalija: false, opis: "" };
  return {
    jeAnomalija: true,
    opis:
      `Na stran ${naStran.toFixed(1)} oglasov namesto običajnih ${opis.obicajnoNaStran.toFixed(1)} ` +
      `(${opis.najdenih} na ${opis.strani} straneh). Stran se je verjetno spremenila.`,
  };
}

/** Povprečje oglasov na stran iz zadnjih uspešnih pregledov — merilo za anomalijo. */
export async function obicajnoNaStran(db: Db, vir: string): Promise<number | null> {
  try {
    const { data } = await db
      .from("nep_pregledi")
      .select("strani, najdenih")
      .eq("vir", vir)
      .in("status", ["koncano", "koncano_delno"])
      .gt("strani", 0)
      .order("zacetek", { ascending: false })
      .limit(10);
    const vrstice = (data ?? []) as { strani: number; najdenih: number }[];
    if (vrstice.length < 3) return null;
    const strani = vrstice.reduce((s, v) => s + Number(v.strani ?? 0), 0);
    const najdenih = vrstice.reduce((s, v) => s + Number(v.najdenih ?? 0), 0);
    return strani > 0 ? najdenih / strani : null;
  } catch {
    return null;
  }
}
