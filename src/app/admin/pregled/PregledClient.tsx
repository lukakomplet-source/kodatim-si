"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AKTIVNOSTI,
  IME_KORAKA,
  MESECI,
  OBDOBJA,
  PRODUKTI,
  REZULTATI,
  imeKartice,
  jeDatum,
  koledarDan,
  konecObdobja,
  lepDatum,
  nedostavljeni,
  obdobjeSCeloPrimerjavo,
  opisRazpona,
  oznaciNaknadne,
  predPrvimZapisom,
  prviDan,
  prviKontakt,
  razdeliOdzive,
  seznamKarticePregleda,
  seznamZa,
  tabelaAktivnostiPodjetja,
  vRazponu,
  zaProdukt,
  type Kartica,
  type Korak,
  type ObdobjeKljuc,
  type PregledPodatki,
  type Produkt,
} from "@/lib/pregled-racun";
import {
  NI_ZAPISANO,
  akcijskiCenter,
  lijakRezultatov,
  mere,
  moznostiFiltrov,
  opisMer,
  posliZaPredal,
  povzetekPoslov,
  seznamCelice,
  seznamFaze,
  seznamNedostavljenih,
  ugotovitve,
  zaFiltre,
  type AkcijaKljuc,
  type FazaKljuc,
  type NalogAplikacije,
  type StolpecTabele,
} from "@/lib/pregled-vodstvo";
import {
  FAZE_PRODAJE,
  IME_FAZE_PRODAJE,
  IME_VERIGE,
  PRODUKT_NALOGA,
  akcijeProdaje,
  casovnaVrsta,
  dosezenoCiljev,
  izgubljeni,
  kampanjeAnaliza,
  kanban,
  mereMarketinga,
  napoved,
  priloznostiObdobja,
  priloznostiZaPredal,
  prihodkiPoMesecih,
  produktiAnaliza,
  realiziranoVRazponu,
  stavekVodstva,
  stopnjeProdaje,
  strankeAplikacije,
  toplotnaKarta,
  ugotovitveProdaje,
  verigaProdaje,
  vrsticeVerige,
  zaFiltrePriloznosti,
  type AkcijaProdajeKljuc,
  type FazaProdaje,
  type KorakVerige,
} from "@/lib/pregled-prodaja";
import { Cilji } from "./Cilji";
import { Glava } from "./Glava";
import { enota } from "./Kartice";
import { KakoStejemo } from "./KakoStejemo";
import { Koledar } from "./Koledar";
import { Leadi } from "./Leadi";
import { Marketing } from "./Marketing";
import { Plosca } from "./Plosca";
import { Povzetek } from "./Povzetek";
import { Predal, type PredalProps } from "./Predal";
import { Prihodki } from "./Prihodki";
import { ProdajniLijak } from "./ProdajniLijak";
import { TabelaAktivnosti } from "./TabelaAktivnosti";
import { Toplota } from "./Toplota";

/** Parametri iz naslova strani (page.tsx jih poda naprej). */
export type ZacetekPregleda = {
  produkt?: string;
  obdobje?: string;
  od?: string;
  do?: string;
  seznam?: string;
  dan?: string;
  primerjaj?: string;
  kampanja?: string;
  oseba?: string;
};

type Izbor = Kartica["kljuc"];
type KljucAkcije = AkcijaKljuc | AkcijaProdajeKljuc;
type ClenSeznama = Exclude<KorakVerige, "prihodki">;
const IZBORI = new Set<string>(["kontaktirana", "maili", ...AKTIVNOSTI, ...REZULTATI]);
const FAZE = new Set<string>(["kontaktirana", ...AKTIVNOSTI, ...REZULTATI]);
const AKCIJE = new Set<string>(["danes", "zamujeno", "caka", "leadi", "sestanki", "pozornost", "razvrstitev", "pozitivni", "kvalificirani", "ponudbe", "pogajanja", "zastale"]);
const CLENI = new Set<string>(["kontaktirana", "odzivi", "pozitivni", "leadi", "sestanki", "ponudbe", "posli"]);
const FAZE_PR = new Set<string>(FAZE_PRODAJE.map((f) => f.kljuc));

/**
 * Kaj je odprto v predalu. V naslovu strani: seznam=<kartica>, seznam=veriga-<člen>, seznam=faza-<faza prodaje>,
 * seznam=lijak-<faza>, seznam=aktivnost-<korak>, seznam=akcija-<skupina>, seznam=nedostavljeni ali dan=<YYYY-MM-DD>.
 */
export type OdprtSeznam =
  | { vrsta: "kartica"; kljuc: Izbor }
  | { vrsta: "veriga"; kljuc: ClenSeznama }
  | { vrsta: "faza"; kljuc: FazaProdaje }
  | { vrsta: "lijak"; kljuc: FazaKljuc }
  | { vrsta: "aktivnost"; kljuc: Korak }
  | { vrsta: "akcija"; kljuc: KljucAkcije }
  | { vrsta: "nedostavljeni" }
  | { vrsta: "celica"; aktivnost: Korak; stolpec: StolpecTabele }
  /** Posli z vrednostjo: »novi« v obdobju, »ponavljajoci« (MRR) ali mesec »YYYY-MM« iz grafa. */
  | { vrsta: "prihodki"; kljuc: string }
  | { vrsta: "dan"; dan: string };

const STOLPCI = new Set<string>(["podjetja", "odziv", "lead", "sestanek", "posel"]);
const IME_STOLPCA: Record<StolpecTabele, string> = {
  podjetja: "podjetja",
  odziv: "pripisani odzivi",
  lead: "pripisani leadi",
  sestanek: "pripisani sestanki",
  posel: "pripisani posli",
};

function izNaslova(z: ZacetekPregleda): OdprtSeznam | null {
  if (jeDatum(z.dan)) return { vrsta: "dan", dan: z.dan };
  const s = z.seznam;
  return s ? izCilja(s) : null;
}

/** »veriga-odzivi«, »faza-ponudba«, »lijak-odgovor«, »akcija-zamujeno«, »aktivnost-klic«, »nedostavljeni« → kaj odpreti. */
function izCilja(s: string): OdprtSeznam | null {
  if (s === "nedostavljeni") return { vrsta: "nedostavljeni" };
  if (s.startsWith("prihodki-")) {
    const k = s.slice(9);
    if (k === "novi" || k === "ponavljajoci" || /^\d{4}-\d{2}$/.test(k)) return { vrsta: "prihodki", kljuc: k };
  }
  if (s.startsWith("celica-")) {
    const [, a, st] = s.split("-");
    if (AKTIVNOSTI.includes(a as Korak) && STOLPCI.has(st)) return { vrsta: "celica", aktivnost: a as Korak, stolpec: st as StolpecTabele };
  }
  if (s.startsWith("veriga-") && CLENI.has(s.slice(7))) return { vrsta: "veriga", kljuc: s.slice(7) as ClenSeznama };
  if (s.startsWith("faza-") && FAZE_PR.has(s.slice(5))) return { vrsta: "faza", kljuc: s.slice(5) as FazaProdaje };
  if (s.startsWith("lijak-") && FAZE.has(s.slice(6))) return { vrsta: "lijak", kljuc: s.slice(6) as FazaKljuc };
  if (s.startsWith("akcija-") && AKCIJE.has(s.slice(7))) return { vrsta: "akcija", kljuc: s.slice(7) as KljucAkcije };
  if (s.startsWith("aktivnost-") && AKTIVNOSTI.includes(s.slice(10) as Korak)) {
    return { vrsta: "aktivnost", kljuc: s.slice(10) as Korak };
  }
  if (IZBORI.has(s)) return { vrsta: "kartica", kljuc: s as Izbor };
  return null;
}

function vNaslov(o: OdprtSeznam | null): string | null {
  if (!o || o.vrsta === "dan") return null;
  if (o.vrsta === "kartica") return o.kljuc;
  if (o.vrsta === "nedostavljeni") return "nedostavljeni";
  if (o.vrsta === "celica") return `celica-${o.aktivnost}-${o.stolpec}`;
  return `${o.vrsta}-${o.kljuc}`;
}

/** »26.–30. 10. 2026«, »28. 10. – 3. 11. 2026«, »5. 11. 2026«. */
function kratekRazpon(r: { od: string; do: string }): string {
  if (r.od === r.do) return lepDatum(r.od);
  const [y1, m1, d1] = r.od.split("-").map(Number);
  const [y2, m2, d2] = r.do.split("-").map(Number);
  if (y1 !== y2) return `${lepDatum(r.od)} – ${lepDatum(r.do)}`;
  if (m1 !== m2) return `${d1}. ${m1}. – ${d2}. ${m2}. ${y2}`;
  return `${d1}.–${d2}. ${m2}. ${y2}`;
}

const IME_FAZE: Record<FazaKljuc, string> = {
  kontaktirana: "Kontaktirana podjetja",
  ...IME_KORAKA,
  lead: "Kvalificirani leadi",
  sestanek: "Sestanki",
};

/**
 * Pregled v4 (Luka 7. 11. 2026): marketing in prodaja ločeno, ena pot od kontakta do denarja. Vrstni red:
 * 1 povzetek vodstva, 2 marketing, 3 leadi in naslednji koraki, 4 prodajni lijak (faze, kanban, izgubljeni, napoved),
 * 5 prihodki in cilji, 6 aktivnosti (tabela, toplotna karta, koledar). Vsaka številka odpre seznam v predalu; filtri
 * veljajo povsod (kar je »stanje danes«, piše ob razdelku).
 */
export function PregledClient({
  podatki,
  zacetek,
  aplikacija,
}: {
  podatki: PregledPodatki;
  zacetek: ZacetekPregleda;
  /** Opravljeni nalogi iz aplikacije Kompletko (samo branje); brez povezave nalogi = null in razlog (N/A). */
  aplikacija?: { nalogi: NalogAplikacije[] | null; napaka: string | null };
}) {
  const danes = podatki.zdaj.slice(0, 10);
  const [produkt, setProdukt] = useState<Produkt>(
    PRODUKTI.some((p) => p.kljuc === zacetek.produkt) ? (zacetek.produkt as Produkt) : "vsi",
  );
  const [obdobje, setObdobje] = useState<ObdobjeKljuc>(
    OBDOBJA.some((o) => o.kljuc === zacetek.obdobje) ? (zacetek.obdobje as ObdobjeKljuc) : "vse", // Luka 6. 11.: »vedno naj bo vse označeno«
  );
  const [od, setOd] = useState(jeDatum(zacetek.od) ? zacetek.od : danes);
  const [doo, setDo] = useState(jeDatum(zacetek.do) ? zacetek.do : danes);
  const [primerjaj, setPrimerjaj] = useState(zacetek.primerjaj !== "ne");
  const [kampanja, setKampanja] = useState<string | null>(zacetek.kampanja?.slice(0, 40) || null);
  const [oseba, setOseba] = useState<string | null>(zacetek.oseba?.slice(0, 40) || null);
  const [odprto, setOdprto] = useState<OdprtSeznam | null>(() => izNaslova(zacetek));

  // Izbira ostane v naslovu strani (osvežitev, povezava iz Danes), brez ponovnega branja Harveyja.
  useEffect(() => {
    const p = new URLSearchParams();
    if (produkt !== "vsi") p.set("produkt", produkt);
    p.set("obdobje", obdobje);
    if (obdobje === "poljubno") {
      p.set("od", od);
      p.set("do", doo);
    }
    if (!primerjaj) p.set("primerjaj", "ne");
    if (kampanja) p.set("kampanja", kampanja);
    if (oseba) p.set("oseba", oseba);
    const s = vNaslov(odprto);
    if (s) p.set("seznam", s);
    if (odprto?.vrsta === "dan") p.set("dan", odprto.dan);
    window.history.replaceState(null, "", `?${p.toString()}`);
  }, [produkt, obdobje, od, doo, primerjaj, kampanja, oseba, odprto]);

  // Harvey od 7. 11. (v4) vrača priložnosti, cilje in stroške; starejši ne, zato je stran takrat samo za branje.
  const zapisovanje = podatki.priloznosti !== undefined;

  // Primerjava samo, kadar je CELO prejšnje obdobje po prvem zabeleženem dogodku; prej ni podatkov, ne ničel.
  const prvi = useMemo(() => prviDan(podatki.dogodki), [podatki.dogodki]);
  const obd = useMemo(() => obdobjeSCeloPrimerjavo(obdobje, danes, { od, do: doo }, prvi), [obdobje, danes, od, doo, prvi]);
  const zdaj = obd.zdaj;
  const prej = primerjaj ? obd.prej : null;
  const konec = konecObdobja(zdaj, danes);
  const brezZapisov = predPrvimZapisom(zdaj, prvi);
  // Filtri: produkt, nato kampanja in oseba (vsi deli strani dobijo iste dogodke; možnosti upoštevajo druge filtre).
  const vsiDogodki = useMemo(() => oznaciNaknadne(podatki.dogodki), [podatki.dogodki]);
  const poProduktu = useMemo(() => zaProdukt(vsiDogodki, produkt), [vsiDogodki, produkt]);
  const moznosti = useMemo(() => moznostiFiltrov(poProduktu, podatki.podjetja, kampanja, oseba), [poProduktu, podatki.podjetja, kampanja, oseba]);
  const dogodki = useMemo(() => zaFiltre(poProduktu, podatki.podjetja, kampanja, oseba), [poProduktu, podatki.podjetja, kampanja, oseba]);
  // Primerjava produktov: vsi produkti, drugi filtri veljajo
  const vsiProdukti = useMemo(() => zaFiltre(vsiDogodki, podatki.podjetja, kampanja, oseba), [vsiDogodki, podatki.podjetja, kampanja, oseba]);
  const domeneOsebe = useMemo(() => (oseba ? new Set(dogodki.map((e) => e.domena)) : null), [oseba, dogodki]);

  // Posli, priložnosti in aplikacija z istimi filtri
  const posliIzbor = useMemo(
    () =>
      (podatki.posli ?? []).filter(
        (p) =>
          (produkt === "vsi" || p.produkt === produkt) &&
          (!kampanja || (p.kampanja || NI_ZAPISANO) === kampanja) &&
          (!domeneOsebe || domeneOsebe.has(p.domena)),
      ),
    [podatki.posli, produkt, kampanja, domeneOsebe],
  );
  const posliVsiProdukti = useMemo(
    () => (podatki.posli ?? []).filter((p) => (!kampanja || (p.kampanja || NI_ZAPISANO) === kampanja) && (!domeneOsebe || domeneOsebe.has(p.domena))),
    [podatki.posli, kampanja, domeneOsebe],
  );
  const prl = useMemo(() => zaFiltrePriloznosti(podatki.priloznosti, { produkt, kampanja, domene: domeneOsebe }), [podatki.priloznosti, produkt, kampanja, domeneOsebe]);
  const prlObdobja = useMemo(() => priloznostiObdobja(prl, zdaj), [prl, zdaj]);
  const nalogi = aplikacija?.nalogi ?? null;
  // Aplikacija ni pripisana kampanjam ali osebam: pri teh filtrih je ni; produkt jo omeji (escort = Escort, static = varovanje).
  const appVkljucena = !kampanja && !oseba;
  const aplikacijaVkljucena = useCallback(
    (vrsta: string) => appVkljucena && (produkt === "vsi" || PRODUKT_NALOGA[vrsta] === produkt),
    [appVkljucena, produkt],
  );
  const appVObdobju = useMemo(() => {
    if (!nalogi || !appVkljucena) return null;
    return nalogi.filter((n) => aplikacijaVkljucena(n.vrsta) && n.znesek !== null && vRazponu(`${n.datum} 00:00`, zdaj)).reduce((a, n) => a + (n.znesek as number), 0);
  }, [nalogi, appVkljucena, aplikacijaVkljucena, zdaj]);

  // 1. povzetek vodstva
  const veriga = useMemo(
    () => verigaProdaje({ dogodki, podjetja: podatki.podjetja, priloznosti: prl, posli: posliIzbor, r: zdaj, aplikacija: appVObdobju }),
    [dogodki, podatki.podjetja, prl, posliIzbor, zdaj, appVObdobju],
  );
  const stavek = stavekVodstva(veriga, brezZapisov, prvi);
  const lijak = useMemo(() => lijakRezultatov(dogodki, zdaj), [dogodki, zdaj]);
  const akcije = useMemo(() => akcijskiCenter(dogodki, podatki.podjetja, danes), [dogodki, podatki.podjetja, danes]);
  const akcijeP = useMemo(() => akcijeProdaje(dogodki, podatki.podjetja, prl, danes), [dogodki, podatki.podjetja, prl, danes]);
  const nedostavljenih = useMemo(() => nedostavljeni(dogodki, podatki.podjetja, zdaj), [dogodki, podatki.podjetja, zdaj]);
  const kampanje = useMemo(
    () => kampanjeAnaliza({ dogodki, podjetja: podatki.podjetja, posli: posliIzbor, stroski: podatki.stroski, r: zdaj }),
    [dogodki, podatki.podjetja, posliIzbor, podatki.stroski, zdaj],
  );
  // Cilji so za vse podjetje (brez filtrov): ta mesec, kvartal, leto
  const cilji = useMemo(
    () =>
      dosezenoCiljev({
        cilji: podatki.cilji,
        dogodki: vsiDogodki,
        podjetja: podatki.podjetja,
        priloznosti: podatki.priloznosti ?? [],
        prihodek: (a, b) => realiziranoVRazponu(podatki.posli ?? [], nalogi, a, b),
        danes,
      }),
    [podatki.cilji, vsiDogodki, podatki.podjetja, podatki.priloznosti, podatki.posli, nalogi, danes],
  );
  const kaj = useMemo(() => {
    const stare = ugotovitve({ lijak, akcije, nedostavljenih, podjetja: podatki.podjetja, brez: brezZapisov });
    const nove = ugotovitveProdaje({ veriga, kampanje, dogodki, akcije: akcijeP, cilji, brez: brezZapisov });
    return [...stare, ...nove].sort((a, b) => Number(b.ton === "pozor") - Number(a.ton === "pozor"));
  }, [lijak, akcije, nedostavljenih, podatki.podjetja, brezZapisov, veriga, kampanje, dogodki, akcijeP, cilji]);

  // 2. marketing
  const mereM = useMemo(
    () => mereMarketinga({ dogodki, podjetja: podatki.podjetja, r: zdaj, stroski: podatki.stroski, kampanja, nedostavljenih }),
    [dogodki, podatki.podjetja, zdaj, podatki.stroski, kampanja, nedostavljenih],
  );
  const cas = useMemo(() => casovnaVrsta(dogodki, zdaj, prej, prvi, danes, prviKontakt(dogodki)), [dogodki, zdaj, prej, prvi, danes]);
  const produkti = useMemo(
    () =>
      produktiAnaliza({
        dogodki: vsiProdukti,
        podjetja: podatki.podjetja,
        posli: posliVsiProdukti,
        seznami: podatki.seznami,
        nalogi: appVkljucena ? nalogi : null,
        r: zdaj,
      }),
    [vsiProdukti, podatki.podjetja, posliVsiProdukti, podatki.seznami, appVkljucena, nalogi, zdaj],
  );

  // 3. leadi; 4. prodajni lijak
  const stopnje = useMemo(() => stopnjeProdaje(prlObdobja, danes), [prlObdobja, danes]);
  const tabla = useMemo(() => kanban(prl, podatki.podjetja, dogodki, danes), [prl, podatki.podjetja, dogodki, danes]);
  const izg = useMemo(() => izgubljeni(prlObdobja), [prlObdobja]);
  const nap = useMemo(() => napoved(prl), [prl]);

  // 5. prihodki
  const povzetek = useMemo(
    () => povzetekPoslov(podatki.posli, { produkt, kampanja, domene: domeneOsebe }, zdaj, konec),
    [podatki.posli, produkt, kampanja, domeneOsebe, zdaj, konec],
  );
  const brezFiltrov = produkt === "vsi" && !kampanja && !oseba;
  const meseci = useMemo(
    () => prihodkiPoMesecih({ posli: posliIzbor, nalogi, aplikacijaVkljucena, cilji: brezFiltrov ? podatki.cilji : undefined, danes }),
    [posliIzbor, nalogi, aplikacijaVkljucena, brezFiltrov, podatki.cilji, danes],
  );
  const stranke = useMemo(() => strankeAplikacije(nalogi, aplikacija?.napaka ?? null, zdaj, konec), [nalogi, aplikacija, zdaj, konec]);

  // 6. aktivnosti
  const tabela = useMemo(
    () => tabelaAktivnostiPodjetja(dogodki, zdaj, podatki.brezVidea, brezZapisov),
    [dogodki, zdaj, podatki.brezVidea, brezZapisov],
  );
  const m = useMemo(() => mere(dogodki, podatki.podjetja, zdaj), [dogodki, podatki.podjetja, zdaj]);
  const toplota = useMemo(() => toplotnaKarta(dogodki, danes, prvi), [dogodki, danes, prvi]);
  const brezCasa = useMemo(() => dogodki.filter((e) => !e.cas).length, [dogodki]);

  const opisObdobja = zdaj ? opisRazpona(zdaj) : prvi ? `vse od ${lepDatum(prvi)}` : "vse";

  const predal = useMemo((): Omit<PredalProps, "podjetja" | "onZapri" | "danes"> | null => {
    if (!odprto) return null;
    if (odprto.vrsta === "dan") {
      return {
        naslov: `Vse aktivnosti ${lepDatum(odprto.dan)}`,
        podnaslov: "Po vrsti aktivnosti, najnovejše najprej.",
        skupine: koledarDan(dogodki, odprto.dan).map((g) => ({ kljuc: g.korak, naslov: IME_KORAKA[g.korak], dogodki: g.dogodki })),
        prazno: "Ta dan ni nič.",
      };
    }
    if (odprto.vrsta === "veriga") {
      const k = odprto.kljuc;
      return {
        naslov: `Od kontakta do denarja: ${IME_VERIGE[k]}`,
        podnaslov:
          k === "kontaktirana"
            ? `Podjetja, prvič kontaktirana (${opisObdobja}).`
            : `Podjetja, prvič kontaktirana (${opisObdobja}), ki so do danes prišla do te faze ali dlje.`,
        skupine: [{ kljuc: "vse", dogodki: vrsticeVerige(k, veriga.domene[k], dogodki, prl, danes) }],
        prazno: k === "pozitivni" && veriga.nerazvrsceni ? "Odzivi še niso razvrščeni: razvrstiš jih v razdelku Leadi." : "Do te faze še ni prišlo nobeno podjetje.",
      };
    }
    if (odprto.vrsta === "faza") {
      const v = prlObdobja.filter((o) => o.faza === odprto.kljuc);
      return {
        naslov: `Faza: ${IME_FAZE_PRODAJE[odprto.kljuc]}`,
        podnaslov: `Priložnosti, odprte v obdobju (${opisObdobja}), ki so zdaj v tej fazi.`,
        skupine: [{ kljuc: "vse", dogodki: priloznostiZaPredal(v, danes) }],
        prazno: "V tej fazi ni priložnosti.",
      };
    }
    if (odprto.vrsta === "akcija") {
      const a = [...akcije, ...akcijeP].find((x) => x.kljuc === odprto.kljuc)!;
      return {
        naslov: a.ime,
        podnaslov: `${a.opis} Stanje danes, ne glede na obdobje.`,
        skupine: [{ kljuc: "vse", dogodki: a.vrstice }],
        prazno: a.prazno,
      };
    }
    if (odprto.vrsta === "celica") {
      const { aktivnost: a, stolpec: s } = odprto;
      return {
        naslov: `${IME_KORAKA[a]}: ${IME_STOLPCA[s]}`,
        podnaslov:
          s === "podjetja"
            ? `Podjetja, ki so to aktivnost dobila pred prvim odzivom (${opisObdobja}); ena vrstica na podjetje.`
            : `Podjetja, pri katerih je bila ta aktivnost zadnja pred prvim odzivom (${opisObdobja}).`,
        skupine: [{ kljuc: "vse", dogodki: seznamCelice(dogodki, zdaj, a, s) }],
        prazno: "Nobenega podjetja.",
      };
    }
    if (odprto.vrsta === "prihodki") {
      const k = odprto.kljuc;
      const mesec = /^\d{4}-\d{2}$/.test(k);
      const vrstice = k === "ponavljajoci" ? povzetek.ponavljajoci : mesec ? posliIzbor.filter((p) => p.datum.startsWith(k)) : povzetek.novi;
      return {
        naslov: k === "ponavljajoci" ? "Ponavljajoči posli (MRR)" : mesec ? `Posli: ${MESECI[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}` : "Novi posli",
        podnaslov:
          k === "ponavljajoci"
            ? "Aktivni mesečni in letni posli na zadnji dan obdobja. Zneski brez DDV."
            : `Posli iz lijaka, sklenjeni ${mesec ? "v tem mesecu" : `v obdobju (${opisObdobja})`}. Zneski brez DDV.`,
        skupine: [{ kljuc: "vse", dogodki: posliZaPredal(vrstice) }],
        prazno: "Vpisanih poslov ni. Posel vpišeš ob »Dobljeno« ali na kartici podjetja (Zapiši posel).",
      };
    }
    if (odprto.vrsta === "nedostavljeni") {
      return {
        naslov: "Vrnjeni maili",
        podnaslov: `Predstavitveni mail se je vrnil (${opisObdobja}). Ta podjetja za nas še niso slišala.`,
        skupine: [{ kljuc: "vse", dogodki: seznamNedostavljenih(dogodki, podatki.podjetja, zdaj) }],
        prazno: "Noben mail se ni vrnil.",
      };
    }
    if (odprto.vrsta === "lijak") {
      return {
        naslov: `Lijak: ${IME_FAZE[odprto.kljuc]}`,
        podnaslov:
          odprto.kljuc === "kontaktirana"
            ? `Podjetja, prvič kontaktirana (${opisObdobja}).`
            : `Podjetja, prvič kontaktirana (${opisObdobja}), ki so do danes prišla do te faze in skozi vse prejšnje.`,
        skupine: [{ kljuc: "vse", dogodki: seznamFaze(dogodki, odprto.kljuc, zdaj) }],
        prazno: "Do te faze še ni prišlo nobeno podjetje.",
      };
    }
    if (odprto.vrsta === "aktivnost") {
      // vrstica tabele: vse aktivnosti te vrste (toliko kot Število), tudi več na isto podjetje
      return {
        naslov: IME_KORAKA[odprto.kljuc],
        podnaslov: `Vse aktivnosti te vrste · ${opisObdobja}`,
        skupine: [{ kljuc: "vse", dogodki: seznamZa(dogodki, odprto.kljuc, zdaj) }],
      };
    }
    // toliko vrstic, kot kaže število (rezultati in kontaktirana: ena na podjetje)
    const vrstice = seznamKarticePregleda(dogodki, odprto.kljuc, zdaj);
    if (odprto.kljuc === "odgovor") {
      const r = razdeliOdzive(dogodki, zdaj);
      return {
        naslov: imeKartice(odprto.kljuc),
        podnaslov: `Prvi odzivi v obdobju (${opisObdobja}), razdeljeni po stanju danes.`,
        skupine: [
          { kljuc: "da", naslov: "Da", dogodki: vrstice.filter((e) => r.da.has(e.domena)) },
          { kljuc: "ne-zdaj", naslov: "Ne zdaj", dogodki: vrstice.filter((e) => r.neZdaj.has(e.domena)) },
          { kljuc: "ne", naslov: "Ne", dogodki: vrstice.filter((e) => r.ne.has(e.domena)) },
        ],
        prazno: "V tem obdobju ni odzivov.",
      };
    }
    return {
      naslov: imeKartice(odprto.kljuc),
      podnaslov: `Obdobje: ${opisObdobja}${odprto.kljuc === "prvi" || odprto.kljuc === "kontaktirana" ? " · ena vrstica na podjetje" : ""}`,
      skupine: [{ kljuc: "vse", dogodki: vrstice }],
    };
  }, [odprto, dogodki, zdaj, opisObdobja, akcije, akcijeP, podatki.podjetja, povzetek, posliIzbor, veriga, prl, prlObdobja, danes]);

  const zapri = useCallback(() => setOdprto(null), []);
  const odpriCilj = useCallback((cilj: string) => setOdprto(izCilja(cilj)), []);
  const odpriAkcijo = useCallback((kljuc: string) => setOdprto(izCilja(`akcija-${kljuc}`)), []);
  const odpriAktivnost = useCallback((kljuc: Korak) => setOdprto({ vrsta: "aktivnost", kljuc }), []);
  const odpriDan = useCallback((dan: string) => setOdprto({ vrsta: "dan", dan }), []);
  const odpriFazo = useCallback((kljuc: FazaProdaje) => setOdprto({ vrsta: "faza", kljuc }), []);
  const odpriCelico = useCallback((aktivnost: Korak, stolpec: StolpecTabele) => setOdprto({ vrsta: "celica", aktivnost, stolpec }), []);
  const odpriPrihodke = useCallback((kljuc: string) => setOdprto({ vrsta: "prihodki", kljuc }), []);
  const odpriClen = useCallback((k: KorakVerige) => {
    if (k === "prihodki") document.getElementById("prihodki")?.scrollIntoView({ behavior: "smooth", block: "start" });
    else setOdprto({ vrsta: "veriga", kljuc: k });
  }, []);

  const imeProdukta = PRODUKTI.find((p) => p.kljuc === produkt)!.ime;
  const naSeznamu = podatki.seznami[produkt] ?? 0;
  const imaDogodke = poProduktu.length > 0;
  const opombaProdukta =
    produkt !== "vsi" && !imaDogodke
      ? naSeznamu
        ? `${imeProdukta}: ${naSeznamu} ${enota("podjetij", naSeznamu)} na seznamu kampanje, maili še niso bili poslani.`
        : `${imeProdukta}: kampanja se še ni začela.`
      : null;
  const namigPrimerjave = !primerjaj || !obd.prejCelo ? "" : obd.prej ? `prej: ${kratekRazpon(obd.prej)}` : "prej še ni podatkov";
  const izbranaAkcija = odprto?.vrsta === "akcija" ? odprto.kljuc : null;

  return (
    <div className="mx-auto w-full max-w-[1760px] space-y-10 pb-16">
      <div className="space-y-6">
        <Glava
          opis={`Kompletko prodaja · ${opisObdobja}`}
          obdobje={obdobje}
          onObdobje={setObdobje}
          od={od}
          do={doo}
          onOd={setOd}
          onDo={setDo}
          primerjaj={primerjaj}
          onPrimerjaj={setPrimerjaj}
          primerjavaMogoca={obd.prejCelo !== null}
          namigPrimerjave={namigPrimerjave}
          produkt={produkt}
          onProdukt={setProdukt}
          opombaProdukta={opombaProdukta}
          kampanje={moznosti.kampanje}
          kampanja={kampanja}
          onKampanja={setKampanja}
          osebe={moznosti.osebe}
          oseba={oseba}
          onOseba={setOseba}
        />

        {/* 1. Povzetek vodstva */}
        <Povzetek
          stavek={stavek}
          veriga={veriga}
          opisObdobja={opisObdobja}
          izbran={odprto?.vrsta === "veriga" ? odprto.kljuc : null}
          onClen={odpriClen}
          ugotovitve={kaj}
          onUgotovitev={odpriCilj}
        />
      </div>

      {/* 2. Marketing */}
      <Marketing
        mere={mereM}
        uspesnost={{ tocke: cas.tocke, poDnevih: cas.poDnevih, primerjava: !!prej, onDan: odpriDan }}
        produkti={produkti}
        kampanje={kampanje}
        stroski={podatki.stroski ?? []}
        zapisovanje={zapisovanje}
        opisObdobja={opisObdobja}
        danes={danes}
        onCilj={odpriCilj}
      />

      {/* 3. Leadi in naslednji koraki */}
      <Leadi
        odzivi={akcijeP.find((a) => a.kljuc === "razvrstitev")!.vrstice}
        podjetja={podatki.podjetja}
        koraki={akcije}
        prodaja={akcijeP}
        izbrana={izbranaAkcija}
        onOdpri={odpriAkcijo}
        zapisovanje={zapisovanje}
      />

      {/* 4. Prodajni lijak */}
      <ProdajniLijak
        stopnje={stopnje}
        kanban={tabla}
        izgubljeni={izg}
        napoved={nap}
        mrr={povzetek.mrr}
        arr={povzetek.arr}
        opisObdobja={opisObdobja}
        danes={danes}
        zapisovanje={zapisovanje}
        izbrana={odprto?.vrsta === "faza" ? odprto.kljuc : null}
        onFaza={odpriFazo}
      />

      {/* 5. Prihodki in cilji */}
      <div id="prihodki" className="scroll-mt-24 space-y-3">
        <Prihodki
          posli={povzetek}
          meseci={meseci}
          aplikacijaVkljucena={appVkljucena}
          aplikacijaNa={nalogi ? null : (aplikacija?.napaka ?? "povezava ni nastavljena.")}
          stranke={stranke}
          imeProdukta={imeProdukta}
          opisObdobja={opisObdobja}
          onOdpri={odpriPrihodke}
        />
        <Cilji obdobja={cilji.obdobja} mere={cilji.mere} zapisovanje={zapisovanje} />
      </div>

      {/* 6. Aktivnosti */}
      <section aria-labelledby="pregled-aktivnosti" className="space-y-3">
        <div>
          <h2 id="pregled-aktivnosti" className="text-lg font-semibold tracking-tight text-zinc-900">
            Aktivnosti
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">Kaj smo naredili in katera aktivnost je prinesla odziv · {opisObdobja}</p>
        </div>
        <div className="@container">
          <div className="grid gap-3 @6xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
            <div className="min-w-0 space-y-2">
              <TabelaAktivnosti
                vrstice={tabela}
                izbrana={odprto?.vrsta === "aktivnost" ? odprto.kljuc : null}
                onOdpri={odpriAktivnost}
                skupaj={brezZapisov ? undefined : { aktivnosti: m.aktivnosti, podjetja: m.podjetja }}
                mere={brezZapisov ? undefined : opisMer(m)}
                onCelica={odpriCelico}
                izbranaCelica={odprto?.vrsta === "celica" ? { aktivnost: odprto.aktivnost, stolpec: odprto.stolpec } : null}
              />
              {obdobje === "vse" && brezCasa ? (
                <p className="text-xs text-zinc-500">
                  {brezCasa} starejših dogodkov nima zapisanega dne: štejejo pod »Vse«, v obdobjih in koledarju ne.
                </p>
              ) : null}
            </div>
            <Plosca id="pregled-toplota" className="min-w-0" raven="h3" naslov="Aktivnost po dnevih" opis="Maili in klici na dan; pika = odziv. Klik odpre dan.">
              <Toplota tedni={toplota} izbranDan={odprto?.vrsta === "dan" ? odprto.dan : null} onDan={odpriDan} />
            </Plosca>
          </div>
        </div>
        <Koledar
          dogodki={dogodki}
          danes={danes}
          zacetniDan={jeDatum(zacetek.dan) ? zacetek.dan : danes}
          izbranDan={odprto?.vrsta === "dan" ? odprto.dan : null}
          onOdpriDan={odpriDan}
          podjetja={podatki.podjetja}
        />
        <KakoStejemo />
      </section>

      {predal && odprto ? (
        <Predal
          key={odprto.vrsta === "dan" ? `dan-${odprto.dan}` : (vNaslov(odprto) ?? "x")}
          {...predal}
          podjetja={podatki.podjetja}
          danes={danes}
          onZapri={zapri}
        />
      ) : null}
    </div>
  );
}
