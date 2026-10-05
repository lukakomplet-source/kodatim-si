"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { ZemljevidSlicica } from "../ZemljevidSlicica";

export type HotelKartica = {
  id: string;
  url: string;
  vir: string;
  naslov: string | null;
  kraj: string | null;
  drzava: "SI" | "HR" | null;
  /** Vrednost stolpca `nastanitev` (hotel, penzion, hostel …). */
  vrsta: string;
  cena: number | null;
  /** Ko isti objekt objavi agencija z dvema cenama: nižja od njiju. */
  cenaOd: number | null;
  padecPct: number | null;
  povrsina: number | null;
  zemljisce: number | null;
  enot: number | null;
  enotVir: "potrjeno" | "iz ležišč" | "ocena" | null;
  lezisc: number | null;
  cenaNaEnoto: number | null;
  slika: string | null;
  /** Fotografija je z drugega vira, kjer je ISTI objekt (ista cena, površina, kraj). */
  slikaIsti: { vir: string; url: string } | null;
  lat: number | null;
  lng: number | null;
  dniNaTrgu: number;
  zadnjicVidenDni: number;
  tudiNa: string[];
  turizem: { tocke: number; atrakcija: string | null; obcina: string | null; prenocitve: number | null } | null;
  hrPonudba: { kraj: string; objektov: number; enot: number; hotelov: number } | null;
};

const eur = (v: number) => `${Math.round(v).toLocaleString("sl-SI")} €`;
const KORAK = 30;

/** Vrste iz parse.ts, združene v skupine, kot jih išče kupec. */
const SKUPINE: { kljuc: string; oznaka: string; vrste: string[] }[] = [
  { kljuc: "hotel", oznaka: "Hoteli", vrste: ["hotel"] },
  { kljuc: "penzion", oznaka: "Penzioni in gostišča", vrste: ["penzion", "gostisce", "motel"] },
  { kljuc: "hostel", oznaka: "Hosteli", vrste: ["hostel"] },
  { kljuc: "apartmaji", oznaka: "Apartmajske hiše", vrste: ["apartmajska_hisa"] },
  { kljuc: "drugo", oznaka: "Drugo", vrste: ["nastanitveni_objekt", "turisticna_kmetija"] },
];
const skupinaVrste = (v: string) => SKUPINE.find((s) => s.vrste.includes(v))?.kljuc ?? "drugo";

const VRSTA_OZNAKA: Record<string, string> = {
  hotel: "hotel",
  penzion: "penzion",
  gostisce: "gostišče",
  motel: "motel",
  hostel: "hostel",
  apartmajska_hisa: "apartmajska hiša",
  nastanitveni_objekt: "nastanitveni objekt",
  turisticna_kmetija: "turistična kmetija",
};

/**
 * Viri pišejo kraj različno: nepremicnine.net "Kamnik, Center" (kraj, del),
 * bolha "Istrska, Fažana" (regija, kraj). Pokažemo kraj, ne regije ne četrti.
 */
const REGIJA_SPREDAJ =
  /^(istrska|primorsko|splitsko|zadarska|[šs]ibensko|dubrova[čc]ko|li[čc]ko|zagreba[čc]ka|osje[čc]ko|gorenjska|savinjska|podravska|koro[šs]ka|osrednjeslovenska|severna primorska|ju[žz]na primorska|pomurska|posavska|zasavska|dolenjska|notranjska|obalno)/i;
function prikazKraja(kraj: string | null): string {
  const deli = (kraj ?? "").split(",").map((d) => d.trim()).filter(Boolean);
  if (deli.length === 0) return "—";
  return deli.length > 1 && REGIJA_SPREDAJ.test(deli[0]) ? deli[1] : deli[0];
}

const DRZAVE = [
  { kljuc: "", oznaka: "Vse" },
  { kljuc: "SI", oznaka: "Slovenija" },
  { kljuc: "HR", oznaka: "Hrvaška" },
];

function Zavihek({ aktiven, onClick, oznaka, stevilo }: { aktiven: boolean; onClick: () => void; oznaka: string; stevilo: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktiven}
      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
        aktiven ? "bg-accent text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
      }`}
    >
      {oznaka}
      <span className={`rounded-full px-1.5 text-[11px] ${aktiven ? "bg-white/20" : "bg-zinc-100 text-zinc-500"}`}>{stevilo}</span>
    </button>
  );
}

export function HoteliClient({ hoteli }: { hoteli: HotelKartica[] }) {
  const [drzava, setDrzava] = useState("");
  const [skupina, setSkupina] = useState("");
  const [enotMin, setEnotMin] = useState(0);
  const [cenaMax, setCenaMax] = useState(0);
  const [razvrsti, setRazvrsti] = useState("cena_visja");
  const [prikazanih, setPrikazanih] = useState(KORAK);

  const ponastavi = () => setPrikazanih(KORAK);

  // Števci zavihkov upoštevajo ostale filtre, da številka pove, kaj dobiš ob kliku.
  const poOstalih = useMemo(
    () =>
      hoteli.filter(
        (h) =>
          (enotMin === 0 || (h.enot ?? 0) >= enotMin) &&
          (cenaMax === 0 || (h.cena !== null && h.cena <= cenaMax))
      ),
    [hoteli, enotMin, cenaMax]
  );
  const vDrzavi = useMemo(() => poOstalih.filter((h) => !drzava || h.drzava === drzava), [poOstalih, drzava]);

  const seznam = useMemo(() => {
    const r = vDrzavi.filter((h) => !skupina || skupinaVrste(h.vrsta) === skupina);
    const brez = (v: number | null, privzeto: number) => (v === null ? privzeto : v);
    const kljuc: Record<string, (h: HotelKartica) => number> = {
      cena_visja: (h) => brez(h.cena, -1),
      cena_nizja: (h) => -brez(h.cena, Number.MAX_SAFE_INTEGER),
      enote: (h) => brez(h.enot, -1),
      na_enoto: (h) => -brez(h.cenaNaEnoto, Number.MAX_SAFE_INTEGER),
      turizem: (h) => h.turizem?.tocke ?? (h.hrPonudba ? h.hrPonudba.enot / 100 : -1),
    };
    const f = kljuc[razvrsti] ?? kljuc.cena_visja;
    return [...r].sort((a, b) => f(b) - f(a));
  }, [vDrzavi, skupina, razvrsti]);

  return (
    <>
      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-1.5">
          {DRZAVE.map((d) => (
            <Zavihek
              key={d.kljuc || "vse"}
              aktiven={drzava === d.kljuc}
              onClick={() => { setDrzava(d.kljuc); ponastavi(); }}
              oznaka={d.oznaka}
              stevilo={d.kljuc ? poOstalih.filter((h) => h.drzava === d.kljuc).length : poOstalih.length}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Zavihek aktiven={skupina === ""} onClick={() => { setSkupina(""); ponastavi(); }} oznaka="Vse vrste" stevilo={vDrzavi.length} />
          {SKUPINE.map((s) => (
            <Zavihek
              key={s.kljuc}
              aktiven={skupina === s.kljuc}
              onClick={() => { setSkupina(s.kljuc); ponastavi(); }}
              oznaka={s.oznaka}
              stevilo={vDrzavi.filter((h) => skupinaVrste(h.vrsta) === s.kljuc).length}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            Enot vsaj
            <select
              id="hoteli-enot"
              value={enotMin}
              onChange={(e) => { setEnotMin(Number(e.target.value)); ponastavi(); }}
              className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900"
            >
              <option value={0}>vseeno</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            Cena do
            <select
              id="hoteli-cena"
              value={cenaMax}
              onChange={(e) => { setCenaMax(Number(e.target.value)); ponastavi(); }}
              className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900"
            >
              <option value={0}>brez meje</option>
              <option value={500000}>500.000 €</option>
              <option value={1000000}>1.000.000 €</option>
              <option value={2000000}>2.000.000 €</option>
              <option value={5000000}>5.000.000 €</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            Razvrsti
            <select
              id="hoteli-razvrsti"
              value={razvrsti}
              onChange={(e) => setRazvrsti(e.target.value)}
              className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900"
            >
              <option value="cena_visja">najdražji</option>
              <option value="cena_nizja">najcenejši</option>
              <option value="enote">največ enot</option>
              <option value="na_enoto">najnižja cena na enoto</option>
              <option value="turizem">turistični potencial</option>
            </select>
          </label>
          <p className="ml-auto self-end text-sm text-zinc-500">{seznam.length} objektov</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {seznam.slice(0, prikazanih).map((h) => (
          <article key={h.id} className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            {/* Slika po referenci, ne po kopiji — kot povsod v modulu. */}
            <a
              href={h.url}
              target="_blank"
              rel="noopener noreferrer"
              className="relative block aspect-[4/3] w-full overflow-hidden bg-zinc-100"
              title="Odpri oglas pri viru"
            >
              {h.slika ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={h.slika}
                  alt={h.naslov ?? "Fotografija objekta"}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]"
                />
              ) : h.lat !== null && h.lng !== null ? (
                <ZemljevidSlicica lat={h.lat} lng={h.lng} />
              ) : (
                <span className="flex h-full w-full items-center justify-center px-6 text-center text-xs text-zinc-400">
                  Fotografije so na izvirnem oglasu
                </span>
              )}
              {!h.slika && (
                <span className="absolute bottom-2 left-2 rounded-full bg-zinc-900/75 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                  Fotografije so na izvirnem oglasu — tapni
                </span>
              )}
              {h.drzava && (
                <span className="absolute left-2 top-2 rounded-full bg-zinc-900/75 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur">
                  {h.drzava === "SI" ? "Slovenija" : "Hrvaška"}
                </span>
              )}
            </a>

            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                    {VRSTA_OZNAKA[h.vrsta] ?? h.vrsta} · {h.vir}
                  </p>
                  <h2 className="mt-0.5 truncate text-[15px] font-semibold text-zinc-900" title={h.naslov ?? ""}>
                    <Link href={`/nepremicnine/oglas/${h.id}`} className="hover:text-accent">
                      {prikazKraja(h.kraj)}
                    </Link>
                  </h2>
                  <p className="truncate text-xs text-zinc-500" title={h.naslov ?? ""}>{h.naslov}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-zinc-900">
                    {h.cena === null ? "cena na upit" : h.cenaOd ? `${eur(h.cenaOd)}–${eur(h.cena)}` : eur(h.cena)}
                  </p>
                  {h.cenaNaEnoto !== null && (
                    <p className="rounded-full bg-accent/10 px-2 py-0.5 text-center text-xs font-bold text-accent">
                      {eur(h.cenaNaEnoto)} / enoto
                    </p>
                  )}
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-600">
                <div className="flex justify-between"><dt className="text-zinc-400">Površina</dt><dd className="font-medium">{h.povrsina ? `${h.povrsina.toLocaleString("sl-SI")} m²` : "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-400">Zemljišče</dt><dd className="font-medium">{h.zemljisce ? `${h.zemljisce.toLocaleString("sl-SI")} m²` : "—"}</dd></div>
                <div className="flex justify-between" title={h.enotVir === "iz ležišč" && h.lezisc ? `${h.lezisc} ležišč ÷ 2,5` : ""}>
                  <dt className="text-zinc-400">Enot</dt>
                  <dd className="font-medium">{h.enot === null ? "ni podatka" : `${h.enotVir === "potrjeno" ? "" : "~"}${h.enot}${h.enotVir && h.enotVir !== "potrjeno" ? ` (${h.enotVir})` : ""}`}</dd>
                </div>
                <div className="flex justify-between"><dt className="text-zinc-400">Na trgu</dt><dd className="font-medium">{h.dniNaTrgu} dni</dd></div>
              </dl>

              <div className="mt-2 space-y-0.5 text-[11px] text-zinc-500">
                {h.turizem && (
                  <p>
                    {h.turizem.obcina && h.turizem.prenocitve !== null
                      ? `Občina ${h.turizem.obcina}: ${h.turizem.prenocitve.toLocaleString("sl-SI")} prenočitev na leto (SURS)`
                      : "Prenočitve občine: ni podatka"}
                    {h.turizem.atrakcija && ` · ${h.turizem.atrakcija}`}
                    {` · turistični potencial ${h.turizem.tocke}/100`}
                  </p>
                )}
                {h.hrPonudba && (
                  <p>
                    V kraju {h.hrPonudba.kraj}: {h.hrPonudba.hotelov} hotelov, {h.hrPonudba.objektov} kategoriziranih objektov,{" "}
                    {h.hrPonudba.enot.toLocaleString("sl-SI")} enot (register ministrstva)
                  </p>
                )}
                {h.padecPct !== null && <p className="font-medium text-emerald-600">Cena znižana za {h.padecPct.toLocaleString("sl-SI")} %</p>}
                {h.zadnjicVidenDni > 14 && (
                  <p className="font-medium text-amber-700">Zadnjič viden pred {h.zadnjicVidenDni} dnevi — preveri, ali je še naprodaj.</p>
                )}
                {h.tudiNa.length > 0 && <p>Isti objekt tudi na: {[...new Set(h.tudiNa)].join(", ")}</p>}
                {h.slikaIsti && (
                  <p>
                    Fotografija:{" "}
                    <a href={h.slikaIsti.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-accent">
                      {h.slikaIsti.vir}
                    </a>{" "}
                    (isti objekt, ista cena in površina)
                  </p>
                )}
              </div>

              <div className="mt-auto flex gap-2 pt-3">
                <a
                  href={h.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
                >
                  <ExternalLink className="h-4 w-4" />
                  ODPRI OGLAS
                </a>
                <Link
                  href={`/nepremicnine/oglas/${h.id}`}
                  className="inline-flex items-center justify-center rounded-xl border-2 border-accent/40 px-3 py-2.5 text-sm font-bold text-accent transition hover:bg-accent/5"
                >
                  PODROBNOSTI
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>

      {seznam.length > prikazanih && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setPrikazanih((n) => n + KORAK)}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Pokaži še {Math.min(KORAK, seznam.length - prikazanih)}
          </button>
        </div>
      )}
    </>
  );
}
