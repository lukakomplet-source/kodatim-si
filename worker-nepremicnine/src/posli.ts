import type { Db } from "./db.js";
import { preberiVse } from "./nepremicnine.js";
import { povrsinaZaIzracun } from "../../src/lib/nepremicnine/verjetnost.js";

/**
 * Deal feed za nepremičnine — predizračunan v workerju po vsakem pregledu,
 * UI ga samo prebere iz nep_statistika (isti vzorec kot avtonet 'deal_feed':
 * ob renderju se ne računa nič, števke pa so za vse obiskovalce iste).
 *
 * Vsaka točka ima razlog, vsaka ocena vir: primerjave €/m² prihajajo iz NAŠIH
 * aktivnih oglasov, ocena najemnine iz NAŠIH najemnih oglasov. Brez vzorca
 * ni številke.
 */

export type Stanje = "novo" | "obnovljeno" | "za_obnovo";

export type NepPosel = {
  id: string;
  url: string;
  naslov: string | null;
  kraj: string | null;
  regija: string | null;
  tip: string | null;
  cena: number;
  cenaM2: number | null;
  povrsina: number | null;
  zemljisce: number | null;
  stEnot: number | null;
  stEnotOcena: number | null;
  leto: number | null;
  dniNaTrgu: number;
  padecPct: number | null;
  /** €/m² primerjave: mediana primerljivih oglasov (ali regije, če jih ni). */
  medianaM2: number | null;
  medianaVzorec: number;
  odstopanjePct: number | null; // koliko pod primerjavo €/m² (pozitivno = ceneje)
  /** S čim je oglas primerjan, npr. "14 primerljivih v 6 km, podobna velikost". */
  primerjava: string | null;
  /** Razlog, zaradi katerega nizka cena NI dokaz posla (preveri pred klicem). */
  opozorilo: string | null;
  stanje: Stanje | null;
  drzava: string | null;
  brutoDonosPct: number | null;
  /** Ocenjena mesečna najemnina objekta in kako je nastala (za prikaz). */
  najemMesecno: number | null;
  najemOpis: string | null;
  najemVzorec: number;
  agencija: string | null;
  telefon: string | null;
  vir: string;
  /** Kanonična nepremičnina — dva oglasa istega objekta imata isti id. */
  nepremicninaId: string | null;
  tocke: number;
  razlogi: string[];
};

type Vrstica = {
  id: string; vir: string; url: string; naslov: string | null; tip: string | null; podtip: string | null;
  regija: string | null; drzava: string | null; kraj: string | null; lat: number | null; lng: number | null;
  cena_eur: number | null; cena_prvotna_eur: number | null; cena_m2_eur: number | null;
  povrsina_m2: number | null; zemljisce_m2: number | null; st_enot: number | null; st_enot_ocena: number | null;
  leto_izgradnje: number | null; leto_adaptacije: number | null; vec_enot: boolean; za_obnovo: boolean;
  za_investicijo: boolean; first_seen: string; datum_objave: string | null; data_quality: number | null;
  agencija: string | null; telefon: string | null;
  /** Kanonična nepremičnina; isti objekt iz dveh oglasov ima isti id. */
  nepremicnina_id: string | null;
};

function mediana(v: number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * BESEDILNI ZNAKI, ki spremenijo pomen cene. Iščemo jih v bazi (POSIX regex,
 * `imatch`), ne v workerju: opisi vseh aktivnih oglasov so stotine MB.
 * Velike črke šumnikov so naštete posebej, ker primerjava brez razlikovanja
 * velikosti pri ne-ASCII znakih ni zanesljiva v vseh jezikovnih nastavitvah.
 *
 * Zakaj stanje. 29. 9. 2026 je bilo 92 od 200 "poslov" več kot 60 % pod
 * mediano regije. Pregled je pokazal, da mediana ni bila napačna — obnovljena
 * stanovanja v Trbovljah se res ponujajo po 2.500–3.000 €/m² —, ampak je bila
 * enaka za obnovljeno in za neobnovljeno stanovanje. Stanovanje za obnovo po
 * 700 €/m² ni 75 % pod trgom; je na trgu za obnovo.
 */
const VZORCI = {
  zaObnovo:
    "potreb[a-zčšž]* (je |celovite |temeljite |popolne |kompletne )?(obnov|prenov|adaptacij|sanacij)|za (obnovo|prenovo|adaptacijo|rušenje)|dotrajan|ruševin|potrebuje (obnovo|prenovo)|v izvirnem stanju|needs? (renovation|refurbishment)|to renovate|for renovation|za renovaciju|potrebn[a-z]* (adaptacij|renovacij)",
  obnovljeno:
    "(popolnoma|celovito|kompletno|v celoti|na novo|temeljito|nedavno|lepo|v letu 20[12][0-9]) (obnovljen|prenovljen|adaptiran|renoviran)|adaptirano l\\. 20(1[5-9]|2[0-9])|prenovljen[a-z]* (leta|l\\.) 20(1[5-9]|2[0-9])|newly renovated|fully renovated|potpuno renovira",
  novo: "novogradnj|[nN]ovogradnj|newly built|new build|novoizgra[dđ]",
  delez:
    "solastni[šŠ]k[a-z]* dele|idealn[a-z]* dele|lastni[šŠ]k[a-z]* dele[žŽ] |[0-9]+ ?/ ?[0-9]+ (dele|solast|nepremi)|dele[žŽ] (do|v vi[šŠ]ini) [0-9]|suvlasni[čČ]k",
  drazba:
    "javn[a-z]* dra[žŽ]b|izklicn[a-z]* cen|javno zbiranje ponudb|ste[čČ]ajn|izvr[šŠ]b|DRA[žŽ]BA|Dra[žŽ]ba",
};

async function idjiPoVzorcu(db: Db, vzorec: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const stolpec of ["naslov", "opis"]) {
    const vr = await preberiVse<{ id: string }>(db, "nep_oglasi", "id", (q) =>
      q.eq("status", "aktiven").eq("posel", "prodaja").filter(stolpec, "imatch", vzorec)
    );
    for (const v of vr) ids.add(v.id);
  }
  return ids;
}

/** Idji aktivnih prodajnih oglasov, pri katerih naslov ali opis izda znak. */
export type BesedilniZnaki = {
  zaObnovo: Set<string>;
  obnovljeno: Set<string>;
  novo: Set<string>;
  delez: Set<string>;
  drazba: Set<string>;
};

/**
 * Vseh pet znakov naenkrat. Vsak je pregled cele tabele (~6 s na stolpec),
 * zato jih knjigovodstvo prebere ENKRAT in jih da poslom in večenotnim.
 */
export async function preberiBesedilneZnake(db: Db): Promise<BesedilniZnaki> {
  const [zaObnovo, obnovljeno, novo, delez, drazba] = await Promise.all([
    idjiPoVzorcu(db, VZORCI.zaObnovo),
    idjiPoVzorcu(db, VZORCI.obnovljeno),
    idjiPoVzorcu(db, VZORCI.novo),
    idjiPoVzorcu(db, VZORCI.delez),
    idjiPoVzorcu(db, VZORCI.drazba),
  ]);
  return { zaObnovo, obnovljeno, novo, delez, drazba };
}

/**
 * Tri razreda stanja, ne dva: stanovanje iz 1975, obnovljeno 2013, ni
 * primerljivo z novogradnjo po 4.000 €/m² — v Medvodah je bilo proti njim
 * "58 % pod trgom". Novo = zgrajeno 2015 ali pozneje ali novogradnja v
 * besedilu; obnovljeno = obnova 2012 ali pozneje ali v besedilu.
 */
export function razredStanja(
  o: { id: string; za_obnovo: boolean; leto_izgradnje: number | null; leto_adaptacije: number | null },
  z: BesedilniZnaki
): Stanje | null {
  const zaO = o.za_obnovo || z.zaObnovo.has(o.id);
  if ((o.leto_izgradnje ?? 0) >= 2015 || (z.novo.has(o.id) && !zaO)) return "novo";
  const obn = z.obnovljeno.has(o.id) || (o.leto_adaptacije ?? 0) >= 2012 || (o.leto_izgradnje ?? 0) >= 2008;
  if (zaO && !obn) return "za_obnovo";
  if (obn && !zaO) return "obnovljeno";
  return null;
}

/**
 * Primerjamo samo enako z enakim. Pri zemljiščih podtip ni podrobnost:
 * zazidljivo zemljišče stane 50–150 €/m², kmetijsko 2–5 €/m². Zemljišče brez
 * podtipa se ne primerja, ker bi bil vsak gozd "posel" proti mediani parcel.
 */
function vrstaZa(o: Vrstica): string | null {
  if (!o.tip) return null;
  if (o.tip === "posest") {
    const p = (o.podtip ?? "").toLowerCase();
    if (p.startsWith("zazidljiv")) return "posest:zazidljiva";
    if (/kmetij|nezazidljiv|gozd/.test(p)) return "posest:kmetijska";
    return null;
  }
  return o.tip;
}

/** Razmerje velikosti, v katerem je oglas še primerljiv. */
function razponVelikosti(tip: string | null): [number, number] {
  return tip === "posest" ? [0.4, 2.5] : [0.6, 1 / 0.6];
}

/**
 * Velikostni pas — za regionalno rezervo, kadar primerljivih v bližini ni
 * dovolj. Garsonjera ima višji €/m² kot 150 m² stanovanje; brez pasov je bila
 * vsaka večja nepremičnina "pod mediano".
 */
function pas(tip: string | null, m2: number): string {
  const meje: Record<string, number[]> = {
    stanovanje: [40, 65, 95, 140],
    hisa: [120, 200, 300],
    posest: [500, 1200, 3000],
    poslovni_prostor: [50, 150, 500],
  };
  const m = meje[tip ?? ""];
  if (!m) return "";
  const i = m.findIndex((x) => m2 < x);
  return String(i === -1 ? m.length : i);
}

const STANJE_BESEDA: Record<Stanje, string> = { novo: "novogradnje", obnovljeno: "obnovljeni", za_obnovo: "za obnovo" };

type Tocka = {
  id: string;
  lat: number;
  lng: number;
  m2: number;
  povrsina: number;
  stanje: Stanje | null;
  /** Isti objekt na več portalih ne sme šteti večkrat. */
  dvojnik: string;
  nid: string | null;
  agencija: string | null;
};

const CELICA = 0.05; // stopinje; ~5,5 km v smeri S-J
const celica = (lat: number, lng: number) => `${Math.floor(lat / CELICA)}|${Math.floor(lng / CELICA)}`;

function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = Math.PI / 180;
  const x = (bLng - aLng) * r * Math.cos(((aLat + bLat) / 2) * r);
  const y = (bLat - aLat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

/** Zasebni prodajalci niso "agencija"; omejitev na agencijo zanje ne velja. */
const jeAgencija = (a: string | null) => !!a && !/zasebn|fizi[čc]n|lastnik/i.test(a);

export async function izracunajPosle(db: Db, log: (msg: string) => void, znaki?: BesedilniZnaki): Promise<number> {
  const tZacetek = Date.now();
  const polja =
    "id, vir, url, naslov, tip, podtip, regija, drzava, kraj, lat, lng, cena_eur, cena_prvotna_eur, cena_m2_eur, povrsina_m2, zemljisce_m2, st_enot, st_enot_ocena, leto_izgradnje, leto_adaptacije, vec_enot, za_obnovo, za_investicijo, first_seen, datum_objave, data_quality, agencija, telefon, nepremicnina_id";
  const prodajni = await preberiVse<Vrstica>(db, "nep_oglasi", polja, (q) =>
    q.eq("status", "aktiven").eq("posel", "prodaja").gte("cena_eur", 10_000)
  );
  const najemni = await preberiVse<{ regija: string | null; cena_eur: number | null; povrsina_m2: number | null }>(
    db, "nep_oglasi", "regija, cena_eur, povrsina_m2",
    (q) => q.eq("status", "aktiven").eq("posel", "oddaja").eq("tip", "stanovanje").gt("cena_eur", 100).lt("cena_eur", 10000)
  );
  const tBranje = Date.now();
  const z = znaki ?? (await preberiBesedilneZnake(db));

  /**
   * PRAVI ČAS NA TRGU. Ponovna objava (ponovne-objave.ts) prenese prvotno
   * ceno, ne pa prvega dne: oglas, ki se po 120 dneh vrne pod novo številko,
   * bi bil sicer "star 2 dni". Veriga A → B → C se razreši do A.
   */
  const ponovne = await preberiVse<{ oglas_id: string; staro: { oglas_id?: string } | null }>(
    db, "nep_spremembe", "oglas_id, staro", (q) => q.eq("tip", "ponovna_objava")
  );
  const prejsnji = new Map<string, string>();
  for (const p of ponovne) if (p.staro?.oglas_id) prejsnji.set(p.oglas_id, p.staro.oglas_id);
  const izginuli = await preberiVse<{ id: string; first_seen: string; datum_objave: string | null }>(
    db, "nep_oglasi", "id, first_seen, datum_objave", (q) => q.eq("status", "izginil")
  );
  const prviDan = new Map<string, number>();
  const zacetek = (fs: string, dob: string | null) =>
    Math.min(new Date(fs).getTime(), dob ? new Date(dob).getTime() : Infinity);
  for (const z of izginuli) prviDan.set(z.id, zacetek(z.first_seen, z.datum_objave));
  for (const o of prodajni) prviDan.set(o.id, zacetek(o.first_seen, o.datum_objave));
  const prvicNaTrgu = (id: string): { t: number; ponovno: boolean } => {
    let t = prviDan.get(id) ?? Date.now();
    let cur = id;
    let ponovno = false;
    for (let korak = 0; korak < 10 && prejsnji.has(cur); korak++) {
      cur = prejsnji.get(cur)!;
      const p = prviDan.get(cur);
      if (p !== undefined && p < t) t = p;
      ponovno = true;
    }
    return { t, ponovno };
  };

  const stanjeZa = (o: Vrstica): Stanje | null => razredStanja(o, z);

  /**
   * INDEKS PRIMERLJIVIH: (država|vrsta) → celica mreže → oglasi.
   *
   * Regija je pregroba enota: v "ljubljana-mesto" je 5.385 €/m² mediana, ki
   * velja za Center, ne za Fužine; "zasavska" meša Zagorje s hribovskimi
   * zaselki. Primerjava z oglasi v nekaj kilometrih iste vrste in podobne
   * velikosti je tista, ki jo naredi kupec sam.
   */
  const indeks = new Map<string, Map<string, Tocka[]>>();
  const regVzorci = new Map<string, number[]>();
  const dodajReg = (k: string, v: number) => {
    const arr = regVzorci.get(k) ?? [];
    arr.push(v);
    regVzorci.set(k, arr);
  };
  const regVideni = new Set<string>();
  for (const o of prodajni) {
    if (o.cena_m2_eur === null || !o.drzava) continue;
    if (z.delez.has(o.id) || z.drazba.has(o.id)) continue;
    // Oglas z nemogočo površino ima tudi nemogoč €/m² — v primerjavo ne sme.
    const povrsina = povrsinaZaIzracun(o.tip, o.povrsina_m2);
    const vrsta = vrstaZa(o);
    if (povrsina === null || vrsta === null) continue;
    const m2 = Number(o.cena_m2_eur);
    if (!Number.isFinite(m2) || m2 <= 0) continue;
    const dvojnik = `${o.cena_eur}|${povrsina}`;
    const stanje = stanjeZa(o);
    // Regionalna rezerva: isti objekt na dveh portalih šteje enkrat.
    if (o.regija && !regVideni.has(`${o.regija}|${dvojnik}`)) {
      regVideni.add(`${o.regija}|${dvojnik}`);
      dodajReg(`${o.drzava}|${vrsta}|${o.regija}|${pas(o.tip, povrsina)}`, m2);
      dodajReg(`${o.drzava}|${vrsta}|${o.regija}`, m2);
    }
    if (o.lat === null || o.lng === null) continue;
    const kljuc = `${o.drzava}|${vrsta}`;
    const mreza = indeks.get(kljuc) ?? new Map<string, Tocka[]>();
    indeks.set(kljuc, mreza);
    const c = celica(o.lat, o.lng);
    const arr = mreza.get(c) ?? [];
    arr.push({ id: o.id, lat: o.lat, lng: o.lng, m2, povrsina, stanje, dvojnik, nid: o.nepremicnina_id, agencija: o.agencija });
    mreza.set(c, arr);
  }
  const regMediane = new Map<string, { m2: number; vzorec: number }>();
  for (const [k, arr] of regVzorci) if (arr.length >= 10) regMediane.set(k, { m2: mediana(arr)!, vzorec: arr.length });

  /**
   * Kandidati do 20 km, UREJENI PO RAZDALJI: podobna velikost, brez dvojnikov
   * in največ 3 na agencijo — oboje v vrstnem redu razdalje, da bližnji
   * izpodrinejo daljne. Manjši krogi so predpone istega seznama.
   */
  const NAJVEC_KM = 20;
  const blizu = (o: Vrstica, povrsina: number, mreza: Map<string, Tocka[]>): { t: Tocka; d: number }[] => {
    const lat = o.lat!;
    const lng = o.lng!;
    const [lo, hi] = razponVelikosti(o.tip);
    const dLat = NAJVEC_KM / 111;
    const dLng = NAJVEC_KM / (111 * Math.cos((lat * Math.PI) / 180));
    const kand: { t: Tocka; d: number }[] = [];
    for (let i = Math.floor((lat - dLat) / CELICA); i <= Math.floor((lat + dLat) / CELICA); i++) {
      for (let j = Math.floor((lng - dLng) / CELICA); j <= Math.floor((lng + dLng) / CELICA); j++) {
        for (const t of mreza.get(`${i}|${j}`) ?? []) {
          if (t.id === o.id || (o.nepremicnina_id && t.nid === o.nepremicnina_id)) continue;
          const razm = t.povrsina / povrsina;
          if (razm < lo || razm > hi) continue;
          const d = km(lat, lng, t.lat, t.lng);
          if (d <= NAJVEC_KM) kand.push({ t, d });
        }
      }
    }
    kand.sort((a, b) => a.d - b.d);
    const out: { t: Tocka; d: number }[] = [];
    const videni = new Set<string>([`${o.cena_eur}|${povrsina}`]);
    const naAgencijo = new Map<string, number>();
    for (const k of kand) {
      if (videni.has(k.t.dvojnik)) continue;
      // En projekt ene agencije (20 stanovanj v novem bloku) ni 20 mnenj trga.
      if (jeAgencija(k.t.agencija)) {
        const n = naAgencijo.get(k.t.agencija!) ?? 0;
        if (n >= 3) continue;
        naAgencijo.set(k.t.agencija!, n + 1);
      }
      videni.add(k.t.dvojnik);
      out.push(k);
    }
    return out;
  };

  /**
   * Večji krog pomeni bolj mešano okolico (vas proti mestu 15 km stran), zato
   * manj zaupanja v isto odstopanje.
   */
  const RADIJI: [number, number][] = [[3, 1], [6, 0.9], [12, 0.75], [20, 0.6]];

  type Primerjava = { m2: number; vzorec: number; opis: string; isteStanje: boolean; regionalna: boolean; utez: number };
  const primerjaj = (o: Vrstica, povrsina: number, stanje: Stanje | null): Primerjava | null => {
    const vrsta = vrstaZa(o);
    if (!vrsta || !o.drzava) return null;
    const mreza = indeks.get(`${o.drzava}|${vrsta}`);
    if (mreza && o.lat !== null && o.lng !== null) {
      const vsi = blizu(o, povrsina, mreza);
      /**
       * ENAKO Z ENAKIM. Oglas neznanega stanja primerjamo z oglasi, ki NISO
       * potrjeno obnovljeni ali novi: v Velenju in Šoštanju so novogradnje
       * po 3.500 €/m² in vsako starejše stanovanje v 6 km je bilo proti njim
       * "58 % pod trgom".
       */
      const istiRazred = (t: Tocka) =>
        stanje === null ? t.stanje !== "obnovljeno" && t.stanje !== "novo" : t.stanje === stanje;
      const opisRazreda = stanje === null ? "brez obnovljenih in novogradenj" : STANJE_BESEDA[stanje];
      const najmanj = stanje === null ? 8 : 6;
      for (const [r, utez] of RADIJI) {
        const iste = vsi.filter((k) => k.d <= r && istiRazred(k.t));
        if (iste.length >= najmanj)
          return {
            m2: mediana(iste.map((k) => k.t.m2))!,
            vzorec: iste.length,
            opis: `${iste.length} primerljivih v ${r} km (podobna velikost, ${opisRazreda})`,
            isteStanje: true,
            regionalna: false,
            utez,
          };
      }
      for (const [r, utez] of RADIJI) {
        const mes = vsi.filter((k) => k.d <= r);
        if (mes.length >= 8)
          return {
            m2: mediana(mes.map((k) => k.t.m2))!,
            vzorec: mes.length,
            opis: `${mes.length} primerljivih v ${r} km (podobna velikost, stanje mešano)`,
            isteStanje: false,
            regionalna: false,
            utez,
          };
      }
    }
    if (!o.regija) return null;
    const pasK = `${o.drzava}|${vrsta}|${o.regija}|${pas(o.tip, povrsina)}`;
    const reg = regMediane.get(pasK) ?? regMediane.get(`${o.drzava}|${vrsta}|${o.regija}`);
    if (!reg) return null;
    return {
      m2: reg.m2,
      vzorec: reg.vzorec,
      opis: `mediana regije ${o.regija}${regMediane.has(pasK) ? " (isti velikostni pas)" : ""}, n=${reg.vzorec} — primerljivih v bližini ni dovolj`,
      isteStanje: false,
      regionalna: true,
      utez: 0.5,
    };
  };

  /**
   * Najemnine po VELIKOSTNEM RAZREDU, ne čez vse: garsonjera se odda za ~15
   * €/m², 250 m² hiša pa nikoli ne za 15 €/m². Brez razredov je mediana
   * majhnih stanovanj velikim hišam napihnila oceno donosa.
   */
  const razred = (m2: number) => (m2 < 50 ? "<50" : m2 < 80 ? "50-80" : m2 < 120 ? "80-120" : m2 < 200 ? "120-200" : ">200");
  const najemVzorci = new Map<string, number[]>();
  const najemAbsVzorci = new Map<string, number[]>();
  const dodaj = (m: Map<string, number[]>, kljuc: string, v: number) => {
    const arr = m.get(kljuc) ?? [];
    arr.push(v);
    m.set(kljuc, arr);
  };
  for (const n of najemni) {
    if (n.cena_eur === null) continue;
    const m2 = povrsinaZaIzracun("stanovanje", n.povrsina_m2);
    if (m2 === null || m2 <= 10) continue;
    const naM2 = Number(n.cena_eur) / m2;
    dodaj(najemVzorci, `|${razred(m2)}`, naM2);
    if (n.regija) {
      dodaj(najemVzorci, n.regija, naM2);
      dodaj(najemVzorci, `${n.regija}|${razred(m2)}`, naM2);
      // Absolutna najemnina ENE enote — za večenotne objekte je to prava mera.
      dodaj(najemAbsVzorci, n.regija, Number(n.cena_eur));
    }
  }
  const najemMediane = new Map<string, { naM2: number; vzorec: number }>();
  for (const [k, arr] of najemVzorci) if (arr.length >= 5) najemMediane.set(k, { naM2: mediana(arr)!, vzorec: arr.length });
  const najemAbs = new Map<string, { mesecno: number; vzorec: number }>();
  for (const [k, arr] of najemAbsVzorci) if (arr.length >= 8) najemAbs.set(k, { mesecno: mediana(arr)!, vzorec: arr.length });

  /**
   * Ocena najemnine SAMO tam, kjer jo podatki res podpirajo:
   *  - stanovanje: €/m² iste REGIJE in istega velikostnega razreda (sredstvo
   *    iste vrste kot vzorec),
   *  - hiša s POTRJENIMI enotami: mediana absolutne najemnine stanovanja v tej
   *    regiji × število enot.
   * Za hišo brez znanih enot ocene NI: nihče ne odda 262 m² hiše kot eno
   * stanovanje po ceni mestne garsonjere na m² (tako je nastal "47 % donosa").
   * Državne rezerve namenoma ni — najemnine v Ljubljani ne povedo ničesar o
   * najemninah v Beli krajini.
   */
  const oceniNajemnino = (o: Vrstica, povrsina: number | null): { mesecno: number; vzorec: number; opis: string } | null => {
    if (!o.regija) return null;
    if (o.tip === "stanovanje" && povrsina !== null && povrsina > 10) {
      // Nad 120 m² zahtevamo vzorec ISTEGA velikostnega razreda: mediana €/m²
      // regije je narejena iz garsonjer in dvosobnih, zato je 450 m² enoti
      // pripisala 5.000 €/mes najemnine (in "50 % donosa").
      const vRazredu = najemMediane.get(`${o.regija}|${razred(povrsina)}`);
      const m = vRazredu ?? (povrsina <= 120 ? najemMediane.get(o.regija) : undefined);
      if (!m) return null;
      return {
        mesecno: m.naM2 * povrsina,
        vzorec: m.vzorec,
        opis: `${Math.round(m.naM2 * 100) / 100} €/m² (${vRazredu ? `${razred(povrsina)} m², ` : ""}regija)`,
      };
    }
    if (o.tip === "hisa" && o.st_enot !== null && o.st_enot >= 2) {
      const a = najemAbs.get(o.regija);
      if (!a) return null;
      return {
        mesecno: a.mesecno * o.st_enot,
        vzorec: a.vzorec,
        opis: `${o.st_enot} × mediana najemnine stanovanja v regiji (${Math.round(a.mesecno)} €)`,
      };
    }
    return null;
  };

  const tIzracun = Date.now();
  const zdaj = Date.now();
  const posli: NepPosel[] = [];
  const stevci = { bliznji: 0, regionalni: 0, brez: 0, sumljivih: 0, delezev: 0, drazb: 0 };
  for (const o of prodajni) {
    const cena = Number(o.cena_eur);
    // Nemogoča površina pri viru (npr. "Bivalna površina: 239000 m2" pri
    // oglasu z naslovom "136m2") ne sme v noben izračun — oglas se pokaže,
    // a brez €/m², donosa in ocene enot.
    const povrsina = povrsinaZaIzracun(o.tip, o.povrsina_m2);
    const cenaM2 = povrsina === null || o.cena_m2_eur === null ? null : Number(o.cena_m2_eur);
    let tocke = 0;
    const razlogi: string[] = [];
    let opozorilo: string | null = null;
    const stanje = stanjeZa(o);
    const delez = z.delez.has(o.id);
    const drazba = z.drazba.has(o.id);

    const prim = povrsina !== null && cenaM2 !== null ? primerjaj(o, povrsina, stanje) : null;
    if (prim) stevci[prim.regionalna ? "regionalni" : "bliznji"]++;
    else stevci.brez++;
    let odstopanjePct: number | null = null;
    if (prim && cenaM2 !== null) {
      odstopanjePct = Math.round(((prim.m2 - cenaM2) / prim.m2) * 1000) / 10;
      if (delez) {
        stevci.delezev++;
        opozorilo = "Prodaja solastniškega deleža — cena ne velja za celo nepremičnino.";
      } else if (odstopanjePct >= 60) {
        // Cena pod 40 % primerljivih je v naši bazi skoraj vedno napaka
        // (cena na m² vpisana kot cena, površina v napačni enoti, ruševina,
        // del objekta) — ne posel. Oglas ostane viden, točk za ceno ne dobi.
        stevci.sumljivih++;
        opozorilo = `Cena je ${odstopanjePct} % pod primerljivimi — to je pogosteje napaka v oglasu (cena, površina, delež, ruševina) kot posel. Preveri pred klicem.`;
      } else if (odstopanjePct > 0) {
        /**
         * Točke rastejo do 40 % pod primerljivimi in nad 45 % spet padajo.
         * Pregled 29. 9. 2026: med oglasi 45–60 % pod primerljivimi so bili
         * večinoma napačno geokodirani soimenjaki ("Ledine" pri Idriji proti
         * ljubljanskim Ledinam), površine s kletjo in podstrešjem ter
         * neobnovljena stanovanja brez oznake stanja. Pravi posli so redko
         * več kot 40 % pod trgom; tam jih mora podpreti še kaj drugega.
         */
        const prevec = odstopanjePct > 45 ? (odstopanjePct - 45) * 1.5 : 0;
        let d = Math.max(0, Math.min(30, odstopanjePct * 0.75) - prevec) * prim.utez;
        if (odstopanjePct > 45)
          opozorilo = `Cena je ${odstopanjePct} % pod primerljivimi — tako velika razlika je pogosteje napaka (lokacija, površina, stanje) kot posel. Preveri pred klicem.`;
        let pripis = "";
        if (stanje === "za_obnovo" && !prim.isteStanje) {
          // Za obnovo je PRIČAKOVANO cenejši od mešanih primerljivih.
          d = 0;
          pripis = " — a oglas je za obnovo, primerljivi pa ne, zato to ni popust";
        } else if (stanje === null && !prim.isteStanje) {
          d *= 0.6;
          pripis = " — stanje ni znano, med primerljivimi so tudi obnovljeni";
        }
        d = Math.round(d);
        tocke += d;
        razlogi.push(`${odstopanjePct} % pod ${prim.opis}${pripis}${d > 0 ? ` +${d}` : ""}`);
      }
    }
    if (drazba) {
      stevci.drazb++;
      razlogi.push("dražba ali zbiranje ponudb — cena je izklicna, končna je lahko višja");
    }

    const najem = delez ? null : oceniNajemnino(o, povrsina);
    let brutoDonosPct: number | null = null;
    if (najem) {
      brutoDonosPct = Math.round(((najem.mesecno * 12) / cena) * 1000) / 10;
      const d = brutoDonosPct >= 10 ? 20 : brutoDonosPct > 4 ? Math.round(((brutoDonosPct - 4) / 6) * 20) : 0;
      if (d > 0) {
        tocke += d;
        razlogi.push(`ocena bruto donosa ${brutoDonosPct} % — ${najem.opis}, n=${najem.vzorec} +${d}`);
      }
    }

    // Oglas stanovanja je ena enota; "2 enoti" pri njem je skoraj vedno
    // dvojna objava hiše kot stanovanja, ne dvostanovanjski objekt.
    const najmanjEnot = o.tip === "stanovanje" ? 3 : 2;
    if (o.st_enot !== null && o.st_enot >= najmanjEnot) {
      tocke += 15;
      razlogi.push(`${o.st_enot} enot potrjeno +15`);
    } else if (o.st_enot_ocena !== null && o.st_enot_ocena >= najmanjEnot) {
      tocke += 10;
      razlogi.push(`~${o.st_enot_ocena} enot (ocena iz opisa) +10`);
    } else if (o.tip === "hisa" && povrsina !== null && povrsina >= 300) {
      tocke += 5;
      razlogi.push(`velika hiša ${povrsina} m² +5`);
    }

    let padecPct: number | null = null;
    if (o.cena_prvotna_eur !== null && Number(o.cena_prvotna_eur) > cena) {
      padecPct = Math.round(((Number(o.cena_prvotna_eur) - cena) / Number(o.cena_prvotna_eur)) * 1000) / 10;
      if (padecPct >= 3) {
        const d = Math.min(10, Math.round(padecPct));
        tocke += d;
        razlogi.push(`cena znižana ${padecPct} % +${d}`);
      }
    }

    const { t: prvic, ponovno } = prvicNaTrgu(o.id);
    const dniNaTrgu = Math.max(0, Math.floor((zdaj - prvic) / 86_400_000));
    const ponovnoBesedilo = ponovno ? " (vključno s prejšnjimi objavami)" : "";
    if (dniNaTrgu >= 180) {
      tocke += 8;
      razlogi.push(`${dniNaTrgu} dni na trgu${ponovnoBesedilo} — prodajalec je verjetno pripravljen popustiti +8`);
    } else if (dniNaTrgu >= 90) {
      tocke += 5;
      razlogi.push(`${dniNaTrgu} dni na trgu${ponovnoBesedilo} +5`);
    }
    if (o.za_obnovo || o.za_investicijo) {
      tocke += 5;
      razlogi.push("označeno za obnovo/investicijo +5");
    }
    if (o.data_quality !== null && o.data_quality >= 75) {
      tocke += 5;
      razlogi.push("popolni podatki +5");
    }

    if (tocke < 40) continue;
    posli.push({
      id: o.id, url: o.url, naslov: o.naslov, kraj: o.kraj, regija: o.regija, tip: o.tip,
      cena, cenaM2, povrsina, zemljisce: o.zemljisce_m2 === null ? null : Number(o.zemljisce_m2),
      stEnot: o.st_enot, stEnotOcena: o.st_enot_ocena, leto: o.leto_izgradnje,
      dniNaTrgu, padecPct,
      medianaM2: prim ? Math.round(prim.m2) : null, medianaVzorec: prim?.vzorec ?? 0, odstopanjePct,
      primerjava: prim?.opis ?? null,
      opozorilo,
      stanje,
      drzava: o.drzava,
      brutoDonosPct,
      najemMesecno: najem ? Math.round(najem.mesecno) : null,
      najemOpis: najem?.opis ?? null,
      najemVzorec: najem?.vzorec ?? 0,
      agencija: o.agencija, telefon: o.telefon, vir: o.vir,
      nepremicninaId: o.nepremicnina_id,
      tocke: Math.min(100, tocke), razlogi,
    });
  }
  log(
    `posli čas: branje ${Math.round((tBranje - tZacetek) / 1000)} s, besedila in ponovne objave ${Math.round((tIzracun - tBranje) / 1000)} s, izračun ${Math.round((Date.now() - tIzracun) / 1000)} s`
  );
  log(
    `posli primerjave: ${stevci.bliznji} z bližnjimi, ${stevci.regionalni} z regijo, ${stevci.brez} brez; ` +
      `${stevci.sumljivih} sumljivo nizkih, ${stevci.delezev} deležev, ${stevci.drazb} dražb`
  );

  posli.sort((a, b) => b.tocke - a.tocke || a.cena - b.cena);

  /**
   * ENA NEPREMIČNINA — EN POSEL.
   *
   * Vir isti objekt pogosto objavi večkrat: "Koroška Bela, Potoška pot" je bila
   * 17. 9. 2026 v bazi enkrat kot hiša in enkrat kot stanovanje, z isto ceno,
   * isto površino in istim naslovom oglasa. Takih skupin je bilo 6.025, v njih
   * 10.624 odvečnih oglasov — trinajst odstotkov baze. V feedu to pomeni, da
   * ista hiša zasede tri od dvajsetih mest in potisne ven tri druge priložnosti.
   *
   * Ključ je kanonična nepremičnina, kadar jo združevalnik pozna; sicer
   * vsebina (vir, cena, površina, kraj), ker je prav ta kombinacija tisto, kar
   * človek na zaslonu prepozna kot "isto hišo". Ker je seznam že urejen po
   * točkah, prvi zadetek v skupini je najboljši — in ta ostane.
   */
  const videni = new Set<string>();
  const brezPodvojenih = posli.filter((p) => {
    /**
     * OBA KLJUČA, ne eden ali drugi.
     *
     * Kanoničnemu `nepremicnina_id` ni mogoče zaupati samega: "Koroška Bela,
     * Potoška pot" je imela kot hiša in kot stanovanje RAZLIČEN kanonični id,
     * ker ju združevalnik ni povezal (ločil ju je prav tip). Če bi se ustavili
     * pri njem, bi ista hiša ostala v feedu dvakrat — po popravku listanja jih
     * je bilo takih še enajst skupin.
     *
     * Vsebinski ključ ujame prav te; kanonični pa tiste, kjer se cena ali
     * zapis kraja med objavama malce razlikujeta. Posel odpade, če ga ujame
     * KATERI KOLI od obeh.
     */
    const kljuci = [
      `v|${p.vir}|${p.cena}|${p.povrsina ?? "?"}|${(p.kraj ?? "").toLowerCase().trim()}`,
      // Isti objekt na dveh portalih ali z drugače zapisanim krajem ("Kočevje"
      // in "Kočevje, Ob Mahovniški cesti 5"): ista cena in površina do decimalke.
      ...(p.povrsina !== null ? [`c|${p.drzava}|${p.tip}|${p.cena}|${p.povrsina}`] : []),
      ...(p.nepremicninaId ? [`k|${p.nepremicninaId}`] : []),
    ];
    if (kljuci.some((k) => videni.has(k))) return false;
    for (const k of kljuci) videni.add(k);
    return true;
  });
  const odstranjenih = posli.length - brezPodvojenih.length;
  if (odstranjenih > 0) log(`posli: ${odstranjenih} podvojenih objav istega objekta izpuščenih`);

  const najboljsi = brezPodvojenih.slice(0, 200);

  const { error } = await db.from("nep_statistika").upsert({
    kljuc: "posli",
    podatki: { posli: najboljsi, pregledanih: prodajni.length },
    izracunano: new Date().toISOString(),
  });
  if (error) log(`posli zapis: ${error.message}`);
  else log(`posli: ${najboljsi.length} od ${prodajni.length} pregledanih`);
  return najboljsi.length;
}
