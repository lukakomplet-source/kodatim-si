import type { NormaliziranOglas } from "../db.js";
import type { Nastanitev } from "../parse.js";
import { cenaIz, izOpisa, nastanitevIz, stevilo } from "../parse.js";
import type { Rezina, SurovaKartica, VirAdapter } from "./vmesnik.js";
import { goloBesedilo, prenesi } from "./http.js";
import { izreziObjekt, objektiPoKljucu, rscBesedilo } from "./rsc.js";

/**
 * PLATFORMA 100m2 (100Kvadratov d.o.o.) — tri agencijske strani v enem modulu.
 *
 * Zakaj skupaj: vila-portoroz.si (agencija 442) in makler-bled.si (agencija 75)
 * tečeta na isti Next.js predlogi platforme 100m2. Preverjeno 29. 9. 2026 na
 * shranjenih straneh obeh: isti šifranti (52 podvrst, 14 regij, enaki id-ji),
 * isti zapis oglasa v RSC toku, ista paginacija ?page=N po 16. En
 * razčlenjevalnik, dve nastavitvi (adapter100m2).
 *
 * c21.si (CENTURY 21 Slovenija) je DRUGAČEN. Podatki so sicer s platforme 100m2
 * (fotografije na bunny.100m2.si/item/17), stran pa je lastna predloga v
 * Contao/PHP (EDsolution) s karticami, izrisanimi v navadnem HTML-ju — RSC toka
 * ni. Zato ima svoj razčlenjevalnik (karticeIzHtmlC21) v isti datoteki.
 *
 * Skupni pogoji vseh treh presoj (28.–29. 9. 2026, presoja + dva skeptika):
 *   - hranimo DEJSTVA in povezavo na izvirnik. Noge strani pravijo "Vse
 *     pravice pridržane" oz. "Copyright ©", zato fotografij ne kopiramo in
 *     nanje tudi ne kažemo: vse tri presoje bunny.100m2.si izrecno izključijo
 *     ("do not call bunny.100m2.si"), čeprav tam robots.txt ne obstaja. Zato
 *     slikaUrl ostane prazen.
 *   - BESEDILA OPISOV NE SHRANJUJEMO. Iz njega izluščimo samo to, kar je
 *     dejstvo — vrsto nastanitve in števila (hostel, 38 ležišč), zastavice
 *     (za obnovo, več enot) — in besedilo zavržemo. `opis` je zato sestavljen
 *     iz dejstev, da ga centralni detektor nastanitve (nastanitevIz) še vedno
 *     vidi, v `raw` pa opisa ni.
 *   - imen, fotografij in telefonov agentov ne hranimo (GDPR). c21 jih ima na
 *     kartici, zato kartico odrežemo pred blokom "seller".
 *   - virtualnih ogledov (Matterport) ne hranimo; c21 pravi, da so "samo za
 *     uradno spletno stran".
 *
 * Detajlov (2. faza) ni: pri 100m2 je zapis na seznamu popoln (tudi opis), pri
 * c21 pa bi detajl dal regijo (ld+json) in število sob hotela ("Skupno 16
 * sob"), a DetajlPolitika zna brati samo stran v brskalniku.
 */

// --- skupno ------------------------------------------------------------------

type Posel = "prodaja" | "oddaja";

function poselIz(t: string | null | undefined): Posel | null {
  const s = (t ?? "").trim().toLowerCase();
  return s === "prodaja" ? "prodaja" : s === "oddaja" ? "oddaja" : null;
}

const zVelikoZacetnico = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Vrsta, kakor jo piše platforma (šifrant property_type; c21 izpiše isto
 * besedilo na kartici) -> naš tip. Enako kot agenti-nep.si na isti platformi:
 * "Soba" je oddaja sobe v stanovanju in ne nastanitveni objekt; podvrsti
 * "Vikend" in "Koča" počitniškega objekta sta vikend, apartma, hiša in
 * mobilna hiška ostanejo počitniški objekt.
 */
function tipIz(vrsta: string | null | undefined, podvrsta: string | null | undefined): string | null {
  const v = (vrsta ?? "").trim().toLowerCase();
  const p = (podvrsta ?? "").trim().toLowerCase();
  if (v === "stanovanje" || v === "soba") return "stanovanje";
  if (v === "hiša") return "hisa";
  if (v === "parcela") return "posest";
  if (v === "poslovni prostor") return "poslovni_prostor";
  if (v.startsWith("garaža")) return "garaza";
  if (v === "počitniški objekt") return p === "vikend" || p === "koča" ? "vikend" : "pocitniski_objekt";
  return null;
}

/** Pri sobi je podvrsta število postelj ("Dvoposteljna"), zato podtip "soba". */
function podtipIz(vrsta: string | null | undefined, podvrsta: string | null | undefined): string | null {
  if ((vrsta ?? "").trim().toLowerCase() === "soba") return "soba";
  return podvrsta?.trim().toLowerCase() || null;
}

/**
 * Samo prava skupna cena ali mesečna najemnina.
 *
 * "500 €/m2" (parcela vila-portoroz), "11,00 € / m2" (najem pisarne pri c21) in
 * "47,51 € / m2" so cene na kvadratni meter — zmnožek s površino bi bil naš
 * izračun, ne cena vira. Pri c21 je "100.000,00 € / m2" za 62 m² očitno narobe
 * vpisana skupna cena; tudi tej ne verjamemo. "Po dogovoru" nima številke,
 * nadomestki 99999… niso cena. "+ ddv" in "ddv v ceni" sta skupni ceni.
 */
function pravaCena(n: number | null, besedilo: string | null | undefined, posel: Posel): number | null {
  if (n === null || !Number.isFinite(n) || n <= 1) return null;
  const t = besedilo ?? "";
  if (/\/\s*m\s*(?:2|²)/i.test(t)) return null;
  if (posel === "prodaja" && /\/\s*mesec/i.test(t)) return null;
  if (/^9{5,}$/.test(String(Math.round(n)))) return null;
  return n;
}

function leto(x: unknown): number | null {
  const n = Number(String(x ?? "").trim());
  return Number.isInteger(n) && n >= 1000 && n <= 2100 ? n : null;
}

/** Številka iz polja platforme ("35.8", "1865") — angleški zapis, pika je decimalka. */
function pozitivno(x: unknown): number | null {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Imenske entitete, ki jih piše urejevalnik opisov (CKEditor). Skupni
 * brezEntitet pozna samo številske in osnovne; "hi&scaron;a" brez prevoda ni
 * "hiša" in "zemlji&scaron;če" ni zemljišče — detektor bi ostal slep.
 */
const IMENSKE_ENTITETE: Record<string, string> = {
  scaron: "š", Scaron: "Š", zcaron: "ž", Zcaron: "Ž", ccaron: "č", Ccaron: "Č",
  cacute: "ć", Cacute: "Ć", dstrok: "đ", Dstrok: "Đ",
  ndash: "–", mdash: "—", raquo: "»", laquo: "«", bdquo: "„", ldquo: "“", rdquo: "”",
  lsquo: "‘", rsquo: "’", hellip: "…", euro: "€", sup2: "2", sup3: "3", deg: "°",
  times: "×", middot: "·", bull: "•", shy: "", eacute: "é", uuml: "ü", ouml: "ö", auml: "ä",
};

/** Golo besedilo iz HTML-ja kartice ali opisa. "m<sup>2</sup>" in "m²" postaneta "m2". */
function besediloIz(html: string | null | undefined): string {
  if (!html) return "";
  const t = html
    .replace(/<sup>\s*2\s*<\/sup>/gi, "2")
    .replace(/&([A-Za-z]+\d?);/g, (cela, ime: string) => IMENSKE_ENTITETE[ime] ?? cela);
  return goloBesedilo(t).replace(/²/g, "2");
}

/**
 * Dejstva iz opisa — edino, kar od opisa obdržimo. Oba razčlenjevalnika sta
 * skupna (parse.ts), zato vir ne dobi drugačnih pravil kot ostali: nastanitev
 * šteje sobe samo v nastanitvenem kontekstu, izOpisa loči trditev ("ima 3
 * stanovanja") od možnosti ("možnost ureditve 3 stanovanj").
 */
type DejstvaOpisa = {
  nastanitev: string | null;
  sob: number | null;
  apartmajev: number | null;
  lezisc: number | null;
  enot: number | null;
  stEnot: number | null;
  stEnotOcena: number | null;
  vecEnot: boolean;
  loceneKuhinje: boolean | null;
  looceniVhodi: boolean | null;
  zaObnovo: boolean;
  zaInvesticijo: boolean;
};

function dejstvaIz(besedilo: string, tip: string | null): DejstvaOpisa | null {
  if (!besedilo) return null;
  const n: Nastanitev = nastanitevIz(besedilo, tip);
  const iz = izOpisa(besedilo);
  return {
    nastanitev: n.vrsta,
    sob: n.sob,
    apartmajev: n.apartmajev,
    lezisc: n.lezisc,
    enot: n.enot,
    stEnot: iz.stEnot,
    stEnotOcena: iz.stEnotOcena,
    vecEnot: iz.vecEnot,
    loceneKuhinje: iz.loceneKuhinje,
    looceniVhodi: iz.looceniVhodi,
    zaObnovo: iz.zaObnovo,
    zaInvesticijo: iz.zaInvesticijo,
  };
}

/**
 * Vrsta nastanitve kot beseda, ki jo centralni detektor spet prepozna
 * ("apartmajska_hisa" s podčrtajem bi zgrešil vsak njegov vzorec).
 */
const VRSTA_BESEDA: Record<string, string> = {
  hotel: "hotel",
  penzion: "penzion",
  hostel: "hostel",
  motel: "motel",
  apartmajska_hisa: "apartmajska hiša",
  turisticna_kmetija: "turistična kmetija",
  gostisce: "gostišče",
  nastanitveni_objekt: "nastanitveni objekt",
};

/**
 * "nastanitev: hostel, 38 ležišč" — na ZAČETKU opisa, ker detektor pri hiši
 * in parceli upošteva vrsto samo v prvih 150 znakih. Števila so v obliki, ki
 * jo detektor bere ("8 sob", "5 apartmajev"), zato iz našega opisa dobi isto,
 * kot bi iz izvirnega besedila. Dejstva so iz kategorije vira (pred opis
 * postavimo "Poslovni prostor, Hotel.") in iz opisa: hotel, ki v opisu piše
 * samo "gostinsko-turistični objekt s 16 sobami", je tako še vedno hotel s 16 sobami.
 */
function nastanitevFraza(d: DejstvaOpisa | null): string | null {
  if (!d?.nastanitev) return null;
  const deli = [VRSTA_BESEDA[d.nastanitev] ?? d.nastanitev.replace(/_/g, " ")];
  if (d.sob !== null) deli.push(`${d.sob} sob`);
  if (d.apartmajev !== null) deli.push(`${d.apartmajev} apartmajev`);
  if (d.enot !== null && d.enot > Math.max(d.sob ?? 0, d.apartmajev ?? 0)) deli.push(`${d.enot} enot`);
  if (d.lezisc !== null) deli.push(`${d.lezisc} ležišč`);
  return `nastanitev: ${deli.join(", ")}`;
}

/** Enote samo, kadar jih vir pove sam — nikoli iz sob družinske hiše. */
function enoteIz(
  tip: string | null,
  podtip: string | null,
  sobe: number | null,
  d: DejstvaOpisa | null
): { stEnot: number | null; vecEnot: boolean } {
  /**
   * Stanovanje in garaža sta ena enota, kar koli opis pravi o STAVBI
   * ("se nahaja v dvostanovanjski stavbi", "objekt je sestavljen iz treh
   * enot"). Pri parceli opis navaja prostorske pogoje občine (OPN), ne
   * obstoječih enot. Recenzija 29. 9. 2026 je našla oboje na resničnih oglasih.
   */
  if (tip === "stanovanje" || tip === "garaza") return { stEnot: null, vecEnot: false };
  const izOpisa = tip === "posest" ? null : (d?.stEnot ?? null);
  // Sobe hotela SO enote (strukturirano polje vira). "Dvostanovanjska" je
  // kategorija vira z dvema stanovanjema; "Večstanovanjska" pove "več", ne koliko.
  const stEnot =
    podtip === "hotel" && sobe !== null && sobe >= 2 ? sobe : podtip === "dvostanovanjska" ? 2 : izOpisa;
  const vecEnot = (stEnot ?? 0) >= 2 || podtip === "večstanovanjska" || (tip !== "posest" && Boolean(d?.vecEnot));
  return { stEnot, vecEnot };
}

const brezPonovitev = (deli: (string | null | undefined)[]): string[] =>
  [...new Set(deli.map((d) => d?.trim()).filter((d): d is string => Boolean(d)))];

// --- 100m2 (Next.js): vila-portoroz.si, makler-bled.si ------------------------

/** Zapis oglasa, kakor ga platforma vgradi v RSC tok. Vse vrednosti so nizi. */
type Zapis100m2 = {
  id: string;
  status?: string;
  agency?: string;
  activate_dt?: string | null;
  modified_lt?: string | null;
  internal_ident?: string | null;
  offer_type_text?: string | null;
  property_type_text?: string | null;
  property_subtype_text?: string | null;
  floor?: string | null;
  country?: string | null;
  region?: string | null;
  region_text?: string | null;
  city_text?: string | null;
  district_text?: string | null;
  size_neto?: string | null;
  size_bruto?: string | null;
  size_correct?: string | null;
  size_parcel?: string | null;
  price?: string | null;
  price_correct_text?: string | null;
  price_first?: string | null;
  price_first_text?: string | null;
  year_built?: string | null;
  year_adaptation?: string | null;
  num_room?: string | null;
  num_bedroom?: string | null;
  num_bathroom?: string | null;
  is_luxury?: string | null;
  is_goodbuy?: string | null;
  is_discounted?: string | null;
  is_investment?: string | null;
  is_available?: boolean;
  description?: string | null;
  photo?: unknown;
  row_url?: string | null;
  [polje: string]: unknown;
};

type Meta100m2 = { current_page?: number | null; per_page?: number | string; total?: number | string; item_list_id?: string };

type Rezina100m2 = Rezina & { vir: string };

/**
 * Polja, ki v bazo NE gredo: opis (in prevodi), fotografije, vgrajen
 * Matterport, virtualni ogled in naslov ulice (pri objavljenem naslovu je to
 * natančna lokacija, ki je ne potrebujemo).
 */
const IZPUSCENO = new Set(["photo", "embed", "virtual_tour", "full_address"]);

/**
 * Bivalna površina: neto (uporabna), bruto (z zidovi) samo, ko neta ni.
 * size_correct je površina, ki jo stran IZPIŠE — pri stavbi bruto, pri
 * parceli pa zemljišče (izmerjeno 29. 9. 2026: vseh 19 parcel na shranjenih
 * straneh obeh agencij ima size_correct = size_parcel). Zato velja samo,
 * kadar ni isto kot zemljišče.
 */
function povrsina100m2(z: Zapis100m2): number | null {
  const izpisana = pozitivno(z.size_correct);
  return (
    pozitivno(z.size_neto) ??
    pozitivno(z.size_bruto) ??
    (izpisana !== null && izpisana !== pozitivno(z.size_parcel) ? izpisana : null)
  );
}

/** Kraj je najnatančnejši del — naselje. "Portorož center" -> Portorož; "Center" -> občina. */
function kraj100m2(z: Zapis100m2): string | null {
  const mesto = z.city_text?.trim() || null;
  const del = z.district_text?.trim() || null;
  if (del && !/^center$/i.test(del)) return del.replace(/\s+center$/i, "") || mesto;
  return mesto;
}

/**
 * Regije platforme so natanko naša razdelitev (tudi nepremicnine.net):
 * Spodnjeposavska = posavska, Jugovzhodna Slovenija = dolenjska,
 * Notranjsko-kraška = notranjska. Zapis oglasa pa ime skrajša — id 13
 * ("Ljubljana mesto" v šifrantu) ima v oglasu samo "Ljubljana". Zato je
 * Ljubljana razrešena po id-ju: 13 mesto, 8 okolica; id 15 ("Ljubljana" brez
 * delitve) ostane null. Tujina (Hrvaška, Španija, Dubaj) nima naše regije.
 */
const REGIJE: Record<string, string> = {
  pomurska: "pomurska",
  podravska: "podravska",
  koroska: "koroska",
  savinjska: "savinjska",
  zasavska: "zasavska",
  spodnjeposavska: "posavska",
  posavska: "posavska",
  jugovzhodnaslovenija: "dolenjska",
  gorenjska: "gorenjska",
  notranjskokraska: "notranjska",
  goriska: "goriska",
  obalnokraska: "obalno-kraska",
  ljubljanamesto: "ljubljana-mesto",
  ljubljanaokolica: "ljubljana-okolica",
};

function regijaIz(z: Zapis100m2): string | null {
  if (z.country !== "si") return null;
  const kljuc = (z.region_text ?? "")
    .toLowerCase()
    .replace(/č/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/[^a-z]/g, "");
  if (kljuc === "ljubljana") return z.region === "13" ? "ljubljana-mesto" : z.region === "8" ? "ljubljana-okolica" : null;
  return REGIJE[kljuc] ?? null;
}

/** UTF-8 dolžina znaka (kodne točke). */
const bajtov = (cp: number) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/** Odsek niza, dolg natanko `n` bajtov UTF-8, od indeksa `od`. */
function poBajtih(s: string, od: number, n: number): string {
  let b = 0;
  let i = od;
  while (i < s.length && b < n) {
    const cp = s.codePointAt(i) ?? 0;
    b += bajtov(cp);
    i += cp > 0xffff ? 2 : 1;
  }
  return s.slice(od, i);
}

/**
 * Dolga besedila (opisi) RSC ne vgradi v zapis, ampak pošlje kot ločeno
 * vrstico "2d:T13d9,<html>" — id, T, dolžina v BAJTIH (hex), vejica. Zapis
 * oglasa ima potem samo sklic "description":"$2d". Vrstica T se ne konča z
 * novo vrstico, zato naslednja vrstica T lahko sledi takoj za njo; beremo jih
 * zaporedno od vsakega začetka vrstice, ki je glava T. Iskanje "2d:T" kjer
 * koli bi zadelo tudi rep vrstice "12d:T".
 */
function tekstovneVrstice(rsc: string): Map<string, string> {
  const izid = new Map<string, string>();
  const glava = /([0-9a-f]+):T([0-9a-f]+),/y;
  for (const m of rsc.matchAll(/(?:^|\n)(?=[0-9a-f]+:T[0-9a-f]+,)/g)) {
    let i = (m.index ?? 0) + m[0].length;
    for (;;) {
      glava.lastIndex = i;
      const g = glava.exec(rsc);
      if (!g) break;
      const od = i + g[0].length;
      const besedilo = poBajtih(rsc, od, parseInt(g[2], 16));
      if (!izid.has(g[1])) izid.set(g[1], besedilo);
      i = od + besedilo.length;
    }
  }
  return izid;
}

/** Vrednost polja, razrešena, če je sklic "$2d"; "$undefined" je Reactov nadomestek za prazno. */
function razresi(vrstice: Map<string, string>, v: unknown): string | null {
  if (typeof v !== "string" || v === "") return null;
  if (v.startsWith("$$")) return v.slice(1);
  if (!v.startsWith("$")) return v;
  const sklic = /^\$([0-9a-f]+)$/.exec(v);
  return sklic ? (vrstice.get(sklic[1]) ?? null) : null;
}

/** Izvor strani iz <link rel="canonical">, kadar ga klicatelj ne poda (preizkus na shranjeni strani). */
function izvorIz(html: string): string | null {
  return html.match(/<link rel="canonical" href="(https:\/\/[^/"]+)/)?.[1] ?? null;
}

/**
 * Čisto razčlenjevanje strani seznama platforme 100m2 — brez omrežja, zato
 * ga je mogoče preizkusiti na shranjeni strani.
 *
 * `osnova` je izvor strani ("https://makler-bled.si"), `agencijaId` številka
 * agencije na platformi; zapisi drugih agencij (če bi jih stran kdaj
 * vgradila) se preskočijo.
 */
export function karticeIzHtml(
  html: string,
  stran: number,
  nastavitve: { osnova?: string; agencijaId?: string; agencija?: string } = {}
): { kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov: number | null } {
  const rsc = rscBesedilo(html);
  const osnova = (nastavitve.osnova ?? izvorIz(html) ?? "").replace(/\/+$/, "");
  if (!osnova) throw new Error("platforma 100m2: izvor strani ni znan (ni osnove ne canonical)");
  const vrstice = tekstovneVrstice(rsc);

  const kartice: SurovaKartica[] = [];
  const videni = new Set<string>();
  // Sidro je začetek zapisa oglasa; objekt izrežemo po oklepajih (izreziObjekt),
  // ker okno okoli sidra pri teh zapisih zajame tudi sosednji oglas.
  for (const m of rsc.matchAll(/\{"id":"(\d+)","status":"\d+","agency":"(\d+)"/g)) {
    if (nastavitve.agencijaId && m[2] !== nastavitve.agencijaId) continue;
    if (videni.has(m[1])) continue;
    const kos = izreziObjekt(rsc, m.index ?? 0);
    if (!kos) continue;
    let z: Zapis100m2;
    try {
      z = JSON.parse(kos) as Zapis100m2;
    } catch {
      continue;
    }
    const posel = poselIz(z.offer_type_text);
    // Samo ponudba (prodaja, oddaja) z lastno stranjo. Izrecno nerazpoložljiv
    // oglas (prodan, rezerviran) ni na trgu — naj ga zbiralnik vidi kot izginulega.
    if (!posel || !z.row_url || z.is_available === false) continue;
    videni.add(z.id);

    const vrsta = z.property_type_text?.trim() || null;
    const podvrsta = z.property_subtype_text?.trim() || null;
    const tip = tipIz(vrsta, podvrsta);
    const podtip = podtipIz(vrsta, podvrsta);
    const opisHtml = razresi(vrstice, z.description) ?? "";
    const dejstva = dejstvaIz(besediloIz(`${[vrsta, podvrsta].filter(Boolean).join(", ")}. ${opisHtml}`), tip);

    const sobe = pozitivno(z.num_room);
    const spalnic = pozitivno(z.num_bedroom);
    const kopalnic = pozitivno(z.num_bathroom);
    const neto = pozitivno(z.size_neto);
    const bruto = pozitivno(z.size_bruto);
    const parcela = pozitivno(z.size_parcel);
    const cena = besediloIz(z.price_correct_text) || null;
    const prvotna = pozitivno(z.price_first);
    const znizana = prvotna !== null && (pozitivno(z.price) ?? Infinity) < prvotna;
    const lokacija = brezPonovitev([z.district_text, z.city_text, z.region_text]).join(", ") || null;
    // Zapis na seznamu nosi samo naslovno fotografijo (vseh 82 izmerjenih ima
    // photo.length = 1), ne galerije. "1 slika" bi bila napačna trditev.
    const stSlik = null;
    const povrsina = povrsina100m2(z);

    const surovo: Record<string, unknown> = {};
    for (const [polje, v] of Object.entries(z)) {
      if (!IZPUSCENO.has(polje) && !polje.startsWith("description")) surovo[polje] = v;
    }
    surovo.dejstvaOpisa = dejstva;

    kartice.push({
      url: `${osnova}/nepremicnine/${z.row_url.replace(/^\/+/, "")}`,
      virId: z.id,
      lokacija,
      // Kot naslov pri viru: "Prodaja, Poslovni prostor, Hotel, Kropa, Radovljica, 254 m2".
      naslovVrstica:
        [
          zVelikoZacetnico(posel),
          vrsta,
          podvrsta,
          brezPonovitev([z.district_text, z.city_text]).join(", "),
          povrsina !== null ? `${povrsina} m2` : parcela !== null ? `${parcela} m2 zemljišča` : null,
        ]
          .filter(Boolean)
          .join(", ") || null,
      // Opis iz DEJSTEV, ne iz besedila vira (glej glavo datoteke). Sobe so
      // "N sob" samo pri hotelu, kjer so enote; pri hiši "število sob: N",
      // da jih detektor nastanitve ne prešteje kot sobe za goste.
      opis:
        [
          nastanitevFraza(dejstva),
          [vrsta, podvrsta].filter(Boolean).join(", ") || null,
          posel,
          sobe !== null ? (podtip === "hotel" ? `${sobe} sob` : `število sob: ${sobe}`) : null,
          spalnic !== null ? `spalnic: ${spalnic}` : null,
          kopalnic !== null ? `kopalnic: ${kopalnic}` : null,
          neto !== null ? `${neto} m2 neto` : null,
          bruto !== null ? `${bruto} m2 bruto` : null,
          parcela !== null ? `${parcela} m2 zemljišča` : null,
          leto(z.year_built) !== null ? `zgrajeno ${leto(z.year_built)}` : null,
          leto(z.year_adaptation) !== null ? `adaptirano ${leto(z.year_adaptation)}` : null,
          z.floor ? `nadstropje: ${z.floor}` : null,
          cena ? `cena: ${cena}` : null,
          znizana ? `prvotna cena: ${besediloIz(z.price_first_text) || prvotna}` : null,
          z.is_discounted === "1" ? "znižano" : null,
          z.is_goodbuy === "1" ? "ugodno" : null,
          z.is_investment === "1" ? "investicija" : null,
          z.is_luxury === "1" ? "luksuzno" : null,
          lokacija,
          z.activate_dt ? `objavljeno ${z.activate_dt}` : null,
        ]
          .filter(Boolean)
          .join("; ") || null,
      cenaBesedilo: cena,
      telefon: null, // zapis agenta nima; kontakt agencije ni podatek o nepremičnini
      agencija: nastavitve.agencija ?? null,
      slika: null, // glej glavo: bunny.100m2.si je po presoji izključen
      stSlik,
      surovo,
    });
  }

  // Oštevilčenje: "meta":{"current_page":2,"per_page":16,"total":"106",…}.
  // Na prvi strani je current_page null, per_page in total pa sta vedno.
  const mete = objektiPoKljucu<Meta100m2>(rsc, "meta").filter((x) => x && x.per_page !== undefined && x.total !== undefined);
  const meta = mete.find((x) => x.item_list_id === "default") ?? mete[0];
  const naStran = pozitivno(meta?.per_page);
  const skupaj = meta && Number.isFinite(Number(meta.total)) ? Number(meta.total) : null;
  const zadnjaStran =
    skupaj !== null && naStran !== null
      ? Math.max(1, Math.ceil(skupaj / naStran))
      : kartice.length > 0
        ? stran
        : null;
  return { kartice, zadnjaStran, skupajZadetkov: skupaj };
}

export function normaliziraj(k: SurovaKartica, r: Rezina): NormaliziranOglas {
  const z = (k.surovo ?? {}) as Zapis100m2 & { dejstvaOpisa?: DejstvaOpisa | null };
  const d = z.dejstvaOpisa ?? null;
  const posel = poselIz(z.offer_type_text) ?? "prodaja";
  const tip = tipIz(z.property_type_text, z.property_subtype_text);
  const podtip = podtipIz(z.property_type_text, z.property_subtype_text);
  const jeHotel = podtip === "hotel";
  const { stEnot, vecEnot } = enoteIz(tip, podtip, pozitivno(z.num_room), d);
  const povrsina = povrsina100m2(z);
  return {
    vir: (r as Partial<Rezina100m2>).vir ?? new URL(k.url).hostname.replace(/^www\./, ""),
    virId: k.virId,
    url: k.url,
    naslov: k.naslovVrstica,
    tip,
    podtip,
    posel,
    regija: regijaIz(z),
    kraj: kraj100m2(z),
    cenaEur: pravaCena(pozitivno(z.price), z.price_correct_text, posel),
    povrsinaM2: povrsina,
    zemljisceM2: pozitivno(z.size_parcel),
    letoIzgradnje: leto(z.year_built),
    letoAdaptacije: leto(z.year_adaptation),
    nadstropje: z.floor?.trim() || null,
    vecEnot,
    stEnot,
    stEnotOcena: d?.stEnotOcena ?? null,
    loceneKuhinje: d?.loceneKuhinje ?? null,
    looceniVhodi: d?.looceniVhodi ?? null,
    zaObnovo: Boolean(d?.zaObnovo),
    zaInvesticijo: z.is_investment === "1" || jeHotel || podtip === "za investicijo" || Boolean(d?.zaInvesticijo),
    opis: k.opis,
    prodajalec: null,
    agencija: k.agencija,
    telefon: null,
    slikaUrl: null,
    stSlik: k.stSlik,
    raw: { zapis: z, rezina: r.oznaka },
  };
}

type Nastavitve100m2 = {
  vir: string;
  /** Izvor brez poševnice na koncu: "https://makler-bled.si". */
  osnova: string;
  agencijaId: string;
  agencija: string;
  pricakovanRazpon: [number, number];
  dnevnaMejaStrani: number;
  dnevniProracunVira: number;
  najvecStraniNaRezino: number;
  pravno: string;
};

/**
 * Adapter za agencijo na Next.js predlogi 100m2.
 *
 * EN SAM SEZNAM (/nepremicnine?page=N, 16 na stran). Posel in vrsto pove vsak
 * zapis sam; delitev po vrstah bi dodala delne zadnje strani in s tem
 * zahtevke, ne pa oglasov. Parametra za razvrstitev ne dodajamo — presoja ga
 * ni preverila, privzeta razvrstitev pa je "activate_dt-desc".
 *
 * RAZVRSTITEV JE PO NOVOSTI (izmerjeno 29. 9. 2026: activate_dt ne narašča
 * čez strani 1–3 pri makler-bled in 1, 2, 7 pri vila-portoroz), a zastavica
 * razvrsceniPoNovosti ostane izklopljena: cel katalog je 3 oz. 7 strani in se
 * prebere v enem krogu. Inkrementalni prelet (del A) bi iste prve dve strani
 * samo prebral še enkrat — ~6 MB na dan več brez enega oglasa več.
 */
function adapter100m2(n: Nastavitve100m2): VirAdapter {
  const rezina: Rezina100m2 = { oznaka: "vse", vir: n.vir };
  const seznamUrl = (_r: Rezina, stran: number): string =>
    stran <= 1 ? `${n.osnova}/nepremicnine` : `${n.osnova}/nepremicnine?page=${stran}`;
  return {
    vir: n.vir,
    // Crawl-delay ni naveden; 8 s je naš najmanjši razmik za tuje vire.
    omejitve: { zamikMs: 8_000 },
    crawlDelayS: null,
    pricakovanRazpon: n.pricakovanRazpon,
    slikePolitika: "referenca",
    dovoljenArhivSlik: false,
    svezKontekstNaStran: false,
    najvecStrani: n.dnevnaMejaStrani,
    najvecStraniNaRezino: n.najvecStraniNaRezino,
    dnevnaMejaStrani: n.dnevnaMejaStrani,
    dnevniProracunVira: n.dnevniProracunVira,
    razvrsceniPoNovosti: false,
    hlajenjeUr: 24,
    pravno: n.pravno,
    rezine: () => [rezina],
    seznamUrl,
    preberiHttp: async (r, stran, ua) =>
      karticeIzHtml(await prenesi(seznamUrl(r, stran), ua), stran, {
        osnova: n.osnova,
        agencijaId: n.agencijaId,
        agencija: n.agencija,
      }),
    preberiSeznam: async () => {
      throw new Error(`${n.vir} se bere brez brskalnika (preberiHttp)`);
    },
    normaliziraj,
  };
}

/**
 * vila-portoroz.si — Vila Portorož d.o.o., Lucija. 106 oglasov (29. 9. 2026),
 * vsi naprodaj: Obala, hrvaška Istra, Španija, Dubaj. Hotela med njimi ni;
 * vir je vreden, ker ga pokrije isti razčlenjevalnik kot makler-bled.
 */
export const adapterVilaPortoroz: VirAdapter = adapter100m2({
  vir: "vila-portoroz.si",
  osnova: "https://www.vila-portoroz.si",
  agencijaId: "442",
  agencija: "Vila Portorož d.o.o. (vila-portoroz.si)",
  // Spodnja meja je ena stran: krog, ki se sklene čez polnoč, v zadnjem
  // zagonu vidi samo še rep kataloga — to ni pokvarjeno branje.
  pricakovanRazpon: [16, 400],
  /**
   * Cel obhod je 7 strani po ~3 MB (106 oglasov). Presoja: en obhod na dan.
   * 8 strani dnevno = ves katalog in ena stran rezerve za rast; drugi zagon
   * dneva ne najde več proračuna in ne bere nič.
   */
  dnevnaMejaStrani: 8,
  dnevniProracunVira: 10,
  najvecStraniNaRezino: 15, // varovalka: 15 × 16 = 240 oglasov, več kot dvakrat katalog
  pravno:
    "robots.txt (29. 9. 2026) za * dovoli vse razen /private/, /test in /cdn-cgi; Crawl-delay in Content-Signal nista " +
    "navedena. Edini pogoji (/pogoji-uporabe, veljajo od 3. 1. 2023) so posredniški splošni pogoji agencije Vila Portorož " +
    "d.o.o. za naročnike in o samodejnem dostopu, zbirkah ali ponovni rabi ne govorijo; politika zasebnosti je interni " +
    "pravilnik po ZVOP-1. Presoja in dva neodvisna skeptika (pravni + tehnični) omejitve niso našli — to je odsotnost " +
    "prepovedi, ne izrecno dovoljenje. POGOJI: noga pravi \"Copyright © 2026 Vila Portorož D.O.O.\", zato hranimo samo " +
    "dejstva s povezavo na izvirnik, brez fotografij (bunny.100m2.si), besedila opisov in podatkov agentov; en obhod " +
    "(~7 strani po ~3 MB) na dan, razmik 8 s.",
});

/**
 * makler-bled.si — Makler Bled d.o.o. 40 oglasov (29. 9. 2026): Bled,
 * Radovljica, Gorje, Bohinj, Jesenice, Šenčur. En hotel (hostel "Bajta
 * Kroparca" v Kropi, 8 sob, 38 ležišč), ki je dvakrat vpisan (tudi kot hiša).
 * Redkost vira: prvotna cena (price_first) ob trenutni in zastavici znižano/ugodno.
 *
 * PAST, izmerjena v presoji: razvrstitev ni stabilna pri istem datumu
 * objave — 535665 je bil na strani 1 in 2, zato je bilo unikatnih 39 od 40.
 * Dvojnik odpravi `videni` v zanki; oglas, ki ga ta dan zgrešimo, se vrne z
 * naslednjim obhodom (vrstni red med enakimi datumi se menja).
 */
export const adapterMaklerBled: VirAdapter = adapter100m2({
  vir: "makler-bled.si",
  osnova: "https://makler-bled.si",
  agencijaId: "75",
  agencija: "Makler Bled d.o.o. (makler-bled.si)",
  pricakovanRazpon: [10, 200],
  // Cel obhod so 3 strani po ~2,7 MB; 4 na dan pusti eno za rast kataloga.
  dnevnaMejaStrani: 4,
  dnevniProracunVira: 6,
  najvecStraniNaRezino: 8, // varovalka: 8 × 16 = 128 oglasov, trikrat katalog
  pravno:
    "robots.txt (29. 9. 2026) za * dovoli vse razen /private/, /test in /cdn-cgi; Crawl-delay in Content-Signal nista " +
    "navedena. Strani s pogoji uporabe ni (/pogoji-uporabe vrne 404); splošni pogoji poslovanja (PDF, od 1. 4. 2024) urejajo " +
    "samo posredovanje z naročniki, politika zasebnosti pa GDPR in piškotke — nič o robotih, zbirkah ali meta-iskanju. " +
    "Presoja in dva neodvisna skeptika (pravni + tehnični) omejitve niso našli — to je odsotnost prepovedi, ne izrecno " +
    "dovoljenje. POGOJI: noga pravi \"© 2026 Vse pravice pridržane, Makler Bled d.o.o.\", zato hranimo samo dejstva s " +
    "povezavo na izvirnik, brez fotografij (bunny.100m2.si) in besedila opisov; en obhod (3 strani) na dan, razmik 8 s. " +
    "Ker pogojev ni, je vljudnostno sporočilo agenciji (info@makler-bled.si) priporočljivo, ne obvezno.",
});

// --- c21.si (Contao/PHP) -----------------------------------------------------

const C21 = "c21.si";
const C21_OSNOVA = "https://c21.si";
/** Kartic na stran (izmerjeno 28. in 29. 9. 2026). Presojina "30" so bile tri povezave na kartico. */
const C21_NA_STRAN = 10;

/** Kar pove kartica c21 — brez bloka agenta in brez besedila napovednika. */
type KarticaC21 = {
  pot: string;
  /** "Rogaška Slatina, Podplat" — občina/mesto, del; lahko še ulica. */
  lokacija: string | null;
  vrsta: string | null;
  podvrsta: string | null;
  posel: Posel;
  /** Velikost, Zgrajeno ali Adaptirano, Nadstropje, Št. sob — kakor jih izpiše kartica. */
  lastnosti: Record<string, string>;
  cena: string | null;
  ugodno: boolean;
  samoPriC21: boolean;
  prestizno: boolean;
  dejstvaOpisa: DejstvaOpisa | null;
};

/**
 * robots.txt c21.si prepoveduje /nepremicnine/*,*,* (filtri z vejicami). Po
 * RFC 9309 se primerja pot SKUPAJ s poizvedbo, zato vejica ne sme biti nikjer
 * v naslovu — tudi če bi jo kdo kdaj dodal v parametre. Varovalka vrže, preden
 * zahtevek odide; /nepremicnine.html (s piko) pod pravilo sicer ne spada.
 */
function seznamUrlC21(_r: Rezina, stran: number): string {
  const url = `${C21_OSNOVA}/nepremicnine.html?&page=${Math.max(1, stran)}&sort=date_added-desc`;
  if (url.includes(",")) throw new Error(`c21.si: naslov z vejico prepoveduje robots.txt (${url})`);
  return url;
}

const cisto = (html: string | undefined): string | null => besediloIz(html) || null;

/** "3.703,90 m2" -> 3703.9; "708 m2" -> 708 (slovenski zapis: pika tisočice, vejica decimalka). */
function m2Iz(t: string | undefined): number | null {
  const m = t?.match(/([\d.,]+)\s*m/);
  const n = m ? stevilo(m[1]) : null;
  return n !== null && n > 0 ? n : null;
}

/**
 * Čisto razčlenjevanje strani seznama c21.si — brez omrežja.
 *
 * Kartica: figure (fotografija kot CSS ozadje, značke "Ugodno" in "Samo pri
 * Century 21"), .info_list [vrsta, podvrsta, posel], h3 = lokacija, .teaser =
 * odrezan opis, .data_list = oznake z vrednostmi, .price, .seller = agent.
 */
export function karticeIzHtmlC21(
  html: string,
  stran: number
): { kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov: number | null } {
  const kartice: SurovaKartica[] = [];
  const videni = new Set<string>();
  for (const surov of html.split('<div class="flex item">').slice(1)) {
    // Blok "seller" nosi ime, fotografijo in število oglasov agenta — osebni
    // podatki, ki jih ne potrebujemo. Odrežemo ga, preden kaj preberemo.
    const kos = surov.split('<div class="seller">')[0];
    // ID "107220-178" = šifra agencije in zaporedna številka; stabilnejši od slug-a.
    const pot = kos.match(/href="(p\/[^"]*?-(\d{5,8}-\d{1,4})\.html)"/);
    if (!pot || videni.has(pot[2])) continue;

    const li = [...(kos.match(/<div class="info_list">([\s\S]*?)<\/ul>/)?.[1] ?? "").matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
      .map((m) => cisto(m[1]))
      .filter((x): x is string => x !== null);
    const poselBesedilo = li.find((x) => poselIz(x) !== null);
    const posel = poselIz(poselBesedilo);
    if (!posel) continue;
    videni.add(pot[2]);
    const [vrsta = null, podvrsta = null] = li.filter((x) => x !== poselBesedilo);

    const lokacija = cisto(kos.match(/<h3>\s*<a[^>]*>([\s\S]*?)<\/a>/)?.[1]);
    const lastnosti: Record<string, string> = {};
    for (const m of kos.matchAll(/<span class="label">\s*([^<]+?)\s*<strong>([\s\S]*?)<\/strong>/g)) {
      const v = cisto(m[2]);
      if (v) lastnosti[m[1].trim()] = v;
    }
    const cena = cisto(kos.match(/<div class="price">([\s\S]*?)<\/div>/)?.[1]);
    const tip = tipIz(vrsta, podvrsta);
    const podtip = podtipIz(vrsta, podvrsta);
    // Napovednik je odrezan opis: iz njega samo dejstva, besedilo zavržemo.
    const napovednik = cisto(kos.match(/<div class="teaser">([\s\S]*?)<\/div>/)?.[1]);
    const dejstva = dejstvaIz(`${[vrsta, podvrsta].filter(Boolean).join(", ")}. ${napovednik ?? ""}`, tip);
    const k: KarticaC21 = {
      pot: pot[1],
      lokacija,
      vrsta,
      podvrsta,
      posel,
      lastnosti,
      cena,
      ugodno: /class="cheap"/.test(kos),
      samoPriC21: /class="badge exclusive"/.test(kos),
      prestizno: /class="badge prestige"/.test(kos),
      dejstvaOpisa: dejstva,
    };

    kartice.push({
      url: `${C21_OSNOVA}/${pot[1]}`,
      virId: pot[2],
      lokacija,
      naslovVrstica:
        [zVelikoZacetnico(posel), vrsta, podvrsta, lokacija, lastnosti.Velikost].filter(Boolean).join(", ") || null,
      opis:
        [
          nastanitevFraza(dejstva),
          [vrsta, podvrsta].filter(Boolean).join(", ") || null,
          posel,
          ...Object.entries(lastnosti).map(([oznaka, v]) =>
            /^št\.?\s*sob$/i.test(oznaka)
              ? podtip === "hotel"
                ? `${v} sob`
                : `število sob: ${v}`
              : `${oznaka.toLowerCase()}: ${v}`
          ),
          cena ? `cena: ${cena}` : null,
          k.ugodno ? "ugodno" : null,
          k.samoPriC21 ? "samo pri Century 21" : null,
          k.prestizno ? "prestižno" : null,
          lokacija,
        ]
          .filter(Boolean)
          .join("; ") || null,
      cenaBesedilo: cena,
      telefon: null,
      agencija: "CENTURY 21 Slovenija (c21.si)",
      slika: null, // fotografija je na bunny.100m2.si — presoja jo izključi
      stSlik: null,
      surovo: k,
    });
  }

  // "910 nepremičnin" v glavi seznama (na glavnem seznamu span.no_title, na
  // kategoriji span brez razreda). Paginacija kaže samo okno devetih strani in
  // "Naprej", zato zadnjo stran izračunamo iz števila; največja številka v
  // povezavah je spodnja meja, če bi vir kdaj spremenil velikost strani.
  // Omejeno na glavo: "12 nepremičnin" pri agentu je njegovo število oglasov.
  const st = html.match(/s_headline[\s\S]{0,300}?<span[^>]*>\s*([\d.]+)\s*nepremičnin/);
  const skupaj = st ? Number(st[1].replace(/\./g, "")) : null;
  const vPovezavah = [...html.matchAll(/[?&]page=(\d+)/g)].map((m) => Number(m[1]));
  const zadnjaStran =
    skupaj !== null
      ? Math.max(1, Math.ceil(skupaj / C21_NA_STRAN), ...vPovezavah)
      : vPovezavah.length > 0
        ? Math.max(stran, ...vPovezavah)
        : kartice.length > 0
          ? stran
          : null;
  return { kartice, zadnjaStran, skupajZadetkov: skupaj };
}

/**
 * Kraj iz "Mesto, Del[, ulica]": del je naselje ali mestna četrt ("Maribor,
 * Ruperče", "Celje, Vojnik"), "Center" pomeni mesto samo. Tretji del je ulica
 * ("Ljubljana, Bežigrajski dvor, Dunajska cesta 56") in nikoli kraj.
 */
function krajC21(lokacija: string | null | undefined): string | null {
  const deli = (lokacija ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  if (deli.length === 0) return null;
  return deli.length === 1 || /^center$/i.test(deli[1]) ? deli[0] : deli[1];
}

export function normalizirajC21(k: SurovaKartica, r: Rezina): NormaliziranOglas {
  const s = (k.surovo ?? {}) as Partial<KarticaC21>;
  const d = s.dejstvaOpisa ?? null;
  const posel = s.posel ?? "prodaja";
  const tip = tipIz(s.vrsta, s.podvrsta);
  const podtip = podtipIz(s.vrsta, s.podvrsta);
  const L = s.lastnosti ?? {};
  const sobeOznaka = Object.keys(L).find((o) => /^št\.?\s*sob$/i.test(o));
  const sobe = sobeOznaka ? stevilo(L[sobeOznaka]) : null;
  const { stEnot, vecEnot } = enoteIz(tip, podtip, sobe !== null && sobe > 0 ? sobe : null, d);
  const velikost = m2Iz(L.Velikost);
  const parcela = m2Iz(L.Parcela ?? L["Zemljišče"]);
  return {
    vir: C21,
    virId: k.virId,
    url: k.url,
    naslov: k.naslovVrstica,
    tip,
    podtip,
    posel,
    // Kartica regije ne pove (tudi "Ljubljana, Kamnik" je lahko mesto ali
    // okolica); regija je v ld+json detajla, ki ga brez brskalnika ne beremo.
    regija: null,
    kraj: krajC21(s.lokacija ?? k.lokacija),
    cenaEur: pravaCena(s.cena ? cenaIz(s.cena) : null, s.cena, posel),
    // "Velikost" je bruto (vir razvršča po bruto_area). Pri parceli je edina
    // številka zemljišče — bivalne površine tam ni.
    povrsinaM2: tip === "posest" && parcela === null ? null : velikost,
    zemljisceM2: parcela ?? (tip === "posest" ? velikost : null),
    letoIzgradnje: leto(L.Zgrajeno),
    letoAdaptacije: leto(L.Adaptirano),
    nadstropje: L.Nadstropje ?? null,
    vecEnot,
    stEnot,
    stEnotOcena: d?.stEnotOcena ?? null,
    loceneKuhinje: d?.loceneKuhinje ?? null,
    looceniVhodi: d?.looceniVhodi ?? null,
    zaObnovo: Boolean(d?.zaObnovo),
    zaInvesticijo: podtip === "hotel" || podtip === "za investicijo" || Boolean(d?.zaInvesticijo),
    opis: k.opis,
    prodajalec: null, // ime agenta je osebni podatek (skeptik: GDPR)
    agencija: k.agencija,
    telefon: null,
    slikaUrl: null,
    stSlik: null,
    raw: { kartica: s, rezina: r.oznaka },
  };
}

/**
 * c21.si — CENTURY 21 Slovenija (CSLO NEPREMIČNINE d.o.o. in ~11 franšiz).
 * 910 oglasov (29. 9. 2026): Slovenija 764, tujina (Istra, Ciper, Dubaj) ostalo;
 * poslovni prostori s podvrstami Hotel (5), Gostinski lokal (19), Poslovni
 * kompleks (20). Isto nepremičnino agenti vpišejo pod več ID-ji in podvrstami
 * (Podplat: 107220-176/-178/-206) — to so ločeni oglasi vira; združevanje je
 * delo centralnega iskalnika dvojnikov, ne adapterja.
 *
 * RAZVRSTITEV NI DOKAZANO PO NOVOSTI. Parameter se sicer imenuje
 * date_added-desc, a med 28. 9. (909) in 29. 9. (910) se nov oglas
 * (izola-101215-327) NI pojavil na vrhu strani 1, ampak na 10. mestu; prvih
 * devet je ostalo na mestu. Datum dodajanja je verjetno dnevni, vrstni red
 * znotraj dneva pa poljuben. Zato razvrsceniPoNovosti: false — zgodnja
 * ustavitev bi tu lahko tiho izpustila oglase. Parameter vseeno pišemo, ker
 * da ustaljen vrstni red za paginacijo in ker je naslov preverila presoja.
 */
export const adapterC21: VirAdapter = {
  vir: C21,
  // Crawl-delay ni naveden; presoja predlaga ≥ 5 s, naš najmanjši je 8 s.
  omejitve: { zamikMs: 8_000 },
  crawlDelayS: null,
  // Spodnja meja je ena stran: krog se sklene v zagonu, ki prebere samo rep
  // kataloga (zadnje 1–3 strani), in to ni pokvarjeno branje.
  pricakovanRazpon: [10, 3_000],
  slikePolitika: "referenca",
  dovoljenArhivSlik: false,
  svezKontekstNaStran: false,
  /**
   * Cel obhod je ~91 strani po ~100 kB. 22 na dan = krog v ~4 dneh (pravilo:
   * ≤ 5), z rezervo za rast do ~110 strani. Presoja izrecno ne želi
   * "ponovnega množičnega zajema vseh 91 strani" naenkrat — zato raje dnevni
   * obrok kot en velik krog.
   */
  najvecStrani: 22,
  najvecStraniNaRezino: 120, // varovalka: 1.200 oglasov, dobra tretjina nad katalogom
  dnevnaMejaStrani: 22,
  dnevniProracunVira: 28,
  razvrsceniPoNovosti: false,
  hlajenjeUr: 24,
  pravno:
    "robots.txt (29. 9. 2026): ena skupina za *, prepovedani so filtri z vejicami (/nepremicnine/*,*,*, " +
    "/real-estate/*,*,*) in sistemske poti; seznam /nepremicnine.html?&page=N&sort=date_added-desc je dovoljen, " +
    "Crawl-delay ni naveden. Pogojev uporabe spletišča ni — disclaimer.html in splošni pogoji franšiz (PDF) urejajo " +
    "samo posredovanje z naročniki in o robotih, zbirkah ali meta-iskanju ne govorijo; edina omejitev je noga " +
    "\"©2018 CENTURY 21 Slovenija. Vse pravice pridržane!\". Presoja in dva neodvisna skeptika (pravni + tehnični) " +
    "omejitve niso našli. POGOJI: nikoli naslova z vejico; hranimo samo dejstva s povezavo na izvirnik — brez " +
    "fotografij (bunny.100m2.si), besedila opisov, virtualnih ogledov ter imen in telefonov agentov; Cloudflare " +
    "izziv ali 403/429 pomeni hlajenje.",
  rezine: () => [{ oznaka: "vse" }],
  seznamUrl: seznamUrlC21,
  preberiHttp: async (r, stran, ua) => karticeIzHtmlC21(await prenesi(seznamUrlC21(r, stran), ua), stran),
  preberiSeznam: async () => {
    throw new Error("c21.si se bere brez brskalnika (preberiHttp)");
  },
  normaliziraj: normalizirajC21,
};

/** Vsi trije, za register v index.ts (vsak se v nep_viri vpiše IZKLOPLJEN). */
export const adapterji: VirAdapter[] = [adapterC21, adapterVilaPortoroz, adapterMaklerBled];
