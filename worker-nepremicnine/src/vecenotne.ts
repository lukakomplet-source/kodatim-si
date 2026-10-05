import type { Db } from "./db.js";
import { preberiVse } from "./nepremicnine.js";
import { povrsinaZaIzracun } from "../../src/lib/nepremicnine/verjetnost.js";
import { computeOfferPrice, capRateAtPrice } from "../../src/lib/nepremicnine/ponudbenaCena.js";
import { preberiBesedilneZnake, razredStanja, type BesedilniZnaki, type Stanje } from "./posli.js";

/**
 * VEČENOTNE BLIZU MESTA — hiše, ki se dajo razdeliti v stanovanja za oddajo,
 * z NOI in cap rate po isti formuli kot kalkulator (ponudbenaCena.ts).
 *
 * Nastalo 5. 10. 2026 iz uporabnikovega iskanja "multi unit blizu mesta,
 * NOI/cena okoli 8 %". Dve stvari, ki iz kode nista razvidni:
 *
 *  - Že razdeljenih večenotnih hiš pri 8 % na trgu NI. Blizu mest jih je bilo
 *    šest (obala, Bled), vse s cap 2–5 %. Osem odstotkov nastane samo s
 *    predelavo, zato so enote praviloma OCENA IZ POVRŠINE in tako označene.
 *  - Cap na ceno sam zavaja, ker enot še ni. Zraven je vedno donos na celotno
 *    naložbo (cena + stroški nakupa + predelava); tej številki se da verjeti.
 *
 * Najemnine so mediane NAŠIH najemnih oglasov stanovanj podobne velikosti v
 * 3–6 km. Kjer jih v 6 km ni dovolj, hiša ni na seznamu: brez najemnega trga v
 * bližini je vsaka številka ugibanje.
 */

/** Privzetki kalkulatorja (/nepremicnine/kalkulator), da se številki ujemata. */
export const PREDPOSTAVKE = {
  prazninePct: 5,
  vzdrzevanjePct: 8,
  rezervaCapexPct: 5,
  upravljanjePct: 0, // sam upravljaš; z upravnikom +8–10 %
  zavarovanjeLeto: 400,
  nuszM2: 1.0, // €/m² na leto izven Ljubljane (namig kalkulatorja 0,7–1,3)
  nuszM2Lj: 1.5,
  stroskiNakupaPct: 3,
  m2NaEnoto: 45, // neto velikost nove enote za oddajo
  izkoristek: 0.85, // delež površine, ki ostane za enote (stopnišča, hodniki)
  novaEnota: 30_000, // kuhinja, kopalnica, predelne stene, ločeni števci, projekt
  osvezitevEnote: { novo: 3_000, obnovljeno: 3_000, neznano: 12_000 },
  prenovaM2: { novo: 0, obnovljeno: 0, neznano: 250, za_obnovo: 600 },
  rezervaPrenovePct: 10,
  mestoPrebivalcev: 8_000,
  mestoKm: 10,
  najemKm: [3, 6],
  najmanjNajemnih: 6,
  najvecM2: 700,
};

export type VirEnot = "potrjeno" | "ocena iz opisa" | "iz površine";

/** Pogodba s stranjo /nepremicnine/vecenotne — polja so zrcaljena tam. */
export type Vecenotna = {
  id: string;
  url: string;
  vir: string;
  naslov: string | null;
  kraj: string | null;
  regija: string | null;
  mesto: string;
  mestoKm: number;
  cena: number;
  povrsina: number;
  zemljisce: number | null;
  leto: number | null;
  adaptacija: number | null;
  stanje: Stanje | null;
  enote: number;
  enoteVir: VirEnot;
  enotaM2: number;
  najemEnota: number;
  najemNaM2: number;
  najemN: number;
  najemKm: number;
  bruto: number;
  dejanski: number;
  stroski: number;
  noi: number;
  capCena: number;
  /** Predelava BREZ rezerve — tako jo pričakuje kalkulator, ki rezervo doda sam. */
  prenovaOsnova: number;
  prenova: number;
  nalozba: number;
  donosVse: number;
  /** Cena, pri kateri bi bil cap na ceno točno 8 %. */
  cenaZa8: number;
  drazba: boolean;
  dniNaTrgu: number;
  padecPct: number | null;
  agencija: string | null;
  tudiNa: string[];
  nepremicninaId: string | null;
};

type Ogl = {
  id: string; vir: string; url: string; naslov: string | null; tip: string | null;
  regija: string | null; kraj: string | null; lat: number | null; lng: number | null;
  cena_eur: number | null; povrsina_m2: number | null; zemljisce_m2: number | null;
  st_enot: number | null; st_enot_ocena: number | null; vec_enot: boolean;
  leto_izgradnje: number | null; leto_adaptacije: number | null; za_obnovo: boolean;
  first_seen: string; nepremicnina_id: string | null; agencija: string | null;
  cena_prvotna_eur: number | null;
};

const POLJA =
  "id, vir, url, naslov, tip, regija, kraj, lat, lng, cena_eur, povrsina_m2, zemljisce_m2, st_enot, st_enot_ocena, vec_enot, leto_izgradnje, leto_adaptacije, za_obnovo, first_seen, nepremicnina_id, agencija, cena_prvotna_eur";

function mediana(v: number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = Math.PI / 180;
  const x = (bLng - aLng) * r * Math.cos(((aLat + bLat) / 2) * r);
  const y = (bLat - aLat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

/** GeoNames pri nekaterih vaseh vpiše prebivalce CELE občine (Šentilj: 8.452). */
const NI_MESTO = new Set(["Šentilj v Slov. Goricah"]);
const SAMO_REGIJA =
  /^(podravska|savinjska|gorenjska|dolenjska|notranjska|gori[šs]ka|obalno|koro[šs]ka|pomurska|posavska|zasavska|osrednjeslovenska|primorska|[šs]tajerska|prekmurje|jugovzhodna|spodnjeposavska)/i;

export async function izracunajVecenotne(
  db: Db,
  log: (msg: string) => void,
  znaki?: BesedilniZnaki
): Promise<number> {
  const P = PREDPOSTAVKE;
  const zdaj = Date.now();
  const dniNazaj = (d: number) => new Date(zdaj - d * 86_400_000).toISOString();
  const z = znaki ?? (await preberiBesedilneZnake(db));

  const prodajni = await preberiVse<Ogl>(db, "nep_oglasi", POLJA, (q) =>
    q.eq("status", "aktiven").eq("posel", "prodaja").eq("drzava", "SI").gte("last_seen", dniNazaj(14)).gte("cena_eur", 50_000)
  );
  // Najemni vzorci: tudi oglasi, ki so izginili v zadnjih 150 dneh — najem se
  // odda hitro in samo aktivni bi dali premajhen vzorec.
  const najemni = await preberiVse<{ kraj: string | null; lat: number | null; lng: number | null; cena_eur: number; povrsina_m2: number | null }>(
    db, "nep_oglasi", "kraj, lat, lng, cena_eur, povrsina_m2",
    (q) => q.eq("posel", "oddaja").eq("tip", "stanovanje").eq("drzava", "SI").gte("last_seen", dniNazaj(150)).gt("cena_eur", 150).lt("cena_eur", 4000)
  );
  const mesta = (
    await preberiVse<{ ime: string; lat: number; lng: number; prebivalcev: number }>(
      db, "nep_kraji", "ime, lat, lng, prebivalcev", (q) => q.eq("drzava", "SI").gte("prebivalcev", P.mestoPrebivalcev)
    )
  ).filter((m) => !NI_MESTO.has(m.ime));
  const vsiKraji = await preberiVse<{ ime: string; lat: number; lng: number }>(
    db, "nep_kraji", "ime, lat, lng", (q) => q.eq("drzava", "SI")
  );
  const krajPoImenu = new Map<string, { lat: number; lng: number }[]>();
  for (const k of vsiKraji) {
    const kljuc = k.ime.toLowerCase();
    const arr = krajPoImenu.get(kljuc) ?? [];
    arr.push({ lat: k.lat, lng: k.lng });
    krajPoImenu.set(kljuc, arr);
  }

  // Najemni vzorci z lokacijo in verjetnim €/m²; isti oglas na dveh portalih šteje enkrat.
  const najemVzorci: { lat: number; lng: number; m2: number; naM2: number }[] = [];
  const najemVideni = new Set<string>();
  for (const n of najemni) {
    if (n.lat === null || n.lng === null || n.povrsina_m2 === null) continue;
    const m2 = Number(n.povrsina_m2);
    const cena = Number(n.cena_eur);
    if (m2 < 15 || m2 > 200) continue;
    const naM2 = cena / m2;
    if (naM2 < 5 || naM2 > 35) continue;
    const kljuc = `${cena}|${m2}|${(n.kraj ?? "").toLowerCase()}`;
    if (najemVideni.has(kljuc)) continue;
    najemVideni.add(kljuc);
    najemVzorci.push({ lat: n.lat, lng: n.lng, m2, naM2 });
  }
  const najemZa = (lat: number, lng: number, enotaM2: number) => {
    const lo = enotaM2 * 0.65;
    const hi = enotaM2 * 1.5;
    for (const r of P.najemKm) {
      const vz = najemVzorci.filter((n) => n.m2 >= lo && n.m2 <= hi && km(lat, lng, n.lat, n.lng) <= r);
      if (vz.length >= P.najmanjNajemnih) return { naM2: mediana(vz.map((v) => v.naM2))!, n: vz.length, r };
    }
    return null;
  };

  /**
   * Središče vsake regije (mediana lat/lng oglasov z regijo). Oglas, ki ga je
   * geokoder postavil > 60 km od središča svoje regije, je soimenjak:
   * "Hrastje, 10 min do centra MB" je pristal pri Kranju in dobil kranjske najemnine.
   */
  const regTocke = new Map<string, { lat: number[]; lng: number[] }>();
  for (const o of prodajni) {
    if (!o.regija || o.lat === null || o.lng === null) continue;
    const t = regTocke.get(o.regija) ?? { lat: [], lng: [] };
    t.lat.push(o.lat);
    t.lng.push(o.lng);
    regTocke.set(o.regija, t);
  }
  const regSredisce = new Map<string, { lat: number; lng: number }>();
  for (const [k, t] of regTocke) if (t.lat.length >= 30) regSredisce.set(k, { lat: mediana(t.lat)!, lng: mediana(t.lng)! });

  const izlocenih: Record<string, number> = {};
  const izloci = (razlog: string) => (izlocenih[razlog] = (izlocenih[razlog] ?? 0) + 1);
  const izidi: Vecenotna[] = [];

  for (const o of prodajni) {
    if (!(o.tip === "hisa" || (o.vec_enot && o.tip !== "posest" && o.tip !== "garaza"))) continue;
    if (z.delez.has(o.id)) { izloci("delež"); continue; }
    const cena = Number(o.cena_eur);
    if (!(cena >= 60_000 && cena <= 2_500_000)) { izloci("cena izven 60k–2,5M"); continue; }
    const povrsina = povrsinaZaIzracun(o.tip, o.povrsina_m2);
    if (povrsina === null || povrsina < 120) { izloci("površina pod 120 m² ali neveljavna"); continue; }
    if (cena / povrsina < 200) { izloci("pod 200 €/m²"); continue; }
    if (o.lat === null || o.lng === null) { izloci("brez lokacije"); continue; }
    // Nad 700 m² je v oglasu pogosto zemljišče ("hiša ob morju z zemljiščem 1.412 m²").
    if (povrsina > P.najvecM2) { izloci("nad 700 m²"); continue; }
    if (/hrva[šs]k|istarsk|croatia|istria/i.test(`${o.naslov ?? ""} ${o.kraj ?? ""}`)) { izloci("Hrvaška v naslovu"); continue; }
    const krajPrvi = (o.kraj ?? "").split(",")[0].trim();
    if (!krajPrvi || SAMO_REGIJA.test(krajPrvi)) { izloci("lokacija je samo regija"); continue; }
    // Rezervna točka: oglas sedi točno na središču mesta, kraj pa ni to mesto
    // ("Javor, Lj. Dobrunje" je dobil središče Ljubljane in ljubljanske najemnine).
    const naSredini = mesta.find((m) => km(o.lat!, o.lng!, m.lat, m.lng) < 0.3);
    if (naSredini && !(o.kraj ?? "").toLowerCase().includes(naSredini.ime.toLowerCase().split(" ")[0].slice(0, 6))) {
      izloci("rezervna točka na središču mesta");
      continue;
    }
    // Soimenjak: naslov omenja večbesedni kraj, ki je > 25 km stran ("Hiša Ljubno ob Savinji" pri Kranju).
    const besede = (o.naslov ?? "").split(/[^A-Za-zČŠŽčšžĆćĐđ.]+/).filter(Boolean);
    let soimenjak = false;
    for (let n = 4; n >= 2 && !soimenjak; n--) {
      for (let i = 0; i + n <= besede.length; i++) {
        const zad = krajPoImenu.get(besede.slice(i, i + n).join(" ").toLowerCase());
        if (zad && Math.min(...zad.map((t) => km(o.lat!, o.lng!, t.lat, t.lng))) > 25) {
          soimenjak = true;
          break;
        }
      }
    }
    if (soimenjak) { izloci("soimenjak v naslovu"); continue; }
    const rs = o.regija ? regSredisce.get(o.regija) : undefined;
    if (rs && km(o.lat, o.lng, rs.lat, rs.lng) > 60) { izloci("daleč od svoje regije (soimenjak)"); continue; }

    let mesto: { ime: string } | null = null;
    let mestoKm = Infinity;
    for (const m of mesta) {
      const d = km(o.lat, o.lng, m.lat, m.lng);
      if (d < mestoKm) { mestoKm = d; mesto = m; }
    }
    if (!mesto || mestoKm > P.mestoKm) { izloci(`dlje kot ${P.mestoKm} km od mesta`); continue; }

    const stanje = razredStanja(o, z);
    let enote: number;
    let enoteVir: VirEnot;
    if (o.st_enot !== null && o.st_enot >= 3) {
      enote = o.st_enot;
      enoteVir = "potrjeno";
    } else if (o.st_enot_ocena !== null && o.st_enot_ocena >= 3 && (povrsina * P.izkoristek) / o.st_enot_ocena >= 28) {
      enote = o.st_enot_ocena;
      enoteVir = "ocena iz opisa";
    } else {
      enote = Math.floor((povrsina * P.izkoristek) / P.m2NaEnoto);
      enoteVir = "iz površine";
    }
    enote = Math.min(enote, 12);
    if (enote < 3) { izloci("manj kot 3 enote"); continue; }
    const enotaM2 = (povrsina * P.izkoristek) / enote;
    if (enotaM2 < 25 || enotaM2 > 80) { izloci("enota izven 25–80 m²"); continue; }

    const nj = najemZa(o.lat, o.lng, enotaM2);
    if (!nj) { izloci("ni najemnega trga do 6 km"); continue; }
    const najemEnota = Math.round(nj.naM2 * enotaM2);

    const lj = /ljubljan/i.test(mesto.ime) && mestoKm < 8;
    const nusz = Math.round(povrsina * (lj ? P.nuszM2Lj : P.nuszM2));
    const pon = computeOfferPrice({
      units: enote,
      monthlyRentPerUnit: najemEnota,
      otherIncomePct: 0,
      occupancyPct: 100 - P.prazninePct,
      expensesPct: P.upravljanjePct + P.vzdrzevanjePct + P.rezervaCapexPct,
      expensesFixed: P.zavarovanjeLeto + nusz,
      capRatePct: 8,
    });
    const capCena = capRateAtPrice(pon.noi, cena) ?? 0;

    const st = stanje ?? "neznano";
    let prenovaOsnova: number;
    if (enoteVir === "potrjeno") {
      prenovaOsnova = st === "za_obnovo" ? P.prenovaM2.za_obnovo * povrsina : enote * P.osvezitevEnote[st];
    } else {
      prenovaOsnova = (enote - 1) * P.novaEnota + P.prenovaM2[st] * povrsina;
    }
    prenovaOsnova = Math.round(prenovaOsnova);
    const prenova = Math.round(prenovaOsnova * (1 + P.rezervaPrenovePct / 100));
    const nalozba = Math.round(cena * (1 + P.stroskiNakupaPct / 100) + prenova);

    izidi.push({
      id: o.id, url: o.url, vir: o.vir, naslov: o.naslov, kraj: o.kraj, regija: o.regija,
      mesto: mesto.ime, mestoKm: Math.round(mestoKm * 10) / 10,
      cena, povrsina, zemljisce: o.zemljisce_m2 === null ? null : Number(o.zemljisce_m2),
      leto: o.leto_izgradnje, adaptacija: o.leto_adaptacije, stanje,
      enote, enoteVir, enotaM2: Math.round(enotaM2),
      najemEnota, najemNaM2: Math.round(nj.naM2 * 100) / 100, najemN: nj.n, najemKm: nj.r,
      bruto: pon.grossRent, dejanski: pon.actualIncome, stroski: pon.expenses, noi: pon.noi,
      capCena, prenovaOsnova, prenova, nalozba,
      donosVse: Math.round((pon.noi / nalozba) * 1000) / 10,
      cenaZa8: Math.round(pon.offerPrice),
      drazba: z.drazba.has(o.id),
      dniNaTrgu: Math.floor((zdaj - new Date(o.first_seen).getTime()) / 86_400_000),
      padecPct:
        o.cena_prvotna_eur && Number(o.cena_prvotna_eur) > cena
          ? Math.round((1 - cena / Number(o.cena_prvotna_eur)) * 1000) / 10
          : null,
      agencija: o.agencija,
      tudiNa: [],
      nepremicninaId: o.nepremicnina_id,
    });
  }

  /**
   * Ena hiša = ena kartica. Isti objekt: ista kanonična nepremičnina ali ista
   * cena in površina, ALI do 1,5 km narazen s površino ±3 % in ceno ±25 %
   * (Lipovci: 149.900 na enem portalu, 164.800 na drugem). "Hiša, Vrstna X" in
   * "Hiša, Samostojna X" v isti vasi sta dve hiši — razen ob točnem ujemanju
   * cene in površine (Celje: isti oglas dvakrat, enkrat kot "več stanovanj").
   */
  izidi.sort((a, b) => b.donosVse - a.donosVse);
  const vrstaHise = (n: string | null) => n?.match(/^Hiša,\s*([^\s,]+)/)?.[1]?.toLowerCase() ?? null;
  const lege = new Map(prodajni.map((o) => [o.id, o]));
  const unikatni: Vecenotna[] = [];
  for (const r of izidi) {
    const a = lege.get(r.id)!;
    const dvojnik = unikatni.find((u) => {
      if (r.nepremicninaId && u.nepremicninaId === r.nepremicninaId) return true;
      if (u.cena === r.cena && u.povrsina === r.povrsina) return true;
      const b = lege.get(u.id)!;
      const blizu =
        km(a.lat!, a.lng!, b.lat!, b.lng!) < 1.5 &&
        Math.abs(r.povrsina / u.povrsina - 1) <= 0.03 &&
        Math.abs(r.cena / u.cena - 1) <= 0.25;
      if (!blizu) return false;
      const va = vrstaHise(r.naslov);
      const vb = vrstaHise(u.naslov);
      return !(va && vb && va !== vb);
    });
    if (dvojnik) {
      dvojnik.tudiNa.push(`${r.vir} · ${r.cena.toLocaleString("sl-SI")} €`);
      continue;
    }
    unikatni.push(r);
  }

  const nad8 = unikatni.filter((r) => r.capCena >= 8);
  const { error } = await db.from("nep_statistika").upsert({
    kljuc: "vecenotne",
    podatki: { predpostavke: P, izidi: unikatni, izlocenih, pregledanih: prodajni.length },
    izracunano: new Date().toISOString(),
  });
  if (error) log(`večenotne zapis: ${error.message}`);
  else
    log(
      `večenotne: ${unikatni.length} hiš blizu mesta za 3+ enote, ${nad8.length} s cap na ceno >= 8 %, ` +
        `${nad8.filter((r) => r.donosVse >= 8).length} tudi s predelavo >= 8 %`
    );
  return unikatni.length;
}
