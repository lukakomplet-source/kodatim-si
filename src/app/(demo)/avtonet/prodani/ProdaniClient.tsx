"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText, TrendingDown } from "lucide-react";
import { eur } from "@/lib/avtonet/analiza";

/**
 * Seznam prodanih (izginulih) avtov z opremo, gibanjem cene in PDF arhivom.
 *
 * Filtri gredo skozi URL (GET obrazec), ker se podatki berejo na strežniku in
 * se stran lahko deli ali osveži brez izgube izbire. PDF-ji se dobijo v enem
 * klicu za vse prikazane vrstice, ker je arhiv indeksiran po id oglasa.
 */

export type Prodan = {
  avtonetId: string;
  url: string;
  naziv: string | null;
  znamka: string | null;
  model: string | null;
  letnik: number | null;
  km: number | null;
  kw: number | null;
  gorivo: string | null;
  zadnjaCena: number;
  prvotnaCena: number | null;
  izginil: string | null;
  objavljen: string;
  dniNaTrgu: number | null;
  jeDealer: boolean | null;
  lokacija: string | null;
  izvedenka: string | null;
  generacija: string | null;
  serijaOpis: string | null;
  pogon: string | null;
  menjalnik: string | null;
  oprema: string[];
  opremaTeza: number | null;
  oznacenProdano: boolean;
};

type PdfVerzija = { id: number; razlog: string; cena: number | null; ustvarjen: string };

type Povzetek = {
  medianaCene: number | null;
  medianaDni: number | null;
  hitrihPct: number | null;
  znizaliPct: number | null;
  povprecnoZnizanje: number | null;
  zasebnikovPct: number | null;
};

const LEPA_OPREMA: Record<string, string> = {
  matrix_led: "Matrix LED",
  laser_luci: "laserski žarometi",
  zracno_vzmetenje: "zračno vzmetenje",
  adaptivno_vzmetenje: "adaptivno vzmetenje",
  keramicne_zavore: "keramične zavore",
  sport_chrono: "Sport Chrono",
  zadnje_krmiljenje: "krmiljenje zadnjih koles",
  sport_diferencial: "športni diferencial",
  panorama: "panorama",
  hud: "head-up",
  kamera_360: "kamera 360",
  premium_audio: "premium avdio",
  sedezi_hlajenje: "hlajeni sedeži",
  sedezi_masaza: "masažni sedeži",
  sportni_izpuh: "športni izpuh",
  nocni_vid: "nočni vid",
  skoljkasti_sedezi: "športne školjke",
  karbon_paket: "karbon",
  paket_m_sport: "M Sport",
  paket_amg: "AMG Line",
  paket_sline: "S line",
  acc: "adaptivni tempomat",
  streha_odpiranje: "pomična streha",
  memory_sedezi: "memory sedeži",
  vlecna: "vlečna",
  keyless: "keyless",
  sedezi_gretje: "gretje sedežev",
};

const TEZKA = new Set([
  "zracno_vzmetenje", "adaptivno_vzmetenje", "keramicne_zavore", "sport_chrono",
  "zadnje_krmiljenje", "sport_diferencial",
]);

function lepo(k: string): string {
  return LEPA_OPREMA[k] ?? k.replace(/_/g, " ");
}

function datum(iso: string | null): string {
  return iso ? iso.split("-").reverse().join(".") : "—";
}

const izbira =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-accent";

export function ProdaniClient({
  prodani,
  znamke,
  izbranaZnamka,
  izbranModel,
  dni,
  stran,
  naStran,
  skupaj,
  povzetek,
  opremaUcinek,
}: {
  prodani: Prodan[];
  znamke: string[];
  izbranaZnamka: string;
  izbranModel: string;
  dni: number;
  stran: number;
  naStran: number;
  skupaj: number;
  povzetek: Povzetek;
  opremaUcinek: { ime: string; hitriPct: number; pocasniPct: number; razlika: number }[];
}) {
  const [pdfji, setPdfji] = useState<Record<string, PdfVerzija[] | null>>({});
  const [odprt, setOdprt] = useState<string | null>(null);

  // Arhiv za vse prikazane vrstice v enem klicu; brez tega bi vsaka vrstica
  // sprožila svojo poizvedbo ob vsakem izrisu.
  useEffect(() => {
    const idji = prodani.map((p) => p.avtonetId);
    if (idji.length === 0) return;
    let odpovedano = false;
    const t = setTimeout(() => {
      fetch(`/api/avtonet/pdfji?ids=${idji.slice(0, 60).join(",")}`)
        .then((r) => (r.ok ? r.json() : { verzije: {} }))
        .then((data: { verzije: Record<string, PdfVerzija[]> }) => {
          if (odpovedano) return;
          setPdfji(Object.fromEntries(idji.map((i) => [i, data.verzije[i] ?? null])));
        })
        .catch(() => {});
    }, 0);
    return () => {
      odpovedano = true;
      clearTimeout(t);
    };
  }, [prodani]);

  const strani = Math.ceil(skupaj / naStran);
  const povezava = (p: Record<string, string | number>) => {
    const u = new URLSearchParams();
    if (izbranaZnamka) u.set("znamka", izbranaZnamka);
    if (izbranModel) u.set("model", izbranModel);
    u.set("dni", String(dni));
    for (const [k, v] of Object.entries(p)) u.set(k, String(v));
    return `/avtonet/prodani?${u.toString()}`;
  };

  return (
    <div className="mt-6">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Znamka</span>
          <select name="znamka" defaultValue={izbranaZnamka} className={`${izbira} min-w-44`}>
            <option value="">Vse znamke</option>
            {znamke.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Model</span>
          <input
            name="model"
            defaultValue={izbranModel}
            placeholder="npr. serija 5"
            className={`${izbira} w-44`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Obdobje</span>
          <select name="dni" defaultValue={String(dni)} className={`${izbira} min-w-40`}>
            <option value="7">zadnjih 7 dni</option>
            <option value="30">zadnjih 30 dni</option>
            <option value="90">zadnjih 90 dni</option>
            <option value="365">zadnje leto</option>
            <option value="3650">vse, kar imamo</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Pokaži
        </button>
      </form>

      <div className="mt-5 grid gap-px overflow-hidden rounded-xl bg-zinc-200 ring-1 ring-zinc-200 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { o: "Šlo z oglasnika", v: skupaj.toLocaleString("sl-SI"), p: "v izbranem obdobju" },
          {
            o: "Mediana cene",
            v: povzetek.medianaCene !== null ? eur(povzetek.medianaCene) : "—",
            p: "zadnja zahtevana",
          },
          {
            o: "Mediana dni na trgu",
            v: povzetek.medianaDni !== null ? `${povzetek.medianaDni}` : "—",
            p: povzetek.hitrihPct !== null ? `${povzetek.hitrihPct} % v ≤ 14 dneh` : "",
          },
          {
            o: "Znižali ceno",
            v: povzetek.znizaliPct !== null ? `${povzetek.znizaliPct} %` : "—",
            p: povzetek.povprecnoZnizanje !== null ? `povprečno −${povzetek.povprecnoZnizanje} %` : "",
          },
          {
            o: "Od zasebnikov",
            v: povzetek.zasebnikovPct !== null ? `${povzetek.zasebnikovPct} %` : "—",
            p: "ostalo trgovci",
          },
        ].map((k) => (
          <div key={k.o} className="bg-white px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{k.o}</p>
            <p className="mt-0.5 text-xl font-semibold text-zinc-900">{k.v}</p>
            {k.p && <p className="text-[11px] text-zinc-400">{k.p}</p>}
          </div>
        ))}
      </div>

      {opremaUcinek.length > 0 && (
        <details className="mt-5 rounded-xl bg-white px-4 py-3 ring-1 ring-zinc-200">
          <summary className="cursor-pointer text-sm font-medium text-zinc-800">
            Katera oprema je bila na avtih, ki so šli hitro
          </summary>
          <p className="mt-2 text-xs text-zinc-500">
            Primerjava opreme avtov, ki so šli v ≤ 14 dneh, proti tistim, ki so na trgu stali 45 dni
            ali več. Odstotek pove, na kolikšnem deležu avtov je bila lastnost prisotna. To je
            povezava, ne dokaz vzroka — dražji avti z bogato opremo imajo tudi druge prednosti.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="pb-1 pr-3 font-medium">Oprema</th>
                  <th className="pb-1 pr-3 text-right font-medium">Hitri (≤14 dni)</th>
                  <th className="pb-1 pr-3 text-right font-medium">Počasni (45+ dni)</th>
                  <th className="pb-1 text-right font-medium">Razlika</th>
                </tr>
              </thead>
              <tbody>
                {opremaUcinek.slice(0, 12).map((o) => (
                  <tr key={o.ime} className="border-t border-zinc-100">
                    <td className="py-1 pr-3 text-zinc-800">{lepo(o.ime)}</td>
                    <td className="py-1 pr-3 text-right tabular-nums text-zinc-600">{o.hitriPct} %</td>
                    <td className="py-1 pr-3 text-right tabular-nums text-zinc-600">{o.pocasniPct} %</td>
                    <td
                      className={`py-1 text-right font-semibold tabular-nums ${
                        o.razlika > 0 ? "text-emerald-700" : "text-zinc-400"
                      }`}
                    >
                      {o.razlika > 0 ? "+" : ""}
                      {o.razlika}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {prodani.length === 0 ? (
        <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          V izbranem obdobju ni izginulih oglasov s temi filtri.
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {prodani.map((p) => {
            const verzije = pdfji[p.avtonetId];
            const znizanje =
              p.prvotnaCena !== null && p.prvotnaCena > p.zadnjaCena
                ? Math.round(((p.prvotnaCena - p.zadnjaCena) / p.prvotnaCena) * 100)
                : null;
            const jeOdprt = odprt === p.avtonetId;
            return (
              <li key={p.avtonetId} className="rounded-xl bg-white px-4 py-3 ring-1 ring-zinc-200">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-zinc-900">{p.naziv ?? "—"}</p>
                    <p className="mt-0.5 text-sm text-zinc-500">
                      {p.letnik ?? "?"} · {p.km === null ? "? km" : `${p.km.toLocaleString("sl-SI")} km`}
                      {p.kw ? ` · ${p.kw} kW` : ""} ·{" "}
                      {p.jeDealer === false ? "zasebnik" : p.jeDealer === true ? "trgovec" : "prodajalec neznan"}
                      {p.lokacija ? ` · ${p.lokacija}` : ""}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                      {[p.izvedenka, p.serijaOpis ?? p.generacija, p.pogon !== "?" ? p.pogon?.toUpperCase() : null, p.menjalnik !== "?" ? p.menjalnik : null]
                        .filter(Boolean)
                        .map((x, i) => (
                          <span key={i} className="rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-700">
                            {x}
                          </span>
                        ))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-zinc-900">{eur(p.zadnjaCena)}</p>
                    {znizanje !== null && (
                      <p className="flex items-center justify-end gap-1 text-xs font-medium text-amber-700">
                        <TrendingDown className="h-3.5 w-3.5" />
                        z {eur(p.prvotnaCena as number)} (−{znizanje} %)
                      </p>
                    )}
                    <p className="text-xs text-zinc-500">
                      izginil {datum(p.izginil)}
                      {p.dniNaTrgu !== null ? ` · ${p.dniNaTrgu} dni na trgu` : ""}
                    </p>
                    {p.oznacenProdano && (
                      <p className="text-[11px] font-medium text-emerald-700">vir označil: prodano</p>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {p.oprema.length > 0 && (
                    <button
                      onClick={() => setOdprt(jeOdprt ? null : p.avtonetId)}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      {jeOdprt ? "skrij opremo" : `oprema (${p.oprema.length})`}
                    </button>
                  )}
                  {verzije && verzije.length > 0 ? (
                    verzije.map((v, i) => (
                      <a
                        key={v.id}
                        href={`/api/avtonet/pdf/${v.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent/20"
                      >
                        <FileText className="h-3 w-3" />
                        {i === 0 ? "PDF s slikami" : `PDF ${v.cena !== null ? eur(v.cena) : ""}`}
                      </a>
                    ))
                  ) : (
                    <span className="text-[11px] text-zinc-400">
                      {verzije === undefined ? "…" : "PDF ni bil arhiviran (oglas je izginil pred arhivom)"}
                    </span>
                  )}
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-accent hover:underline"
                  >
                    izvirnik <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                {jeOdprt && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-zinc-100 pt-2">
                    {p.oprema.map((o) => (
                      <span
                        key={o}
                        className={`rounded px-1.5 py-0.5 text-[11px] ${
                          TEZKA.has(o)
                            ? "bg-emerald-100 font-medium text-emerald-800"
                            : "bg-zinc-100 text-zinc-700"
                        }`}
                      >
                        {lepo(o)}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {strani > 1 && (
        <div className="mt-5 flex items-center justify-between text-sm">
          <span className="text-zinc-500">
            Stran {stran} od {strani}
          </span>
          <div className="flex gap-2">
            {stran > 1 && (
              <a href={povezava({ stran: stran - 1 })} className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:border-accent">
                ← Prejšnja
              </a>
            )}
            {stran < strani && (
              <a href={povezava({ stran: stran + 1 })} className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:border-accent">
                Naslednja →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
