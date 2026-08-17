"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, RotateCcw } from "lucide-react";
import { eur } from "@/lib/avtonet/analiza";
import { RAZVRSTITVE as OGLASNE, primerjaj, type Razvrstitev as OglasnaRazvrstitev } from "@/lib/avtonet/razvrscanje";

/**
 * The Deal Feed's filters and list.
 *
 * Filtering happens here rather than on the server because the whole feed (a few
 * hundred scored adverts) already arrived with the page: a round-trip per
 * dropdown would be slower and would tell the user nothing new. The options are
 * derived from the deals themselves, so a brand or a model can only be offered
 * when there is actually a deal behind it — an empty result is never one click
 * away.
 */

export type Deal = {
  avtonetId: string;
  url: string;
  naziv: string | null;
  model: string;
  znamka: string | null;
  modelIme: string | null;
  zasluzek: number;
  potencial: number;
  medianaTrgovcev: number | null;
  vzorecTrgovcev: number;
  odstopanjeTrgovciPct: number | null;
  strogost: string;
  cena: number;
  medianaKohorte: number;
  odstopanjePct: number;
  vzorec: number;
  letnik: number | null;
  km: number | null;
  jeDealer: boolean | null;
  oglediNaDan: number | null;
  delez14: number | null;
  kmAnomalija: boolean;
  tocke: number;
  razlogi: string[];
};

const KORAK = 20;

/** The deal-specific orders, plus every order the source itself offers. */
type PoselRazvrstitev = "potencial" | "zasluzek" | "odstotek" | "trgovci" | "hitrost";

type Razvrstitev = PoselRazvrstitev | OglasnaRazvrstitev;

const POSLOVNE: { vrednost: PoselRazvrstitev; oznaka: string }[] = [
  { vrednost: "potencial", oznaka: "Najbolj zanimivi za prodajo" },
  { vrednost: "zasluzek", oznaka: "Največja razlika v €" },
  { vrednost: "trgovci", oznaka: "Največ pod ceno trgovcev" },
  { vrednost: "odstotek", oznaka: "Največ % pod mediano" },
  { vrednost: "hitrost", oznaka: "Najhitreje prodani modeli" },
];

const izbira =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-accent disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400";

export function PosliClient({ deals }: { deals: Deal[] }) {
  const [znamka, setZnamka] = useState("");
  const [model, setModel] = useState("");
  const [letnikOd, setLetnikOd] = useState("");
  const [letnikDo, setLetnikDo] = useState("");
  const [cenaOd, setCenaOd] = useState("");
  const [cenaDo, setCenaDo] = useState("");
  const [razvrsti, setRazvrsti] = useState<Razvrstitev>("potencial");
  // The arbitrage view: private sellers only, priced against what dealers ask.
  const [samoZasebniki, setSamoZasebniki] = useState(false);
  const [prikazanih, setPrikazanih] = useState(KORAK);

  const od = letnikOd ? Number(letnikOd) : null;
  const do_ = letnikDo ? Number(letnikDo) : null;
  const cOd = cenaOd.trim() === "" ? null : Number(cenaOd);
  const cDo = cenaDo.trim() === "" ? null : Number(cenaDo);

  /**
   * Everything the OTHER filters leave standing.
   *
   * The counts in the dropdowns have to be counted over this, not over the whole
   * feed: with "samo od fizičnih oseb" on, the brand list said "Vse znamke (871)"
   * while the page showed 116 deals. A count that does not match what pressing it
   * produces is worse than no count — it reads as a bug in the data.
   *
   * The brand's own choice is deliberately NOT applied here, or picking BMW would
   * leave BMW as the only brand in the list.
   */
  const zaStevce = useMemo(
    () =>
      deals.filter((d) => {
        if (od !== null || do_ !== null) {
          if (d.letnik === null) return false;
          if (od !== null && d.letnik < od) return false;
          if (do_ !== null && d.letnik > do_) return false;
        }
        if (cOd !== null && Number.isFinite(cOd) && d.cena < cOd) return false;
        if (cDo !== null && Number.isFinite(cDo) && d.cena > cDo) return false;
        if (samoZasebniki && !(d.jeDealer === false && d.medianaTrgovcev !== null)) return false;
        return true;
      }),
    [deals, od, do_, cOd, cDo, samoZasebniki]
  );

  /** Brands with a deal behind them under the current filters, most first. */
  const znamke = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of zaStevce) if (d.znamka) m.set(d.znamka, (m.get(d.znamka) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "sl"));
  }, [zaStevce]);

  /** Models of the chosen brand only — the second step of the cascade. */
  const modeli = useMemo(() => {
    if (!znamka) return [];
    const m = new Map<string, number>();
    for (const d of zaStevce) {
      if (d.znamka !== znamka || !d.modelIme) continue;
      m.set(d.modelIme, (m.get(d.modelIme) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "sl"));
  }, [zaStevce, znamka]);

  /** Year bounds taken from the data, so the range can never be empty by itself. */
  const leta = useMemo(() => {
    const vsa = deals
      .filter((d) => !samoZasebniki || (d.jeDealer === false && d.medianaTrgovcev !== null))
      .map((d) => d.letnik)
      .filter((l): l is number => l !== null);
    if (vsa.length === 0) return [];
    const min = Math.min(...vsa);
    const max = Math.max(...vsa);
    return Array.from({ length: max - min + 1 }, (_, i) => max - i);
  }, [deals, samoZasebniki]);

  const najdeni = useMemo(() => {
    const izbrani = deals.filter((d) => {
      if (znamka && d.znamka !== znamka) return false;
      if (model && d.modelIme !== model) return false;
      // A deal without a year cannot be judged against a year range, so it
      // drops out only once a range is actually set.
      if (od !== null || do_ !== null) {
        if (d.letnik === null) return false;
        if (od !== null && d.letnik < od) return false;
        if (do_ !== null && d.letnik > do_) return false;
      }
      if (cOd !== null && Number.isFinite(cOd) && d.cena < cOd) return false;
      if (cDo !== null && Number.isFinite(cDo) && d.cena > cDo) return false;
      // Only worth showing here when there IS a dealer median to compare with —
      // "cheap for a private car" without that number is a weaker claim.
      if (samoZasebniki && !(d.jeDealer === false && d.medianaTrgovcev !== null)) return false;
      return true;
    });

    const poslovne: Record<PoselRazvrstitev, (d: Deal) => number> = {
      potencial: (d) => d.potencial,
      zasluzek: (d) => d.zasluzek,
      odstotek: (d) => d.odstopanjePct,
      trgovci: (d) => d.odstopanjeTrgovciPct ?? -1,
      hitrost: (d) => d.delez14 ?? -1,
    };
    if (razvrsti in poslovne) {
      const f = poslovne[razvrsti as PoselRazvrstitev];
      return [...izbrani].sort((a, b) => f(b) - f(a));
    }
    // The shared comparator speaks the database's field names; a deal keeps its
    // price in `cena`, so it is handed over under the name it expects.
    const oglasna = primerjaj<{
      znamka: string | null;
      naziv: string | null;
      cena_eur: number;
      letnik: number | null;
      km: number | null;
    }>(razvrsti as OglasnaRazvrstitev);
    return [...izbrani].sort((a, b) =>
      oglasna(
        { znamka: a.znamka, naziv: a.naziv, cena_eur: a.cena, letnik: a.letnik, km: a.km },
        { znamka: b.znamka, naziv: b.naziv, cena_eur: b.cena, letnik: b.letnik, km: b.km }
      )
    );
  }, [deals, znamka, model, od, do_, cOd, cDo, razvrsti, samoZasebniki]);

  const filtriran = Boolean(
    znamka || model || letnikOd || letnikDo || cenaOd || cenaDo || samoZasebniki
  );

  const ponastavi = () => {
    setZnamka("");
    setModel("");
    setLetnikOd("");
    setLetnikDo("");
    setCenaOd("");
    setCenaDo("");
    setSamoZasebniki(false);
    setPrikazanih(KORAK);
  };

  return (
    <>
      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Znamka</span>
          <select
            value={znamka}
            onChange={(e) => {
              setZnamka(e.target.value);
              setModel("");
              setPrikazanih(KORAK);
            }}
            className={`${izbira} min-w-44`}
          >
            <option value="">Vse znamke ({zaStevce.length})</option>
            {znamke.map(([z, n]) => (
              <option key={z} value={z}>
                {z} ({n})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Model</span>
          <select
            value={model}
            disabled={!znamka}
            onChange={(e) => {
              setModel(e.target.value);
              setPrikazanih(KORAK);
            }}
            className={`${izbira} min-w-44`}
          >
            <option value="">{znamka ? "Vsi modeli" : "Najprej izberite znamko"}</option>
            {modeli.map(([m, n]) => (
              <option key={m} value={m}>
                {m} ({n})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Letnik od</span>
          <select
            value={letnikOd}
            onChange={(e) => {
              setLetnikOd(e.target.value);
              setPrikazanih(KORAK);
            }}
            className={izbira}
          >
            <option value="">Od</option>
            {leta
              .filter((l) => !do_ || l <= do_)
              .map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Letnik do</span>
          <select
            value={letnikDo}
            onChange={(e) => {
              setLetnikDo(e.target.value);
              setPrikazanih(KORAK);
            }}
            className={izbira}
          >
            <option value="">Do</option>
            {leta
              .filter((l) => !od || l >= od)
              .map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Cena (€)</span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              value={cenaOd}
              onChange={(e) => {
                setCenaOd(e.target.value);
                setPrikazanih(KORAK);
              }}
              placeholder="od"
              className={`${izbira} w-24`}
            />
            <span className="text-zinc-400">–</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              value={cenaDo}
              onChange={(e) => {
                setCenaDo(e.target.value);
                setPrikazanih(KORAK);
              }}
              placeholder="do"
              className={`${izbira} w-24`}
            />
          </div>
        </label>

        <label className="flex cursor-pointer items-center gap-2 self-end rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm">
          <input
            type="checkbox"
            checked={samoZasebniki}
            onChange={(e) => {
              setSamoZasebniki(e.target.checked);
              setPrikazanih(KORAK);
            }}
            className="h-4 w-4"
          />
          <span className="text-zinc-700">
            Samo od fizičnih oseb
            <span className="block text-[11px] text-zinc-400">primerjano s ceno trgovcev</span>
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Razvrsti</span>
          <select
            value={razvrsti}
            onChange={(e) => {
              setRazvrsti(e.target.value as Razvrstitev);
              setPrikazanih(KORAK);
            }}
            className={`${izbira} min-w-56`}
          >
            <optgroup label="Po priložnosti">
              {POSLOVNE.map((r) => (
                <option key={r.vrednost} value={r.vrednost}>
                  {r.oznaka}
                </option>
              ))}
            </optgroup>
            <optgroup label="Kot na Avto.netu">
              {/* Engine power and first-seen date are not part of a scored deal,
                  so those orders are left out rather than offered as no-ops. */}
              {OGLASNE.filter(
                (r) => !["novi", "stari", "moc_vec", "moc_manj"].includes(r.kljuc)
              ).map((r) => (
                <option key={r.kljuc} value={r.kljuc}>
                  {r.oznaka}
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        {filtriran && (
          <button
            type="button"
            onClick={ponastavi}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-900"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Počisti
          </button>
        )}

        <p className="ml-auto text-sm text-zinc-500">
          {najdeni.length === 0
            ? "Ni zadetkov"
            : `${najdeni.length.toLocaleString("sl-SI")} ${
                najdeni.length === 1 ? "posel" : najdeni.length === 2 ? "posla" : "poslov"
              }`}
        </p>
      </div>

      {samoZasebniki && (
        <p className="mt-3 rounded-xl bg-accent/5 px-4 py-3 text-xs text-zinc-600 ring-1 ring-accent/20">
          Prikazani so <strong>samo oglasi fizičnih oseb</strong>, cena pa je primerjana z mediano{" "}
          <strong>trgovskih</strong> oglasov istega vozila (isti model, gorivo, menjalnik in
          karoserija; nato še isti motor in podobna oprema, kolikor je primerljivih dovolj). To je
          razlika med tem, kar zahteva zasebnik, in tem, kar za enak avto zahtevajo trgovci — ne
          zajamčen zaslužek: trgovčeva cena vključuje garancijo, pripravo vozila in DDV-položaj.
        </p>
      )}

      {najdeni.length === 0 ? (
        <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Za izbrano ni nobenega posla. Poskusite širši letnik ali drug model — seznam se osveži po
          vsakem pregledu trga.
        </p>
      ) : (
        <>
          <div className="mt-4 space-y-3">
            {najdeni.slice(0, prikazanih).map((d, i) => (
              <div
                key={d.avtonetId}
                className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900">
                      <span className="mr-2 text-zinc-400">#{i + 1}</span>
                      {d.naziv ?? d.model}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-500">
                      {d.letnik ?? "?"} ·{" "}
                      {d.km === null ? "?" : `${d.km.toLocaleString("sl-SI")} km`} ·{" "}
                      {d.jeDealer === false
                        ? "zasebnik"
                        : d.jeDealer === true
                          ? "trgovec"
                          : "prodajalec neznan"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-semibold text-zinc-900">{eur(d.cena)}</p>
                    <p className="text-sm font-semibold text-emerald-600">
                      −{Math.round(d.odstopanjePct)} % pod mediano ({eur(d.medianaKohorte)})
                    </p>
                    <p className="text-xs text-zinc-500">razlika {eur(d.zasluzek)}</p>
                    {d.jeDealer === false && d.medianaTrgovcev !== null && (
                      <p className="mt-0.5 text-xs font-medium text-accent">
                        trgovci: {eur(d.medianaTrgovcev)}
                        {d.odstopanjeTrgovciPct !== null && d.odstopanjeTrgovciPct > 0 && (
                          <> (−{Math.round(d.odstopanjeTrgovciPct)} %)</>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                  {d.razlogi.map((r, j) => (
                    <li key={j} className={r.startsWith("⚠️") ? "font-medium text-amber-700" : ""}>
                      {r.startsWith("⚠️") ? (
                        <span className="inline-flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {r.replace("⚠️ ", "")}
                        </span>
                      ) : (
                        <>• {r}</>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex items-center gap-4">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
                  >
                    Odpri oglas <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <a
                    href="/avtonet/cenilnik"
                    className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
                  >
                    Oceni v cenilniku →
                  </a>
                </div>
              </div>
            ))}
          </div>

          {najdeni.length > prikazanih && (
            <button
              type="button"
              onClick={() => setPrikazanih((n) => n + KORAK)}
              className="mt-4 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50"
            >
              Prikaži več ({(najdeni.length - prikazanih).toLocaleString("sl-SI")} še)
            </button>
          )}
        </>
      )}
    </>
  );
}
