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
  karticePregleda,
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
  seznamLijakaVeriga,
  seznamZa,
  stopnjeLijakaVeriga,
  tabelaAktivnostiPodjetja,
  zaProdukt,
  type Kartica,
  type Korak,
  type ObdobjeKljuc,
  type PregledPodatki,
  type Prihodek,
  type Produkt,
} from "@/lib/pregled-racun";
import { Glava } from "./Glava";
import { Kartice, enota } from "./Kartice";
import { Koledar } from "./Koledar";
import { Lijak } from "./Lijak";
import { Predal, type PredalProps } from "./Predal";
import { Prihodki } from "./Prihodki";
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
};

type Izbor = Kartica["kljuc"];
const IZBORI = new Set<string>(["kontaktirana", "maili", ...AKTIVNOSTI, ...REZULTATI]);
const KORAKI = new Set<string>([...AKTIVNOSTI, ...REZULTATI]);

/**
 * Kaj je odprto v predalu. V naslovu strani: seznam=<kartica>, seznam=lijak-<korak>, seznam=aktivnost-<korak>
 * (vrstica tabele: vse aktivnosti te vrste) ali dan=<YYYY-MM-DD>.
 */
export type OdprtSeznam =
  | { vrsta: "kartica"; kljuc: Izbor }
  | { vrsta: "lijak"; kljuc: Korak }
  | { vrsta: "aktivnost"; kljuc: Korak }
  | { vrsta: "dan"; dan: string };

function izNaslova(z: ZacetekPregleda): OdprtSeznam | null {
  if (jeDatum(z.dan)) return { vrsta: "dan", dan: z.dan };
  const s = z.seznam;
  if (s?.startsWith("lijak-") && KORAKI.has(s.slice(6))) return { vrsta: "lijak", kljuc: s.slice(6) as Korak };
  if (s?.startsWith("aktivnost-") && AKTIVNOSTI.includes(s.slice(10) as Korak)) {
    return { vrsta: "aktivnost", kljuc: s.slice(10) as Korak };
  }
  if (s && IZBORI.has(s)) return { vrsta: "kartica", kljuc: s as Izbor };
  return null;
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

// Luka 6. 11.: opredelitev leada mora biti na strani. Odziv je prvi odgovor podjetja; da/ne/ne zdaj je stanje danes.
const OPREDELITVE = (
  <dl className="flex flex-wrap gap-x-6 gap-y-1">
    <div>
      <dt className="inline font-medium text-zinc-700">Odziv:</dt>{" "}
      <dd className="inline">prvi odgovor podjetja, pisno ali na klicu (da, ne in ne zdaj so stanje danes).</dd>
    </div>
    <div>
      <dt className="inline font-medium text-zinc-700">Lead:</dt>{" "}
      <dd className="inline">
        podjetje, ki je reklo da sestanku, ponudbi ali testu. »Pokličite kasneje«, »pošljite na mail« in »nimamo potrebe«
        so samo odziv.
      </dd>
    </div>
  </dl>
);

export function PregledClient({
  podatki,
  zacetek,
  prihodki,
}: {
  podatki: PregledPodatki;
  zacetek: ZacetekPregleda;
  /** Prihodki iz aplikacije Kompletko; dokler niso povezani (Lukov posebni OK), undefined in vse je N/A. */
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
    if (odprto?.vrsta === "kartica") p.set("seznam", odprto.kljuc);
    if (odprto?.vrsta === "lijak") p.set("seznam", `lijak-${odprto.kljuc}`);
    if (odprto?.vrsta === "aktivnost") p.set("seznam", `aktivnost-${odprto.kljuc}`);
    if (odprto?.vrsta === "dan") p.set("dan", odprto.dan);
    window.history.replaceState(null, "", `?${p.toString()}`);
  }, [produkt, obdobje, od, doo, primerjaj, odprto]);

  // Primerjava samo, kadar je CELO prejšnje obdobje po prvem zabeleženem dogodku; prej ni podatkov, ne ničel.
  const prvi = useMemo(() => prviDan(podatki.dogodki), [podatki.dogodki]);
  const obd = useMemo(() => obdobjeSCeloPrimerjavo(obdobje, danes, { od, do: doo }, prvi), [obdobje, danes, od, doo, prvi]);
  const zdaj = obd.zdaj;
  const prej = primerjaj ? obd.prej : null;
  const konec = konecObdobja(zdaj, danes);
  const brezZapisov = predPrvimZapisom(zdaj, prvi);
  const dogodki = useMemo(() => zaProdukt(oznaciNaknadne(podatki.dogodki), produkt), [podatki.dogodki, produkt]);

  const kartice = useMemo(
    () => karticePregleda(dogodki, podatki.podjetja, zdaj, prej, podatki.brezVidea, konec, prvi),
    [dogodki, podatki.podjetja, zdaj, prej, podatki.brezVidea, konec, prvi],
  );
  const lijak = useMemo(() => stopnjeLijakaVeriga(dogodki, zdaj, podatki.brezVidea), [dogodki, zdaj, podatki.brezVidea]);
  const nedostavljenih = useMemo(() => nedostavljeni(dogodki, podatki.podjetja, zdaj), [dogodki, podatki.podjetja, zdaj]);
  const tabela = useMemo(
    () => tabelaAktivnostiPodjetja(dogodki, zdaj, podatki.brezVidea, brezZapisov),
    [dogodki, zdaj, podatki.brezVidea, brezZapisov],
  );
  const brezCasa = useMemo(() => dogodki.filter((e) => !e.cas).length, [dogodki]);
  const povzetek = useMemo(() => povzetekPrihodkovPosli(prihodki, produkt, zdaj, konec), [prihodki, produkt, zdaj, konec]);

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
    if (odprto.vrsta === "lijak") {
      return {
        naslov: `Lijak: ${IME_KORAKA[odprto.kljuc]}`,
        podnaslov: `Podjetja, prvič kontaktirana (${opisObdobja}), ki so do danes prišla do tega koraka.`,
        skupine: [{ kljuc: "vse", dogodki: seznamLijakaVeriga(dogodki, odprto.kljuc, zdaj) }],
      };
    }
    if (odprto.vrsta === "aktivnost") {
      // vrstica tabele: vse aktivnosti te vrste (toliko kot Skupaj), tudi več na isto podjetje
      return {
        naslov: IME_KORAKA[odprto.kljuc],
        podnaslov: `Vse aktivnosti te vrste · ${opisObdobja}`,
        skupine: [{ kljuc: "vse", dogodki: seznamZa(dogodki, odprto.kljuc, zdaj) }],
      };
    }
    // toliko vrstic, kot kaže kartica (rezultati in predstavitveni maili: ena na podjetje)
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
      };
    }
    return {
      naslov: imeKartice(odprto.kljuc),
      podnaslov: `Obdobje: ${opisObdobja}${odprto.kljuc === "prvi" ? " · ena vrstica na podjetje" : ""}`,
      skupine: [{ kljuc: "vse", dogodki: vrstice }],
    };
  }, [odprto, dogodki, zdaj, opisObdobja]);

  const zapri = useCallback(() => setOdprto(null), []);
  const odpriKartico = useCallback((kljuc: Izbor) => setOdprto({ vrsta: "kartica", kljuc }), []);
  const odpriLijak = useCallback((kljuc: Korak) => setOdprto({ vrsta: "lijak", kljuc }), []);
  const odpriAktivnost = useCallback((kljuc: Korak) => setOdprto({ vrsta: "aktivnost", kljuc }), []);
  const odpriDan = useCallback((dan: string) => setOdprto({ vrsta: "dan", dan }), []);
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

  const aktivnosti = kartice.filter((k) => k.skupina === "aktivnost");
  const rezultati = kartice.filter((k) => k.skupina === "rezultat");
  const izbranaKartica = odprto?.vrsta === "kartica" ? odprto.kljuc : null;
  const izbranaAktivnost = odprto?.vrsta === "aktivnost" ? odprto.kljuc : null;

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
      />

      {brezZapisov && prvi ? (
        <p className="rounded-lg bg-white px-4 py-3 text-sm text-zinc-600 ring-1 ring-zinc-200">
          Pred {lepDatum(prvi)} ni zapisov, zato so številke za to obdobje N/A (ne 0).
        </p>
      ) : null}

      <Kartice
        naslov="Aktivnosti"
        opis="Kaj smo naredili v obdobju."
        kartice={aktivnosti}
        izbrana={izbranaKartica}
        onOdpri={odpriKartico}
      />
      <Kartice
        naslov="Rezultati"
        opis={OPREDELITVE}
        kartice={rezultati}
        izbrana={izbranaKartica}
        onOdpri={odpriKartico}
        prihodki={{ povzetek, onOdpri: naPrihodke }}
      />
      {obdobje === "vse" && brezCasa ? (
        <p className="text-xs text-zinc-500">
          {brezCasa} starejših dogodkov nima zapisanega dne: štejejo tu pod »Vse«, v obdobjih in koledarju ne.
        </p>
      ) : null}

      <Lijak
        stopnje={lijak.stopnje}
        osnova={lijak.osnova}
        samoKlic={lijak.samoKlic}
        nedostavljenih={nedostavljenih}
        zunajVerige={lijak.zunajVerige}
        opisObdobja={opisObdobja}
        prazno={
          brezZapisov && prvi
            ? `Pred ${lepDatum(prvi)} ni zapisov.`
            : "V tem obdobju ni bilo prvič kontaktiranih podjetij, zato so vse stopnje prazne."
        }
        izbrana={odprto?.vrsta === "lijak" ? odprto.kljuc : null}
        onOdpri={odpriLijak}
      />
      <TabelaAktivnosti vrstice={tabela} izbrana={izbranaAktivnost} onOdpri={odpriAktivnost} />

      <Koledar
        dogodki={dogodki}
        danes={danes}
        zacetniDan={jeDatum(zacetek.dan) ? zacetek.dan : danes}
        izbranDan={odprto?.vrsta === "dan" ? odprto.dan : null}
        onOdpriDan={odpriDan}
        podjetja={podatki.podjetja}
      />

      <div id="prihodki" className="scroll-mt-24">
        <Prihodki povzetek={povzetek} imeProdukta={imeProdukta} opisObdobja={opisObdobja} />
      </div>

      {predal && odprto ? (
        <Predal
          key={odprto.vrsta === "dan" ? `dan-${odprto.dan}` : `${odprto.vrsta}-${odprto.kljuc}`}
          {...predal}
          podjetja={podatki.podjetja}
          danes={danes}
          onZapri={zapri}
        />
      ) : null}
    </div>
  );
}
