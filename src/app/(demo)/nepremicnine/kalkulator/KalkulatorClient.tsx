"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Calculator, Info } from "lucide-react";
import {
  computeFinancing,
  PROPERTY_RULES,
  ruleFor,
  type PropertyKind,
} from "@/lib/nepremicnine/financiranje";
import { capRateAtPrice, computeOfferPrice } from "@/lib/nepremicnine/ponudbenaCena";

/**
 * Investicijski kalkulator — prevzet iz Kompletko/EscortOps, ne na novo napisan.
 *
 * Vse se preračuna ob vsakem tipkanju (what-if): spremeniš najemnino ali
 * obrestno mero in vsi izidi — NOI, cap rate, obrok, denarni tok, donos na
 * vloženi denar — se premaknejo sproti. Nobene številke si ne izmišljamo:
 * kar vpišeš, je predpostavka, in tako je tudi označeno.
 */

function eur(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v)
    ? "—"
    : `${Math.round(v).toLocaleString("sl-SI")} €`;
}

const VNOS =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-accent/60 focus:outline-none";
const OZNAKA = "text-xs font-medium text-zinc-500";

export function KalkulatorClient({
  zacetek,
}: {
  /** Predizpolnjeno iz oglasa ("Analiziraj posel"), sicer smiselne privzete. */
  zacetek: {
    cena: number | null;
    enot: number | null;
    naziv: string | null;
    najemnina: number | null;
    najemninaVir: string | null;
  };
}) {
  // nakup
  const [cena, setCena] = useState(zacetek.cena ?? 300000);
  const [prenova, setPrenova] = useState(0);
  const [stroskiNakupa, setStroskiNakupa] = useState(Math.round((zacetek.cena ?? 300000) * 0.03));
  // prihodki
  const [enot, setEnot] = useState(zacetek.enot ?? 1);
  const [najemnina, setNajemnina] = useState(zacetek.najemnina ?? 700);
  const [zasedenost, setZasedenost] = useState(92);
  const [drugiPrihodkiPct, setDrugiPrihodkiPct] = useState(0);
  // stroški
  const [stroskiPct, setStroskiPct] = useState(25);
  const [stroskiFiksni, setStroskiFiksni] = useState(0);
  // financiranje
  const [vrsta, setVrsta] = useState<PropertyKind>("vecstanovanjska");
  const [pologPct, setPologPct] = useState(ruleFor("vecstanovanjska").typicalDownPct);
  const [obrestPct, setObrestPct] = useState(3.4);
  const [leta, setLeta] = useState(20);
  // zahtevani donos za ponudbeno ceno
  const [capZahtevan, setCapZahtevan] = useState(7);

  const izracun = useMemo(() => {
    const ponudba = computeOfferPrice({
      units: enot,
      monthlyRentPerUnit: najemnina,
      otherIncomePct: drugiPrihodkiPct,
      occupancyPct: zasedenost,
      expensesPct: stroskiPct,
      expensesFixed: stroskiFiksni,
      capRatePct: capZahtevan,
    });

    const vseSkupaj = cena + prenova + stroskiNakupa;
    const capPriCeni = capRateAtPrice(ponudba.noi, vseSkupaj);
    const brutoDonos = vseSkupaj > 0 ? Math.round((ponudba.grossRent / vseSkupaj) * 1000) / 10 : null;

    const fin = computeFinancing({
      price: cena,
      downPaymentPct: pologPct,
      interestRatePct: obrestPct,
      years: leta,
      noi: ponudba.noi,
      kind: vrsta,
    });

    // Donos na vloženi denar upošteva VES vloženi denar, ne samo pologa:
    // prenova in stroški nakupa so prav tako tvoj denar.
    const vlozeno = fin.downPayment + prenova + stroskiNakupa;
    const cocVse = vlozeno > 0 ? Math.round((fin.cashFlow / vlozeno) * 1000) / 10 : null;

    // Zasedenost, pri kateri denarni tok pade na nič.
    const prag =
      ponudba.grossRent > 0
        ? Math.min(
            100,
            Math.max(
              0,
              Math.round(
                (((fin.annualDebtService + stroskiFiksni) / (1 - stroskiPct / 100)) /
                  (ponudba.grossRent * (1 + drugiPrihodkiPct / 100))) *
                  100
              )
            )
          )
        : null;

    return { ponudba, fin, vseSkupaj, capPriCeni, brutoDonos, vlozeno, cocVse, prag };
  }, [cena, prenova, stroskiNakupa, enot, najemnina, zasedenost, drugiPrihodkiPct, stroskiPct, stroskiFiksni, vrsta, pologPct, obrestPct, leta, capZahtevan]);

  const { ponudba, fin, vseSkupaj, capPriCeni, brutoDonos, vlozeno, cocVse, prag } = izracun;
  const razlikaDoPonudbe = ponudba.offerPrice > 0 ? cena - ponudba.offerPrice : null;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      {/* ----- vnosi ----- */}
      <div className="space-y-4">
        {zacetek.naziv && (
          <p className="rounded-xl bg-accent/5 px-4 py-2.5 text-sm text-zinc-700 ring-1 ring-accent/20">
            Analiziraš: <strong>{zacetek.naziv}</strong>
            {zacetek.najemninaVir && (
              <span className="block text-xs text-zinc-500">{zacetek.najemninaVir}</span>
            )}
          </p>
        )}

        <section className="rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Nakup</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="col-span-2">
              <span className={OZNAKA}>Kupnina (€)</span>
              <input type="number" value={cena} onChange={(e) => setCena(Number(e.target.value))} className={VNOS} />
            </label>
            <label>
              <span className={OZNAKA}>Prenova (€)</span>
              <input type="number" value={prenova} onChange={(e) => setPrenova(Number(e.target.value))} className={VNOS} />
            </label>
            <label>
              <span className={OZNAKA}>Stroški nakupa (€)</span>
              <input type="number" value={stroskiNakupa} onChange={(e) => setStroskiNakupa(Number(e.target.value))} className={VNOS} />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Prihodki</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label>
              <span className={OZNAKA}>Št. enot</span>
              <input type="number" min={1} value={enot} onChange={(e) => setEnot(Number(e.target.value))} className={VNOS} />
            </label>
            <label>
              <span className={OZNAKA}>Najemnina/enoto (€/mes)</span>
              <input type="number" value={najemnina} onChange={(e) => setNajemnina(Number(e.target.value))} className={VNOS} />
            </label>
            <label>
              <span className={OZNAKA}>Zasedenost: {zasedenost} %</span>
              <input type="range" min={50} max={100} value={zasedenost} onChange={(e) => setZasedenost(Number(e.target.value))} className="w-full accent-accent" />
            </label>
            <label>
              <span className={OZNAKA}>Drugi prihodki (% najemnin)</span>
              <input type="number" min={0} max={30} value={drugiPrihodkiPct} onChange={(e) => setDrugiPrihodkiPct(Number(e.target.value))} className={VNOS} />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Stroški obratovanja</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label>
              <span className={OZNAKA}>Stroški: {stroskiPct} % prihodkov</span>
              <input type="range" min={5} max={50} value={stroskiPct} onChange={(e) => setStroskiPct(Number(e.target.value))} className="w-full accent-accent" />
            </label>
            <label>
              <span className={OZNAKA}>+ fiksni (€/leto)</span>
              <input type="number" value={stroskiFiksni} onChange={(e) => setStroskiFiksni(Number(e.target.value))} className={VNOS} />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-zinc-400">
            Vzdrževanje, upravljanje, zavarovanje, davki, praznine — vse razen kredita.
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Financiranje</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="col-span-2">
              <span className={OZNAKA}>Vrsta nepremičnine (pravila pologa)</span>
              <select
                value={vrsta}
                onChange={(e) => {
                  const k = e.target.value as PropertyKind;
                  setVrsta(k);
                  setPologPct(ruleFor(k).typicalDownPct);
                }}
                className={VNOS}
              >
                {PROPERTY_RULES.map((r) => (
                  <option key={r.kind} value={r.kind}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={OZNAKA}>Polog: {polog(polnaStevilka(pologPct))} %</span>
              <input type="range" min={0} max={60} value={pologPct} onChange={(e) => setPologPct(Number(e.target.value))} className="w-full accent-accent" />
            </label>
            <label>
              <span className={OZNAKA}>Obrestna mera: {obrestPct.toFixed(1)} %</span>
              <input type="range" min={1} max={8} step={0.1} value={obrestPct} onChange={(e) => setObrestPct(Number(e.target.value))} className="w-full accent-accent" />
            </label>
            <label>
              <span className={OZNAKA}>Doba (let)</span>
              <input type="number" min={5} max={30} value={leta} onChange={(e) => setLeta(Number(e.target.value))} className={VNOS} />
            </label>
            <label>
              <span className={OZNAKA}>Zahtevani donos (cap rate %)</span>
              <input type="number" min={2} max={15} step={0.5} value={capZahtevan} onChange={(e) => setCapZahtevan(Number(e.target.value))} className={VNOS} />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-zinc-400">{ruleFor(vrsta).note}</p>
        </section>
      </div>

      {/* ----- izidi ----- */}
      <div className="space-y-4">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Calculator className="h-4 w-4 text-accent" />
            Kaj nepremičnina zasluži
          </h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Vrstica oznaka="Bruto najemnine (leto)" vrednost={eur(ponudba.grossRent)} />
            {ponudba.otherIncome > 0 && <Vrstica oznaka="Drugi prihodki" vrednost={eur(ponudba.otherIncome)} />}
            <Vrstica oznaka={`Dejanski prihodki (${zasedenost} % zasedenost)`} vrednost={eur(ponudba.actualIncome)} />
            <Vrstica oznaka="Stroški obratovanja" vrednost={`− ${eur(ponudba.expenses)}`} />
            <Vrstica oznaka="NOI (neto obratovalni donos)" vrednost={eur(ponudba.noi)} krepko />
          </dl>
          {ponudba.problem && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {ponudba.problem}
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Cena in donos</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Vrstica oznaka="Vse skupaj (kupnina + prenova + stroški)" vrednost={eur(vseSkupaj)} />
            <Vrstica oznaka="Bruto donos (gross yield)" vrednost={brutoDonos !== null ? `${brutoDonos} %` : "—"} />
            <Vrstica oznaka="Cap rate pri tej ceni" vrednost={capPriCeni !== null ? `${capPriCeni} %` : "—"} krepko />
            <Vrstica
              oznaka={`Ponudbena cena pri ${capZahtevan} % donosu`}
              vrednost={ponudba.offerPrice > 0 ? eur(ponudba.offerPrice) : "—"}
            />
            {ponudba.pricePerUnit !== null && <Vrstica oznaka="Cena na enoto (pri ponudbi)" vrednost={eur(ponudba.pricePerUnit)} />}
            {enot > 0 && <Vrstica oznaka="Cena na enoto (pri kupnini)" vrednost={eur(cena / enot)} />}
          </dl>
          {razlikaDoPonudbe !== null && Math.abs(razlikaDoPonudbe) > 1000 && (
            <p
              className={`mt-3 rounded-xl px-3 py-2 text-xs ring-1 ${
                razlikaDoPonudbe > 0
                  ? "bg-amber-50 text-amber-800 ring-amber-200"
                  : "bg-emerald-50 text-emerald-800 ring-emerald-200"
              }`}
            >
              {razlikaDoPonudbe > 0
                ? `Kupnina je ${eur(razlikaDoPonudbe)} NAD ceno, ki jo pri ${capZahtevan} % donosu upravičijo najemnine. Ali se pogajaš, ali sprejmeš nižji donos.`
                : `Kupnina je ${eur(Math.abs(razlikaDoPonudbe))} POD ceno, ki jo upravičijo najemnine — pri teh predpostavkah kupuješ donos, večji od zahtevanega.`}
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Kredit in denarni tok</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Vrstica oznaka={`Polog (${pologPct} %)`} vrednost={eur(fin.downPayment)} />
            <Vrstica oznaka={`Kredit (LTV ${fin.ltvPct} %)`} vrednost={eur(fin.loan)} />
            <Vrstica oznaka="Mesečni obrok" vrednost={eur(fin.monthlyPayment)} />
            <Vrstica oznaka="Letni obroki skupaj" vrednost={`− ${eur(fin.annualDebtService)}`} />
            <Vrstica
              oznaka="Letni denarni tok (po kreditu)"
              vrednost={eur(fin.cashFlow)}
              krepko
              barva={fin.cashFlow >= 0 ? "text-emerald-700" : "text-red-600"}
            />
            <Vrstica oznaka="Mesečno" vrednost={eur(fin.monthlyCashFlow)} />
            <Vrstica oznaka="DSCR (kritje obroka z NOI)" vrednost={fin.dscr !== null ? `${fin.dscr.toFixed(2)}×` : "—"} />
            <Vrstica oznaka="Ves vloženi denar (polog + prenova + stroški)" vrednost={eur(vlozeno)} />
            <Vrstica
              oznaka="Donos na vloženi denar (cash-on-cash)"
              vrednost={cocVse !== null ? `${cocVse} %` : "—"}
              krepko
            />
            {prag !== null && <Vrstica oznaka="Prag zasedenosti (denarni tok = 0)" vrednost={`${prag} %`} />}
            <Vrstica oznaka="Skupaj obresti čez celo dobo" vrednost={eur(fin.totalInterest)} />
          </dl>
          {fin.warnings.map((w, i) => (
            <p key={i} className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {w}
            </p>
          ))}
        </section>

        <p className="flex items-start gap-2 text-xs text-zinc-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Vse številke so izračun iz TVOJIH predpostavk, ne napoved. Najemnina, zasedenost in stroški
          so tisto, kar vpišeš — kalkulator pove, kaj iz tega sledi, ne, kaj se bo zgodilo.
        </p>
      </div>
    </div>
  );
}

/** Polog je celo število odstotkov; drsnik vrača string. */
function polnaStevilka(v: number): number {
  return Math.round(v);
}
function polog(v: number): number {
  return v;
}

function Vrstica({
  oznaka,
  vrednost,
  krepko,
  barva,
}: {
  oznaka: string;
  vrednost: string;
  krepko?: boolean;
  barva?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-zinc-500">{oznaka}</dt>
      <dd className={`${krepko ? "text-base font-bold" : "font-medium"} ${barva ?? "text-zinc-900"}`}>{vrednost}</dd>
    </div>
  );
}
