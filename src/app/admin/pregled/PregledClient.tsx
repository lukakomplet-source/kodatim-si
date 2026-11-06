"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AKTIVNOSTI,
  IME_KORAKA,
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
  povzetekPrihodkovPosli,
  predPrvimZapisom,
  prviDan,
  razdeliOdzive,
  seznamKarticePregleda,
  seznamZa,
  tabelaAktivnostiPodjetja,
  zaProdukt,
  type Kartica,
  type Korak,
  type ObdobjeKljuc,
  type PregledPodatki,
  type Prihodek,
  type Produkt,
} from "@/lib/pregled-racun";
import {
  akcijskiCenter,
  karticeRezultata,
  lijakRezultatov,
  mere,
  moznostiFiltrov,
  opisMer,
  seznamCelice,
  seznamFaze,
  seznamNedostavljenih,
  stavekStanja,
  stopnjaOdziva,
  ugotovitve,
  zaFiltre,
  type AkcijaKljuc,
  type FazaKljuc,
  type StolpecTabele,
} from "@/lib/pregled-vodstvo";
import { AkcijskiCenter } from "./AkcijskiCenter";
import { Glava } from "./Glava";
import { enota } from "./Kartice";
import { KakoStejemo } from "./KakoStejemo";
import { Koledar } from "./Koledar";
import { LijakProdaje } from "./LijakProdaje";
import { Predal, type PredalProps } from "./Predal";
import { Prihodki } from "./Prihodki";
import { Rezultat } from "./Rezultat";
import { TabelaAktivnosti } from "./TabelaAktivnosti";

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
const IZBORI = new Set<string>(["kontaktirana", "maili", ...AKTIVNOSTI, ...REZULTATI]);
const FAZE = new Set<string>(["kontaktirana", ...AKTIVNOSTI, ...REZULTATI]);
const AKCIJE = new Set<string>(["danes", "zamujeno", "caka", "leadi", "sestanki", "pozornost"]);

/**
 * Kaj je odprto v predalu. V naslovu strani: seznam=<kartica>, seznam=lijak-<faza>, seznam=aktivnost-<korak>
 * (vrstica tabele), seznam=akcija-<skupina>, seznam=nedostavljeni ali dan=<YYYY-MM-DD>.
 */
export type OdprtSeznam =
  | { vrsta: "kartica"; kljuc: Izbor }
  | { vrsta: "lijak"; kljuc: FazaKljuc }
  | { vrsta: "aktivnost"; kljuc: Korak }
  | { vrsta: "akcija"; kljuc: AkcijaKljuc }
  | { vrsta: "nedostavljeni" }
  | { vrsta: "celica"; aktivnost: Korak; stolpec: StolpecTabele }
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

/** »lijak-odgovor«, »akcija-zamujeno«, »aktivnost-klic«, »nedostavljeni«, »odgovor« → kaj odpreti. */
function izCilja(s: string): OdprtSeznam | null {
  if (s === "nedostavljeni") return { vrsta: "nedostavljeni" };
  if (s.startsWith("celica-")) {
    const [, a, st] = s.split("-");
    if (AKTIVNOSTI.includes(a as Korak) && STOLPCI.has(st)) return { vrsta: "celica", aktivnost: a as Korak, stolpec: st as StolpecTabele };
  }
  if (s.startsWith("lijak-") && FAZE.has(s.slice(6))) return { vrsta: "lijak", kljuc: s.slice(6) as FazaKljuc };
  if (s.startsWith("akcija-") && AKCIJE.has(s.slice(7))) return { vrsta: "akcija", kljuc: s.slice(7) as AkcijaKljuc };
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
 * Pregled v3 (Luka 6. 11. 2026, »Management overview«): stanje prodaje v treh sekundah. Vrstni red po pomembnosti:
 * A rezultat in »Kaj se dogaja?«, B lijak (kje izgubljamo) ob C »Kaj moramo narediti«, D aktivnosti, E prihodki,
 * F koledar in opredelitve. Vsaka številka odpre seznam v predalu; filtri veljajo povsod (akcijski center je stanje
 * danes, zato ne glede na obdobje).
 */
export function PregledClient({
  podatki,
  zacetek,
  prihodki,
}: {
  podatki: PregledPodatki;
  zacetek: ZacetekPregleda;
  /** Prihodki iz aplikacije Kompletko; dokler niso povezani, undefined in vse je N/A. */
  prihodki?: Prihodek[] | null;
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

  // Primerjava samo, kadar je CELO prejšnje obdobje po prvem zabeleženem dogodku; prej ni podatkov, ne ničel.
  const prvi = useMemo(() => prviDan(podatki.dogodki), [podatki.dogodki]);
  const obd = useMemo(() => obdobjeSCeloPrimerjavo(obdobje, danes, { od, do: doo }, prvi), [obdobje, danes, od, doo, prvi]);
  const zdaj = obd.zdaj;
  const prej = primerjaj ? obd.prej : null;
  const konec = konecObdobja(zdaj, danes);
  const brezZapisov = predPrvimZapisom(zdaj, prvi);
  // Filtri: produkt, nato kampanja in oseba (vsi deli strani dobijo iste dogodke; možnosti upoštevajo druge filtre).
  const poProduktu = useMemo(() => zaProdukt(oznaciNaknadne(podatki.dogodki), produkt), [podatki.dogodki, produkt]);
  const moznosti = useMemo(() => moznostiFiltrov(poProduktu, podatki.podjetja, kampanja, oseba), [poProduktu, podatki.podjetja, kampanja, oseba]);
  const dogodki = useMemo(() => zaFiltre(poProduktu, podatki.podjetja, kampanja, oseba), [poProduktu, podatki.podjetja, kampanja, oseba]);

  // A. rezultat
  const kartice = useMemo(
    () => karticeRezultata(dogodki, podatki.podjetja, zdaj, prej, podatki.brezVidea, konec, prvi),
    [dogodki, podatki.podjetja, zdaj, prej, podatki.brezVidea, konec, prvi],
  );
  const stopnja = useMemo(() => stopnjaOdziva(dogodki, zdaj, prej, brezZapisov), [dogodki, zdaj, prej, brezZapisov]);
  const povzetek = useMemo(() => povzetekPrihodkovPosli(prihodki, produkt, zdaj, konec), [prihodki, produkt, zdaj, konec]);
  const stevilo = (k: Izbor) => kartice.find((x) => x.kljuc === k)?.stevilo ?? 0;
  const stavek = stavekStanja({
    kontaktirana: stevilo("kontaktirana"),
    odzivi: stevilo("odgovor"),
    leadi: stevilo("lead"),
    sestanki: stevilo("sestanek"),
    posli: stevilo("posel"),
    stopnja: stopnja.besedilo,
    brez: brezZapisov,
    prvi,
  });
  // B. lijak, C. akcijski center (stanje danes) in ugotovitve
  const lijak = useMemo(() => lijakRezultatov(dogodki, zdaj), [dogodki, zdaj]);
  const akcije = useMemo(() => akcijskiCenter(dogodki, podatki.podjetja, danes), [dogodki, podatki.podjetja, danes]);
  const nedostavljenih = useMemo(() => nedostavljeni(dogodki, podatki.podjetja, zdaj), [dogodki, podatki.podjetja, zdaj]);
  const kaj = useMemo(
    () => ugotovitve({ lijak, akcije, nedostavljenih, podjetja: podatki.podjetja, brez: brezZapisov }),
    [lijak, akcije, nedostavljenih, podatki.podjetja, brezZapisov],
  );
  // D. aktivnosti
  const tabela = useMemo(
    () => tabelaAktivnostiPodjetja(dogodki, zdaj, podatki.brezVidea, brezZapisov),
    [dogodki, zdaj, podatki.brezVidea, brezZapisov],
  );
  const m = useMemo(() => mere(dogodki, podatki.podjetja, zdaj), [dogodki, podatki.podjetja, zdaj]);
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
    if (odprto.vrsta === "akcija") {
      const a = akcije.find((x) => x.kljuc === odprto.kljuc)!;
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
    // toliko vrstic, kot kaže kartica (rezultati in kontaktirana: ena na podjetje)
    const vrstice = seznamKarticePregleda(dogodki, odprto.kljuc, zdaj);
    if (odprto.kljuc === "odgovor") {
      // Iste skupine kot »N da, N ne, N ne zdaj« na kartici (isto pravilo, razdeliOdzive).
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
  }, [odprto, dogodki, zdaj, opisObdobja, akcije, podatki.podjetja]);

  const zapri = useCallback(() => setOdprto(null), []);
  const odpriKartico = useCallback((kljuc: Izbor) => setOdprto({ vrsta: "kartica", kljuc }), []);
  const odpriLijak = useCallback((kljuc: FazaKljuc) => setOdprto({ vrsta: "lijak", kljuc }), []);
  const odpriAkcijo = useCallback((kljuc: AkcijaKljuc) => setOdprto({ vrsta: "akcija", kljuc }), []);
  const odpriAktivnost = useCallback((kljuc: Korak) => setOdprto({ vrsta: "aktivnost", kljuc }), []);
  const odpriDan = useCallback((dan: string) => setOdprto({ vrsta: "dan", dan }), []);
  const odpriCelico = useCallback(
    (aktivnost: Korak, stolpec: StolpecTabele) => setOdprto({ vrsta: "celica", aktivnost, stolpec }),
    [],
  );
  const odpriCilj = useCallback((cilj: string) => setOdprto(izCilja(cilj)), []);
  const naPrihodke = useCallback(
    () => document.getElementById("prihodki")?.scrollIntoView({ behavior: "smooth", block: "start" }),
    [],
  );

  const imeProdukta = PRODUKTI.find((p) => p.kljuc === produkt)!.ime;
  const naSeznamu = podatki.seznami[produkt] ?? 0;
  // Harvey za zdaj vse dogodke zapiše pod Panic button (oznake produkta še nima), zato tu ne trdimo, da maila ni bilo.
  const opombaProdukta =
    produkt !== "vsi" && produkt !== "panik"
      ? naSeznamu
        ? `${imeProdukta}: ${naSeznamu} ${enota("podjetij", naSeznamu)} na seznamu kampanje. Harvey za zdaj vse dogodke beleži pod Panic button.`
        : `${imeProdukta}: kampanja se še ni začela.`
      : null;
  const namigPrimerjave = !primerjaj || !obd.prejCelo ? "" : obd.prej ? `prej: ${kratekRazpon(obd.prej)}` : "prej še ni podatkov";

  return (
    <div className="mx-auto w-full max-w-[1760px] space-y-6 pb-16">
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

      {/* A. Rezultat in »Kaj se dogaja?« */}
      <Rezultat
        stavek={stavek}
        kartice={kartice}
        stopnja={stopnja}
        prihodki={povzetek}
        izbrana={odprto?.vrsta === "kartica" ? odprto.kljuc : null}
        izbranaStopnja={false}
        onOdpri={odpriKartico}
        onStopnja={() => odpriKartico("odgovor")}
        onPrihodki={naPrihodke}
        ugotovitve={kaj}
        onUgotovitev={odpriCilj}
      />

      {/* B. Lijak ob C. Kaj moramo narediti */}
      <div className="@container">
        <div className="grid gap-6 @5xl:grid-cols-2">
          <LijakProdaje
            faze={lijak.faze}
            najsibkejsa={lijak.najsibkejsa}
            zunajVerige={lijak.zunajVerige}
            opisObdobja={opisObdobja}
            prazno={
              brezZapisov && prvi
                ? `Pred ${lepDatum(prvi)} ni zapisov.`
                : "V tem obdobju ni bilo prvič kontaktiranih podjetij, zato so vse faze prazne."
            }
            izbrana={odprto?.vrsta === "lijak" ? odprto.kljuc : null}
            onOdpri={odpriLijak}
          />
          <AkcijskiCenter akcije={akcije} izbrana={odprto?.vrsta === "akcija" ? odprto.kljuc : null} onOdpri={odpriAkcijo} />
        </div>
      </div>

      {/* D. Aktivnosti */}
      <div className="space-y-2">
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

      {/* E. Prihodki */}
      <div id="prihodki" className="scroll-mt-24">
        <Prihodki povzetek={povzetek} imeProdukta={imeProdukta} opisObdobja={opisObdobja} />
      </div>

      {/* F. Koledar in opredelitve */}
      <Koledar
        dogodki={dogodki}
        danes={danes}
        zacetniDan={jeDatum(zacetek.dan) ? zacetek.dan : danes}
        izbranDan={odprto?.vrsta === "dan" ? odprto.dan : null}
        onOdpriDan={odpriDan}
        podjetja={podatki.podjetja}
      />
      <KakoStejemo />

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
