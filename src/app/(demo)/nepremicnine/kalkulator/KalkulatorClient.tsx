"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Calculator, Info, Sparkles, Wallet } from "lucide-react";
import { PROPERTY_RULES, ruleFor, type PropertyKind } from "@/lib/nepremicnine/financiranje";
import { computeOfferPrice } from "@/lib/nepremicnine/ponudbenaCena";
import {
  DAVEK,
  VRSTE_AMORTIZACIJE,
  izracunajPosel,
  nazivAmortizacije,
  ocenaPosla,
  PRAGOVI,
  preveriDsti,
  projekcijaEquityja,
  refinanciranje,
  stresniTest,
  type PostavkaPrenove,
  type VnosPosla,
} from "@/lib/nepremicnine/posel";
import { predlagajFinanciranje } from "@/lib/nepremicnine/predlogFinanciranja";

/**
 * INVESTICIJSKI KALKULATOR — ista logika kot v Kompletku, na celi strani.
 *
 * Načelo strani: ZGORAJ odgovor v treh številkah, ki jih razume vsak
 * ("vložiš", "vsak mesec ti ostane", "ocena"), SPODAJ vsa globina za tistega,
 * ki hoče vedeti, od kod so prišle. Vsak strokovni izraz ima ob sebi en stavek
 * razlage — kalkulator, ki ga razumeš, je vreden več od kalkulatorja, ki mu
 * moraš verjeti.
 *
 * Vse se preračuna ob vsakem tipkanju. Nobene številke si ne izmišljamo: kar
 * vpišeš, je predpostavka in tako je tudi označeno.
 */

// ————————————————————————————————————————————————————————————————
// pomožno
// ————————————————————————————————————————————————————————————————

const eur = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${Math.round(v).toLocaleString("sl-SI")} €`;
const pct = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v.toFixed(d).replace(".", ",")} %`;
const barvaDobicka = (v: number | null | undefined) =>
  v === null || v === undefined ? "text-zinc-900" : v > 0 ? "text-emerald-700" : v < 0 ? "text-red-600" : "text-zinc-900";

const VNOS =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 tabular-nums focus:border-accent/60 focus:outline-none";

/**
 * Številčno polje, ki se da izbrisati. Kontroliran `type="number"` z Number()
 * ob vsakem tipkanju ne dovoli prazne vrednosti in vmesnih stanj ("1,") —
 * zato ima polje svoje besedilo in staršu sporoči številko šele, ko je ta
 * veljavna.
 */
function Stevilka({
  oznaka,
  vrednost,
  naSpremembo,
  pripona,
  min,
  namig,
}: {
  oznaka: string;
  vrednost: number;
  naSpremembo: (v: number) => void;
  pripona?: string;
  min?: number;
  /** En stavek: kaj to je in kaj vpisati. */
  namig?: string;
}) {
  /**
   * Polje si zapomni SVOJE besedilo in številko, ki jo je nazadnje oddalo.
   * Ko se vrednost spremeni od zunaj (klik na predlog financiranja, podatki iz
   * oglasa), se besedilo uskladi med izrisom — to je uradni vzorec za izpeljano
   * stanje in za razliko od useEffect ne povzroči drugega izrisa.
   *
   * Zakaj sploh: pri kontroliranem številskem polju z Number() ob vsakem
   * pritisku ni mogoče niti izbrisati vsebine niti napisati "1," — polje se
   * popravi pod prsti.
   */
  const [stanje, setStanje] = useState({ besedilo: String(vrednost), oddana: vrednost });
  if (stanje.oddana !== vrednost) setStanje({ besedilo: String(vrednost), oddana: vrednost });
  const besedilo = stanje.besedilo;
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-500">{oznaka}</span>
      <span className="relative mt-1 block">
        <input
          type="text"
          inputMode="decimal"
          value={besedilo}
          onChange={(e) => {
            const t = e.target.value;
            const n = Number(t.replace(",", "."));
            const veljavna = t.trim() === "" ? 0 : Number.isFinite(n) && (min === undefined || n >= min) ? n : stanje.oddana;
            setStanje({ besedilo: t, oddana: veljavna });
            if (veljavna !== stanje.oddana) naSpremembo(veljavna);
          }}
          className={`${VNOS} ${pripona ? "pr-10" : ""}`}
        />
        {pripona && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-zinc-400">{pripona}</span>
        )}
      </span>
      {namig && <span className="mt-1 block text-[11px] leading-snug text-zinc-400">{namig}</span>}
    </label>
  );
}

function Razdelek({
  st,
  naslov,
  opis,
  children,
}: {
  st: number;
  naslov: string;
  /** Kaj ta razdelek odloči — za laika. */
  opis: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
          {st}
        </span>
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">{naslov}</h2>
          <p className="text-xs text-zinc-500">{opis}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Vrstica({
  oznaka,
  vrednost,
  krepko,
  barva,
  zamik,
  razlaga,
}: {
  oznaka: string;
  vrednost: string;
  krepko?: boolean;
  barva?: string;
  zamik?: boolean;
  razlaga?: string;
}) {
  return (
    <div className={krepko ? "mt-1.5 border-t border-zinc-200 pt-1.5" : ""}>
      <div className="flex items-baseline justify-between gap-3">
        <dt className={`${zamik ? "pl-3 text-zinc-400" : "text-zinc-500"} ${krepko ? "font-medium text-zinc-700" : ""}`}>{oznaka}</dt>
        <dd className={`tabular-nums ${krepko ? "text-base font-bold" : "font-medium"} ${barva ?? "text-zinc-900"}`}>{vrednost}</dd>
      </div>
      {razlaga && <p className="text-[11px] leading-snug text-zinc-400">{razlaga}</p>}
    </div>
  );
}

// ————————————————————————————————————————————————————————————————
// privzete vrednosti
// ————————————————————————————————————————————————————————————————

/**
 * Privzetki so PREDPOSTAVKE za Slovenijo 2026 in so v vmesniku označeni kot
 * take. Vsaka ima razlog v `namig` polja, kjer se uporablja.
 */
function privzetiVnos(z: Zacetek, vrsta: PropertyKind): VnosPosla {
  const kupnina = z.cena ?? 300_000;
  return {
    kupnina,
    datumNakupa: null,
    vrednostDanes: null,
    pologPct: ruleFor(vrsta).typicalDownPct,
    obrestnaMeraPct: 3.6,
    dobaLet: 25,
    stroskiNakupa: Math.round(kupnina * 0.03),
    prenova: z.prenova ?? 0,
    rezervaPrenovePct: 10,
    drugiZacetniStroski: 0,
    vrednostPoPrenovi: null,
    postavkePrenove: [],
    kreditZaPrenovo: false,
    pologZaPrenovoPct: 30,
    stEnot: z.enot ?? 1,
    najemninaNaEnoto: z.najemnina ?? 700,
    prazninePct: 5,
    upravljanjePct: 0,
    vzdrzevanjePct: 8,
    rezervaCapexPct: 5,
    zavarovanjeLeto: 400,
    komunalaLeto: 0,
    davkiLeto: 0,
    drugiStroskiLeto: 0,
    rastVrednostiPct: 3,
    // Cilja sta nižja od ameriških privzetkov (12 % / 8 %): pri slovenskih
    // najemninah in cenah je 5 % na vloženi denar dober posel, 8 % pa razlog,
    // da še enkrat pogledaš, ali so predpostavke realne.
    ciljRoiPct: 10,
    ciljCocPct: 5,
    ciljLtvPct: 70,
    amortizacijaZgradbePct: 3,
    delezZemljiscaPct: 20,
    davcniRezim: "fizicna",
    stroskiRefinanciranja: 0,
    obrestiRefinanciranjaPct: null,
    dobaRefinanciranjaLet: null,
  };
}

type Zacetek = {
  cena: number | null;
  enot: number | null;
  naziv: string | null;
  najemnina: number | null;
  najemninaVir: string | null;
  prenova: number | null;
};

// ————————————————————————————————————————————————————————————————
// komponenta
// ————————————————————————————————————————————————————————————————

export function KalkulatorClient({ zacetek }: { zacetek: Zacetek }) {
  const [vrsta, setVrsta] = useState<PropertyKind>("vecstanovanjska");
  const [v, setV] = useState<VnosPosla>(() => privzetiVnos(zacetek, "vecstanovanjska"));
  const [razcleniPrenovo, setRazcleniPrenovo] = useState(false);
  const [capZahtevan, setCapZahtevan] = useState(7);
  const [prikaziPredloge, setPrikaziPredloge] = useState(false);
  /** Neobvezno: brez dohodka DSTI ne preverjamo — kalkulator ne ugiba plače. */
  const [netoDohodek, setNetoDohodek] = useState(0);
  const [drugiObroki, setDrugiObroki] = useState(0);

  const nastavi = <K extends keyof VnosPosla>(k: K, val: VnosPosla[K]) => setV((s) => ({ ...s, [k]: val }));
  const nastaviPostavke = (p: PostavkaPrenove[]) => nastavi("postavkePrenove", p);

  const danes = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const pravilo = ruleFor(vrsta);

  const izid = useMemo(() => {
    const f = izracunajPosel(v, danes);
    const refi = refinanciranje(v, f);
    const ocena = ocenaPosla(v, f, refi);
    const projekcija = projekcijaEquityja(f, v.rastVrednostiPct, 10);
    // Ponudbena cena pri zahtevanem cap ratu — KodaTimov dodatek: koliko je
    // stavba VREDNA glede na to, kar zasluži, ne glede na to, kar prodajalec hoče.
    const ponudba = computeOfferPrice({
      units: v.stEnot,
      monthlyRentPerUnit: v.najemninaNaEnoto,
      otherIncomePct: 0,
      occupancyPct: 100 - v.prazninePct,
      expensesPct: v.upravljanjePct + v.vzdrzevanjePct + v.rezervaCapexPct,
      expensesFixed: v.zavarovanjeLeto + v.komunalaLeto + v.davkiLeto + v.drugiStroskiLeto,
      capRatePct: capZahtevan,
    });
    const stres = stresniTest(v, f);
    return { f, refi, ocena, projekcija, ponudba, stres };
  }, [v, danes, capZahtevan]);
  const { f, refi, ocena, projekcija, ponudba, stres } = izid;

  const dsti = useMemo(
    () => preveriDsti({ obrok: f.obrok, mesecniNetoDohodek: netoDohodek, drugiMesecniObroki: drugiObroki }),
    [f.obrok, netoDohodek, drugiObroki]
  );

  const predlogi = useMemo(
    () =>
      prikaziPredloge
        ? predlagajFinanciranje({
            kupnina: v.kupnina,
            allIn: f.allIn,
            vrednost: f.vrednost,
            noi: f.noi,
            obrestnaMeraPct: v.obrestnaMeraPct,
            ciljCocPct: v.ciljCocPct,
            ciljLtvPct: v.ciljLtvPct,
            najmanjsiPologPct: pravilo.minDownPct,
          })
        : null,
    [prikaziPredloge, v.kupnina, f.allIn, f.vrednost, f.noi, v.obrestnaMeraPct, v.ciljCocPct, v.ciljLtvPct, pravilo.minDownPct]
  );

  const razsodba = {
    invest: { naziv: "Kupi", barva: "bg-emerald-600 text-white", opis: "Posel se preživlja sam in dosega tvoje cilje." },
    watch: { naziv: "Premisli", barva: "bg-amber-500 text-white", opis: "Nekaj ne štima — poglej rdeče in oranžne točke spodaj." },
    reject: { naziv: "Pusti", barva: "bg-red-600 text-white", opis: "Pri teh številkah posel jé denar ali ne dosega ciljev." },
  }[ocena.razsodba];

  const razlikaDoPonudbe = ponudba.offerPrice > 0 ? v.kupnina - ponudba.offerPrice : null;
  const najvecEquity = Math.max(...projekcija.map((p) => p.vrednost), 1);

  return (
    <div className="mt-6 space-y-6">
      {zacetek.naziv && (
        <p className="rounded-xl bg-accent/5 px-4 py-2.5 text-sm text-zinc-700 ring-1 ring-accent/20">
          Analiziraš: <strong>{zacetek.naziv}</strong>
          {zacetek.najemninaVir && <span className="block text-xs text-zinc-500">{zacetek.najemninaVir}</span>}
        </p>
      )}

      {/* ————— ODGOVOR V TREH ŠTEVILKAH ————— */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Vložiš</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">{eur(f.vlozeno)}</p>
          <p className="mt-1 text-[11px] leading-snug text-zinc-500">Tvoj denar: polog + stroški + prenova. Banka da {eur(f.kredit)}.</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Vsak mesec ti ostane</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${barvaDobicka(f.denarniTokPoDavkuMesec)}`}>{eur(f.denarniTokPoDavkuMesec)}</p>
          <p className="mt-1 text-[11px] leading-snug text-zinc-500">Po obroku in davku. Pred davkom {eur(f.denarniTokMesec)}.</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Vrne se ti na leto</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${barvaDobicka(f.cashOnCash)}`}>{pct(f.cashOnCash)}</p>
          <p className="mt-1 text-[11px] leading-snug text-zinc-500">Cash-on-cash: od vsakih 100 € tvojega denarja se ti iz najemnine vrne toliko.</p>
        </div>
        <div className={`rounded-2xl p-4 ${razsodba.barva}`}>
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">Ocena posla</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {ocena.tocke}/100 · {razsodba.naziv}
          </p>
          <p className="mt-1 text-[11px] leading-snug opacity-90">{razsodba.opis}</p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ————— VNOSI ————— */}
        <div className="space-y-4">
          <Razdelek st={1} naslov="Nepremičnina" opis="Kaj kupuješ — od tega so odvisna pravila banke za polog.">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-zinc-500">Vrsta (pravila pologa Banke Slovenije)</span>
                <select
                  value={vrsta}
                  onChange={(e) => {
                    const k = e.target.value as PropertyKind;
                    setVrsta(k);
                    nastavi("pologPct", ruleFor(k).typicalDownPct);
                  }}
                  className={`${VNOS} mt-1`}
                >
                  {PROPERTY_RULES.map((r) => (
                    <option key={r.kind} value={r.kind}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] leading-snug text-zinc-400">{pravilo.note}</span>
              </label>
              <Stevilka
                oznaka="Tržna vrednost danes"
                vrednost={v.vrednostDanes ?? 0}
                naSpremembo={(n) => nastavi("vrednostDanes", n > 0 ? n : null)}
                pripona="€"
                namig="Koliko je res vredna (cenitev, primerljive prodaje). Prazno = kupnina."
              />
              <div className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                Cena na enoto <strong className="text-zinc-800">{eur(f.cenaNaEnoto)}</strong> · vrednost na enoto{" "}
                <strong className="text-zinc-800">{eur(f.vrednostNaEnoto)}</strong>
              </div>
            </div>
          </Razdelek>

          <Razdelek st={2} naslov="Nakup" opis="Kupnina in vse, kar plačaš zraven, preden dobiš ključe.">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stevilka oznaka="Kupnina" vrednost={v.kupnina} naSpremembo={(n) => nastavi("kupnina", n)} pripona="€" />
              <Stevilka
                oznaka="Stroški nakupa"
                vrednost={v.stroskiNakupa}
                naSpremembo={(n) => nastavi("stroskiNakupa", n)}
                pripona="€"
                namig="Davek na promet (2 %), notar, vpis v zemljiško knjigo, provizija, odobritev kredita. Privzeto 3 % kupnine."
              />
              <Stevilka
                oznaka="Drugi začetni stroški"
                vrednost={v.drugiZacetniStroski}
                naSpremembo={(n) => nastavi("drugiZacetniStroski", n)}
                pripona="€"
                namig="Cenitev, projekt, oprema za oddajo, prazni meseci do prvega najemnika."
              />
            </div>
          </Razdelek>

          <Razdelek st={3} naslov="Prenova" opis="Kaj vložiš v hišo in koliko je vredna, ko je narejeno.">
            <label className="flex items-center gap-2 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={razcleniPrenovo}
                onChange={(e) => {
                  setRazcleniPrenovo(e.target.checked);
                  if (e.target.checked && v.postavkePrenove.length === 0 && v.prenova > 0) {
                    nastaviPostavke([{ naziv: nazivAmortizacije(6), znesek: v.prenova, stopnjaPct: 6 }]);
                  }
                }}
              />
              Razčleni po postavkah — za amortizacijo in davek (samo d.o.o.)
            </label>

            {!razcleniPrenovo ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Stevilka oznaka="Prenova skupaj" vrednost={v.prenova} naSpremembo={(n) => nastavi("prenova", n)} pripona="€" />
                <Stevilka
                  oznaka="Rezerva za nepredvideno"
                  vrednost={v.rezervaPrenovePct}
                  naSpremembo={(n) => nastavi("rezervaPrenovePct", n)}
                  pripona="%"
                  namig="Gradbena dela vedno najdejo še kaj. 10 % je spodnja meja."
                />
                <Stevilka
                  oznaka="Vrednost po prenovi (ARV)"
                  vrednost={v.vrednostPoPrenovi ?? 0}
                  naSpremembo={(n) => nastavi("vrednostPoPrenovi", n > 0 ? n : null)}
                  pripona="€"
                  namig="Koliko bo vredna, ko je narejeno. Prazno = vrednost danes."
                />
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {v.postavkePrenove.map((p, i) => (
                  <div key={i} className="rounded-xl bg-zinc-50 p-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                      <Stevilka
                        oznaka="Znesek"
                        vrednost={p.znesek}
                        naSpremembo={(n) => nastaviPostavke(v.postavkePrenove.map((x, j) => (j === i ? { ...x, znesek: n } : x)))}
                        pripona="€"
                      />
                      <label className="block">
                        <span className="text-xs font-medium text-zinc-500">Vrsta (amortizacijska stopnja)</span>
                        <select
                          value={p.stopnjaPct}
                          onChange={(e) => {
                            const s = Number(e.target.value);
                            nastaviPostavke(v.postavkePrenove.map((x, j) => (j === i ? { ...x, stopnjaPct: s, naziv: nazivAmortizacije(s) } : x)));
                          }}
                          className={`${VNOS} mt-1`}
                        >
                          {VRSTE_AMORTIZACIJE.map((a) => (
                            <option key={a.stopnjaPct} value={a.stopnjaPct}>
                              {a.naziv} · {a.stopnjaPct} % ({a.primeri})
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => nastaviPostavke(v.postavkePrenove.filter((_, j) => j !== i))}
                        className="self-end rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-red-50 hover:text-red-600"
                        title="Odstrani postavko"
                      >
                        ×
                      </button>
                    </div>
                    {p.znesek > 0 && (
                      <p className="mt-1 text-[11px] text-zinc-400">
                        {nazivAmortizacije(p.stopnjaPct)} · {p.stopnjaPct} % → odpis {eur(p.znesek * (p.stopnjaPct / 100))} na leto, ~
                        {Math.ceil(100 / p.stopnjaPct)} let
                      </p>
                    )}
                  </div>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => nastaviPostavke([...v.postavkePrenove, { naziv: nazivAmortizacije(20), znesek: 0, stopnjaPct: 20 }])}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    + Dodaj postavko
                  </button>
                  <span className="text-[11px] text-zinc-400">amortizacija prenove skupaj {eur(f.amortizacijaPrenove)} / leto</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Stevilka
                    oznaka="Rezerva za nepredvideno"
                    vrednost={v.rezervaPrenovePct}
                    naSpremembo={(n) => nastavi("rezervaPrenovePct", n)}
                    pripona="%"
                    namig="Gradbena dela vedno najdejo še kaj. 10 % je spodnja meja."
                  />
                  <Stevilka
                    oznaka="Vrednost po prenovi (ARV)"
                    vrednost={v.vrednostPoPrenovi ?? 0}
                    naSpremembo={(n) => nastavi("vrednostPoPrenovi", n > 0 ? n : null)}
                    pripona="€"
                    namig="Koliko bo vredna, ko je narejeno. Prazno = vrednost danes."
                  />
                </div>
              </div>
            )}
            <p className="mt-3 text-[11px] text-zinc-500">
              Skupaj prenova <strong className="text-zinc-800">{eur(f.prenovaSkupaj)}</strong>
              {f.equityIzPrenove !== null && (
                <>
                  {" "}
                  · s prenovo ustvariš{" "}
                  <strong className={barvaDobicka(f.equityIzPrenove)}>{eur(f.equityIzPrenove)}</strong> equityja (vrednost po prenovi minus vse vloženo)
                </>
              )}
            </p>
          </Razdelek>

          <Razdelek st={4} naslov="Financiranje" opis="Koliko da banka in koliko te to stane vsak mesec. Kredit se izračuna sam.">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stevilka
                oznaka="Polog"
                vrednost={v.pologPct}
                naSpremembo={(n) => nastavi("pologPct", n)}
                pripona="%"
                namig={`Za to vrsto banke zahtevajo vsaj ${pravilo.minDownPct} %, običajno ${pravilo.typicalDownPct} %.`}
              />
              <Stevilka
                oznaka="Obrestna mera"
                vrednost={v.obrestnaMeraPct}
                naSpremembo={(n) => nastavi("obrestnaMeraPct", n)}
                pripona="%"
                namig="Fiksna ali trenutna variabilna. Vpiši ponudbo banke."
              />
              <Stevilka
                oznaka="Doba kredita"
                vrednost={v.dobaLet}
                naSpremembo={(n) => nastavi("dobaLet", n)}
                pripona="let"
                namig="Banka Slovenije ročnosti stanovanjskih kreditov ne omejuje; do 30 let je bančna praksa."
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-zinc-600">
              <span>
                Kredit banke <strong className="text-zinc-900">{eur(f.kredit)}</strong>
              </span>
              <span>
                Polog <strong className="text-zinc-900">{eur(f.polog)}</strong>
              </span>
              <span>
                Mesečni obrok <strong className="text-zinc-900">{eur(f.obrok)}</strong>
              </span>
              <span>
                Obresti čez celo dobo <strong className="text-zinc-900">{eur(f.obrestiSkupaj)}</strong>
              </span>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-zinc-600">
              <input type="checkbox" checked={v.kreditZaPrenovo} onChange={(e) => nastavi("kreditZaPrenovo", e.target.checked)} />
              Kredit tudi za prenovo — znesek prenove gre v skupni kredit
            </label>
            {v.kreditZaPrenovo && (
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <Stevilka oznaka="Polog za prenovo" vrednost={v.pologZaPrenovoPct} naSpremembo={(n) => nastavi("pologZaPrenovoPct", n)} pripona="%" />
                <div className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500 sm:col-span-2">
                  Kredit za prenovo <strong className="text-zinc-800">{eur(f.kreditPrenove)}</strong> · za nakup{" "}
                  <strong className="text-zinc-800">{eur(f.kreditNakupa)}</strong> · skupaj {eur(f.kredit)}
                </div>
              </div>
            )}

            {/* DSTI — edina ZAVEZUJOČA bančna omejitev. Brez dohodka je ne
                preverjamo: kalkulator ne sme ugibati plače. */}
            <div className="mt-4 rounded-xl bg-zinc-50 p-3">
              <p className="text-xs font-medium text-zinc-700">Ali ti banka to sploh odobri (DSTI)</p>
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                Banka Slovenije zavezujoče omejuje, da gre za VSE obroke skupaj največ {PRAGOVI.dstiPct} % tvojega neto dohodka. Polog (LTV) je
                samo priporočilo — od tega sme banka odstopiti, od DSTI ne. Neobvezno; pusti prazno, če še ne veš.
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <Stevilka oznaka="Tvoj neto dohodek" vrednost={netoDohodek} naSpremembo={setNetoDohodek} pripona="€/mes" />
                <Stevilka
                  oznaka="Obstoječi obroki"
                  vrednost={drugiObroki}
                  naSpremembo={setDrugiObroki}
                  pripona="€/mes"
                  namig="Drugi krediti in lizingi. Kreditne kartice se ne štejejo."
                />
              </div>
              {dsti && (
                <p className={`mt-2 rounded-lg px-3 py-2 text-[11px] leading-snug ring-1 ${dsti.gre ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-red-50 text-red-800 ring-red-200"}`}>
                  {dsti.gre
                    ? `Obroki so ${pct(dsti.dstiPct)} tvojega dohodka — pod mejo ${PRAGOVI.dstiPct} %. Pri tem dohodku sme obrok znašati do ${eur(dsti.najvecObrok)}.`
                    : `Obroki bi bili ${pct(dsti.dstiPct)} tvojega dohodka, meja je ${PRAGOVI.dstiPct} %. Banka tega kredita praviloma ne odobri — obrok sme znašati največ ${eur(dsti.najvecObrok)} (zdaj ${eur(f.obrok)}).`}
                </p>
              )}
            </div>

            {!prikaziPredloge ? (
              <button
                type="button"
                onClick={() => setPrikaziPredloge(true)}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-accent/40 py-2 text-xs font-medium text-accent hover:bg-accent/5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Predlagaj polog in dobo kredita
              </button>
            ) : (
              predlogi && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-accent">Predlogi</span>
                    <button type="button" onClick={() => setPrikaziPredloge(false)} className="text-[11px] text-zinc-400 hover:text-zinc-700">
                      skrij
                    </button>
                  </div>
                  {predlogi.tezava && (
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">{predlogi.tezava}</p>
                  )}
                  {predlogi.ciljZgresen && (
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">{predlogi.ciljZgresen}</p>
                  )}
                  {predlogi.predlogi.map((s) => (
                    <button
                      key={s.kljuc}
                      type="button"
                      onClick={() => {
                        nastavi("pologPct", s.pologPct);
                        nastavi("dobaLet", s.dobaLet);
                      }}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left transition hover:border-accent/50 hover:bg-accent/5"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-zinc-900">{s.naziv}</span>
                        <span className="text-xs tabular-nums text-zinc-500">
                          polog <strong className="text-zinc-900">{s.pologPct} %</strong> · <strong className="text-zinc-900">{s.dobaLet} let</strong>
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-zinc-500">
                        <span>
                          CoC <strong className={s.dosezeCilj ? "text-emerald-700" : "text-zinc-800"}>{pct(s.coc)}</strong>
                        </span>
                        <span>
                          DSCR <strong className="text-zinc-800">{s.dscr.toFixed(2)}</strong>
                        </span>
                        <span>
                          LTV <strong className="text-zinc-800">{pct(s.ltv, 0)}</strong>
                        </span>
                        <span>
                          tok <strong className="text-zinc-800">{eur(s.tokMesec)}/mes</strong>
                        </span>
                        <span>
                          vložek <strong className="text-zinc-800">{eur(s.vlozeno)}</strong>
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-400">{s.zakaj}</p>
                    </button>
                  ))}
                  {predlogi.predlogi.length > 0 && (
                    <p className="text-[11px] text-zinc-400">
                      Klikni predlog in vpiše se zgoraj. Upoštevano je, da najemnina pokrije obrok z rezervo (DSCR ≥ 1,25), da tok ni negativen in
                      da polog ni pod pravili banke.
                    </p>
                  )}
                </div>
              )
            )}
          </Razdelek>

          <Razdelek st={5} naslov="Najem" opis="Koliko pride noter — in koliko mesecev na leto bo prazno.">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stevilka oznaka="Število enot" vrednost={v.stEnot} naSpremembo={(n) => nastavi("stEnot", n)} min={0} />
              <Stevilka oznaka="Najemnina na enoto" vrednost={v.najemninaNaEnoto} naSpremembo={(n) => nastavi("najemninaNaEnoto", n)} pripona="€/mes" />
              <Stevilka
                oznaka="Praznine"
                vrednost={v.prazninePct}
                naSpremembo={(n) => nastavi("prazninePct", n)}
                pripona="%"
                namig="Delež leta brez najemnika (menjave, popravila). 5 % = ~3 tedne na leto."
              />
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              {v.stEnot} × {eur(v.najemninaNaEnoto)} = <strong className="text-zinc-800">{eur(f.najemninaMesec)}</strong> na mesec · po prazninah{" "}
              <strong className="text-zinc-800">{eur(f.efektivniPrihodek)}</strong> na leto ({eur(f.efektivniPrihodek / 12)} na mesec)
            </p>
          </Razdelek>

          <Razdelek st={6} naslov="Obratovalni stroški" opis="Kar plačuješ ti kot lastnik — brez kredita. Odstotki se računajo od dejanske najemnine.">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stevilka
                oznaka="Upravljanje"
                vrednost={v.upravljanjePct}
                naSpremembo={(n) => nastavi("upravljanjePct", n)}
                pripona="%"
                namig="Če ti oddajanje vodi agencija/upravnik: običajno 5–10 % najemnine. 0, če sam."
              />
              <Stevilka
                oznaka="Vzdrževanje"
                vrednost={v.vzdrzevanjePct}
                naSpremembo={(n) => nastavi("vzdrzevanjePct", n)}
                pripona="%"
                namig="Sprotna popravila: pipe, pleskanje, kotel. 5–10 % pri starejši hiši."
              />
              <Stevilka
                oznaka="Rezerva za obnove (CAPEX)"
                vrednost={v.rezervaCapexPct}
                naSpremembo={(n) => nastavi("rezervaCapexPct", n)}
                pripona="%"
                namig="Kar odložiš za streho, okna, fasado. Zakonski minimum za skupne dele (SZ-1) je 0,20–0,30 €/m² na mesec glede na starost; za stanovanje samo normativa ni, v praksi 5–10 % najemnine."
              />
              <Stevilka oznaka="Zavarovanje" vrednost={v.zavarovanjeLeto} naSpremembo={(n) => nastavi("zavarovanjeLeto", n)} pripona="€/leto" />
              <Stevilka
                oznaka="Komunala, ki jo plačaš ti"
                vrednost={v.komunalaLeto}
                naSpremembo={(n) => nastavi("komunalaLeto", n)}
                pripona="€/leto"
                namig="Samo tisto, česar ne prevali na najemnika (skupni prostori, smeti pri hiši)."
              />
              <Stevilka
                oznaka="Davki na nepremičnino"
                vrednost={v.davkiLeto}
                naSpremembo={(n) => nastavi("davkiLeto", n)}
                pripona="€/leto"
                namig="NUSZ (občinska dajatev) in davek od premoženja. Znesek je na odločbi; okvirno 1,4–1,7 €/m² na leto v Ljubljani, 0,7–1,3 €/m² v drugih mestnih občinah."
              />
              <Stevilka oznaka="Drugi stroški" vrednost={v.drugiStroskiLeto} naSpremembo={(n) => nastavi("drugiStroskiLeto", n)} pripona="€/leto" />
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              Skupaj stroški <strong className="text-zinc-800">{eur(f.stroski)}</strong> na leto → NOI{" "}
              <strong className="text-zinc-800">{eur(f.noi)}</strong> (kar hiša zasluži pred kreditom in davkom)
            </p>
          </Razdelek>

          <Razdelek st={7} naslov="Davek" opis="Kdo je lastnik, odloči, koliko davka plačaš — in ali prenova zniža davek.">
            <div className="flex gap-1 rounded-full bg-zinc-100 p-1 text-xs font-medium">
              {(["fizicna", "doo"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => nastavi("davcniRezim", r)}
                  className={`flex-1 rounded-full px-3 py-1.5 transition ${v.davcniRezim === r ? "bg-accent text-white" : "text-zinc-600 hover:text-zinc-900"}`}
                >
                  {r === "fizicna" ? "Fizična oseba" : "D.o.o."}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-zinc-500">
              {v.davcniRezim === "fizicna"
                ? `Fizična oseba: ${DAVEK.fizicnaStopnjaPct} % od ${100 - DAVEK.fizicnaNormiraniStroskiPct} % najemnine (${DAVEK.fizicnaNormiraniStroskiPct} % normiranih stroškov). Obresti kredita in amortizacija se NE odbijejo.`
                : `D.o.o.: ${DAVEK.dooStopnjaPct} % od dobička (${DAVEK.dooStopnjaPoLetu2028Pct} % po letu 2028). Odbijejo se stroški, obresti kredita in amortizacija — zato prenova tu zasluži dvakrat.`}
            </p>
            {v.davcniRezim === "doo" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Stevilka
                  oznaka="Delež zemljišča v kupnini"
                  vrednost={v.delezZemljiscaPct}
                  naSpremembo={(n) => nastavi("delezZemljiscaPct", n)}
                  pripona="%"
                  namig="Zemljišče se nikoli ne amortizira — izloči se iz osnove."
                />
                <Stevilka
                  oznaka="Amortizacija zgradbe"
                  vrednost={v.amortizacijaZgradbePct}
                  naSpremembo={(n) => nastavi("amortizacijaZgradbePct", n)}
                  pripona="%/leto"
                  namig="ZDDPO-2 dovoli največ 3 % letno za gradbene objekte."
                />
              </div>
            )}
            <p className="mt-2 text-[11px] text-zinc-500">
              Davek <strong className="text-zinc-800">{eur(f.davekLeto)}</strong> na leto
              {v.davcniRezim === "doo" && f.prihranekAmortizacije > 0 && (
                <>
                  {" "}
                  · amortizacija ({eur(f.amortizacija)}/leto) prihrani <strong className="text-emerald-700">{eur(f.prihranekAmortizacije)}</strong> davka
                </>
              )}
            </p>
            <p className="mt-1 text-[10px] text-zinc-400">Stopnje preverjene {DAVEK.preverjeno}. To ni davčno svetovanje — pri večjem poslu vprašaj računovodjo.</p>
          </Razdelek>

          <Razdelek st={8} naslov="Cilji in predpostavke" opis="S čim primerjaš posel. To so tvoje meje, ne tržni podatki.">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stevilka oznaka="Cilj cash-on-cash" vrednost={v.ciljCocPct} naSpremembo={(n) => nastavi("ciljCocPct", n)} pripona="%" namig="Koliko naj se vrne na leto iz najemnine. V Sloveniji je 5 % dober posel, nad 8 % pa znak, da predpostavke še enkrat preveriš." />
              <Stevilka oznaka="Cilj ROI" vrednost={v.ciljRoiPct} naSpremembo={(n) => nastavi("ciljRoiPct", n)} pripona="%" namig="S kreditom, glavnico in rastjo vred." />
              <Stevilka oznaka="Največ dolga (LTV)" vrednost={v.ciljLtvPct} naSpremembo={(n) => nastavi("ciljLtvPct", n)} pripona="%" namig="Nad tem posel ne dobi točk za varnost." />
              <Stevilka oznaka="Rast vrednosti" vrednost={v.rastVrednostiPct} naSpremembo={(n) => nastavi("rastVrednostiPct", n)} pripona="%/leto" namig="Predpostavka. Nihče je ne ve — zato jo izpiši nizko." />
              <Stevilka
                oznaka="Zahtevani donos (cap rate)"
                vrednost={capZahtevan}
                naSpremembo={setCapZahtevan}
                pripona="%"
                namig="Za ponudbeno ceno v povzetku: koliko naj hiša nese brez kredita."
              />
            </div>
          </Razdelek>
        </div>

        {/* ————— POVZETEK (lepljiv) ————— */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-2xl border border-accent/30 bg-accent/[0.03] p-5">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
              <Wallet className="h-4 w-4" />
              Povzetek posla
            </h2>
            <dl className="mt-3 space-y-1 text-xs">
              <Vrstica oznaka="Kupnina" vrednost={eur(v.kupnina)} />
              <Vrstica oznaka="+ stroški nakupa" vrednost={eur(v.stroskiNakupa)} zamik />
              <Vrstica oznaka={`+ prenova${v.rezervaPrenovePct > 0 ? ` (z ${v.rezervaPrenovePct} % rezerve)` : ""}`} vrednost={eur(f.prenovaSkupaj)} zamik />
              {v.drugiZacetniStroski > 0 && <Vrstica oznaka="+ drugi začetni stroški" vrednost={eur(v.drugiZacetniStroski)} zamik />}
              <Vrstica oznaka="VSE SKUPAJ (all-in)" vrednost={eur(f.allIn)} krepko />

              <div className="pt-2" />
              <Vrstica oznaka="Kredit banke" vrednost={eur(f.kredit)} />
              {f.kreditPrenove > 0 && <Vrstica oznaka="od tega za prenovo" vrednost={eur(f.kreditPrenove)} zamik />}
              <Vrstica oznaka="Polog" vrednost={eur(f.polog)} zamik />
              <Vrstica oznaka="Gotovina za stroške in prenovo" vrednost={eur(f.gotovinaZaStroske)} zamik />
              <Vrstica oznaka="MOJ VLOŽEK" vrednost={eur(f.vlozeno)} krepko barva="text-accent" />

              <div className="pt-2" />
              <Vrstica oznaka="Mesečni obrok" vrednost={eur(f.obrok)} />
              <Vrstica oznaka="Mesečni prihodek" vrednost={eur(f.efektivniPrihodek / 12)} />
              <Vrstica oznaka="Obratovalni stroški" vrednost={`− ${eur(f.stroski / 12)}`} zamik />
              <Vrstica oznaka="DENARNI TOK / MESEC" vrednost={eur(f.denarniTokMesec)} krepko barva={barvaDobicka(f.denarniTokMesec)} />
              <Vrstica oznaka="na leto" vrednost={eur(f.denarniTok)} zamik barva={barvaDobicka(f.denarniTok)} />

              <div className="pt-2" />
              <Vrstica oznaka={`Davek (${v.davcniRezim === "doo" ? `d.o.o., ${DAVEK.dooStopnjaPct} %` : `fizična, ${DAVEK.fizicnaStopnjaPct} %`})`} vrednost={`− ${eur(f.davekLeto)}`} />
              {v.davcniRezim === "doo" && f.prihranekAmortizacije > 0 && (
                <Vrstica oznaka="amortizacija prihrani" vrednost={eur(f.prihranekAmortizacije)} zamik barva="text-emerald-700" />
              )}
              <Vrstica oznaka="PO DAVKU / MESEC" vrednost={eur(f.denarniTokPoDavkuMesec)} krepko barva={barvaDobicka(f.denarniTokPoDavkuMesec)} />

              <div className="pt-2" />
              <Vrstica oznaka="Cash-on-cash" vrednost={pct(f.cashOnCash)} barva={barvaDobicka(f.cashOnCash)} />
              <Vrstica oznaka="Donos nepremičnine" vrednost={pct(f.donosNaStrosek)} razlaga="NOI na vse vloženo — kaj hiša nese brez kredita." />
              <Vrstica oznaka="LTV" vrednost={pct(f.ltv)} />
              <Vrstica oznaka="DSCR" vrednost={f.dscr === null ? "—" : `${f.dscr.toFixed(2)}×`} />
              {f.pragZasedenosti !== null && <Vrstica oznaka="Prag zasedenosti" vrednost={pct(f.pragZasedenosti, 0)} razlaga="Pod to zasedenostjo tok pade pod nič." />}
              {f.equityIzPrenove !== null && <Vrstica oznaka="Equity iz prenove" vrednost={eur(f.equityIzPrenove)} barva={barvaDobicka(f.equityIzPrenove)} />}
            </dl>
            <p className="mt-3 text-[10px] text-zinc-400">Kredit se izračuna iz kupnine in pologa — ročno ga ni treba vpisovati.</p>
          </section>

          <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <Calculator className="h-4 w-4 text-accent" />
              Koliko je hiša vredna
            </h2>
            <p className="mt-1 text-[11px] leading-snug text-zinc-500">
              Stavba je vredna toliko, kot zasluži: NOI ÷ zahtevani donos. Ne glede na to, kar prodajalec hoče.
            </p>
            <dl className="mt-3 space-y-1 text-xs">
              <Vrstica oznaka="Cap rate pri kupnini" vrednost={pct(f.capRate)} razlaga="NOI ÷ kupnina. Tako se primerjajo stavbe med sabo." />
              <Vrstica
                oznaka="Donos na strošek"
                vrednost={pct(f.donosNaStrosek)}
                razlaga="NOI ÷ vse vloženo (s prenovo in stroški). Cap rate to ni — zato ločeno."
              />
              <Vrstica oznaka={`Ponudbena cena pri ${capZahtevan} %`} vrednost={ponudba.offerPrice > 0 ? eur(ponudba.offerPrice) : "—"} krepko />
              {ponudba.pricePerUnit !== null && <Vrstica oznaka="na enoto" vrednost={eur(ponudba.pricePerUnit)} zamik />}
            </dl>
            {razlikaDoPonudbe !== null && Math.abs(razlikaDoPonudbe) > 1000 && (
              <p className={`mt-3 rounded-xl px-3 py-2 text-[11px] leading-snug ring-1 ${razlikaDoPonudbe > 0 ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"}`}>
                {razlikaDoPonudbe > 0
                  ? `Kupnina je ${eur(razlikaDoPonudbe)} NAD ceno, ki jo pri ${capZahtevan} % donosu upravičijo najemnine. Ali se pogajaš, ali sprejmeš nižji donos.`
                  : `Kupnina je ${eur(Math.abs(razlikaDoPonudbe))} POD ceno, ki jo upravičijo najemnine — kupuješ donos, večji od zahtevanega.`}
              </p>
            )}
            {ponudba.problem && (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800 ring-1 ring-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {ponudba.problem}
              </p>
            )}
          </section>
        </aside>
      </div>

      {/* ————— KAJ TO POMENI ————— */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Kaj to pomeni — v stavkih</h2>
        <div className="mt-3 space-y-1.5 text-sm leading-relaxed text-zinc-700">
          <p>
            Vložiš <strong>{eur(f.vlozeno)}</strong> lastnega denarja, banka da <strong>{eur(f.kredit)}</strong>.
          </p>
          <p>
            Kredit odplačuješ <strong>{v.dobaLet} let</strong> po <strong>{eur(f.obrok)}</strong> na mesec; obresti čez celo dobo znesejo{" "}
            <strong>{eur(f.obrestiSkupaj)}</strong>.
          </p>
          <p>
            Tvoj equity je <strong className={barvaDobicka(f.equity)}>{eur(f.equity)}</strong> (vrednost {eur(f.vrednost)} minus dolg {eur(f.saldoKredita)}).
          </p>
          <p>
            Nepremičnina nese <strong>{pct(f.donosNaStrosek)}</strong> na leto, kredit stane <strong>{pct(v.obrestnaMeraPct)}</strong> — razlika{" "}
            <strong className={barvaDobicka(f.razlikaDoObresti)}>{pct(f.razlikaDoObresti)}</strong>{" "}
            {f.razlikaDoObresti !== null && f.razlikaDoObresti >= 0 ? "dela zate." : "dela PROTI tebi: kredit stane več, kot hiša nese."}
          </p>
          <p>
            Vsak mesec ti ostane <strong className={barvaDobicka(f.denarniTokMesec)}>{eur(f.denarniTokMesec)}</strong>, na leto{" "}
            <strong className={barvaDobicka(f.denarniTok)}>{eur(f.denarniTok)}</strong> — to je <strong>{pct(f.cashOnCash)}</strong> na vloženi denar.
          </p>
          <p className="text-zinc-500">
            Skupaj na leto {eur(f.celotniDonosLeto)} = najemnina {eur(f.denarniTok)} + odplačana glavnica {eur(f.glavnicaLetos)} + rast vrednosti{" "}
            {eur(f.rastLeto)} → <strong className="text-zinc-800">ROI {pct(f.roi)}</strong>.
          </p>
          {f.equityIzPrenove !== null && (
            <p className="text-zinc-500">
              S prenovo ustvariš <strong className={barvaDobicka(f.equityIzPrenove)}>{eur(f.equityIzPrenove)}</strong> equityja (vrednost po prenovi{" "}
              {eur(f.arv)} minus vse vloženo {eur(f.allIn)}).
            </p>
          )}
          <p>
            Davek ({v.davcniRezim === "doo" ? `d.o.o., ${DAVEK.dooStopnjaPct} % od dobička` : `fizična oseba, ${DAVEK.fizicnaStopnjaPct} % od ${100 - DAVEK.fizicnaNormiraniStroskiPct} % najemnine`}):{" "}
            <strong>{eur(f.davekLeto)}</strong> na leto — po davku ti ostane{" "}
            <strong className={barvaDobicka(f.denarniTokPoDavkuMesec)}>{eur(f.denarniTokPoDavkuMesec)}</strong> na mesec.
            {v.davcniRezim === "doo" && f.prihranekAmortizacije > 0 && (
              <>
                {" "}
                Amortizacija ({eur(f.amortizacija)}/leto) prihrani <strong className="text-emerald-700">{eur(f.prihranekAmortizacije)}</strong> davka na leto.
              </>
            )}
          </p>
          {f.pragZasedenosti !== null && (
            <p className="text-zinc-500">
              Če zasedenost pade pod <strong className="text-zinc-800">{pct(f.pragZasedenosti, 0)}</strong>, denarni tok pade pod nič.
            </p>
          )}
          {f.kredit > 0 && (
            <p className={stres.zdrzi ? "text-zinc-500" : "rounded-lg bg-amber-50 px-3 py-2 text-amber-800"}>
              Če obresti zrastejo za {PRAGOVI.stresObrestiTocke} odstotni točki (na {pct(stres.novaObrest)}), se obrok podraži za{" "}
              <strong>{eur(stres.razlikaObroka)}</strong> na {eur(stres.obrok)} in ostane ti{" "}
              <strong className={barvaDobicka(stres.denarniTokMesec)}>{eur(stres.denarniTokMesec)}</strong> na mesec —{" "}
              {stres.zdrzi ? "posel to zdrži." : "posel tega ne zdrži. Pri variabilni obrestni meri je to pravo vprašanje, ne današnji donos."}
            </p>
          )}
        </div>
      </section>

      {/* ————— OCENA ————— */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Ocena posla — {ocena.tocke}/100</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${razsodba.barva}`}>{razsodba.naziv}</span>
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">
          Sedem preverb, 100 točk. Denarni tok šteje največ: posel, ki vsak mesec jé denar, nikoli ne dobi ocene „Kupi“, ne glede na ostalo.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {ocena.preverbe.map((p) => (
            <li key={p.kljuc} className="rounded-xl bg-zinc-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                  <span className={`h-2.5 w-2.5 rounded-full ${p.stanje === "ok" ? "bg-emerald-500" : p.stanje === "opozorilo" ? "bg-amber-500" : "bg-red-500"}`} />
                  {p.naziv}
                </span>
                <span className="text-xs tabular-nums text-zinc-500">
                  {p.tocke}/{p.najvecTock}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200">
                <div
                  className={`h-full rounded-full ${p.stanje === "ok" ? "bg-emerald-500" : p.stanje === "opozorilo" ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${(p.tocke / p.najvecTock) * 100}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-zinc-700">{p.podrobnost}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">{p.razlaga}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ————— 10 LET ————— */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Kaj bo čez 10 let</h2>
        <p className="mt-1 text-[11px] text-zinc-500">
          Dolg pada z vsakim obrokom, vrednost (predpostavka {pct(v.rastVrednostiPct)} na leto) raste — kar je vmes, je tvoje. Svetli del stolpca je dolg, temni tvoj equity.
        </p>
        <div className="mt-4 grid grid-cols-10 items-end gap-1.5" style={{ height: 140 }}>
          {projekcija.map((p) => (
            <div key={p.leto} className="flex h-full flex-col justify-end" title={`Leto ${p.leto}: vrednost ${eur(p.vrednost)}, dolg ${eur(p.saldo)}, equity ${eur(p.equity)}`}>
              <div className="w-full rounded-t bg-accent/25" style={{ height: `${(p.saldo / najvecEquity) * 100}%` }} />
              <div className="w-full rounded-b bg-accent" style={{ height: `${(p.equity / najvecEquity) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-10 gap-1.5 text-center text-[10px] text-zinc-400">
          {projekcija.map((p) => (
            <span key={p.leto}>{p.leto}</span>
          ))}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Leto</th>
                <th className="py-1 pr-3 font-medium">Vrednost</th>
                <th className="py-1 pr-3 font-medium">Dolg</th>
                <th className="py-1 pr-3 font-medium">Equity</th>
                <th className="py-1 font-medium">Denarni tok skupaj</th>
              </tr>
            </thead>
            <tbody className="text-zinc-800">
              {projekcija
                .filter((p) => [1, 3, 5, 10].includes(p.leto))
                .map((p) => (
                  <tr key={p.leto} className="border-t border-zinc-100">
                    <td className="py-1 pr-3">{p.leto}</td>
                    <td className="py-1 pr-3">{eur(p.vrednost)}</td>
                    <td className="py-1 pr-3">{eur(p.saldo)}</td>
                    <td className="py-1 pr-3 font-medium text-emerald-700">{eur(p.equity)}</td>
                    <td className={`py-1 ${barvaDobicka(f.denarniTok)}`}>{eur(f.denarniTok * p.leto)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600">
          <p className="font-medium text-zinc-800">Refinanciranje pri ciljnem LTV {v.ciljLtvPct} %</p>
          <p className="mt-1 leading-snug">
            Banka bi lahko dala do <strong className="text-zinc-900">{eur(refi.novKredit)}</strong>; po poplačilu obstoječega dolga bi ti ostalo{" "}
            <strong className={barvaDobicka(refi.izplacilo)}>{eur(refi.izplacilo)}</strong> (nov obrok {eur(refi.novObrok)}, nov tok {eur(refi.novDenarniTok)} na leto).
            To je aritmetika, ne odobritev — banka naroči svojo cenitev in določi LTV.
          </p>
        </div>
      </section>

      <p className="flex items-start gap-2 text-xs text-zinc-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Vse številke so izračun iz TVOJIH predpostavk, ne napoved. Najemnina, praznine, stroški in rast vrednosti so tisto, kar vpišeš — kalkulator
        pove, kaj iz tega sledi, ne, kaj se bo zgodilo. Davčne stopnje so preverjene {DAVEK.preverjeno}; to ni davčno ali finančno svetovanje.
      </p>
    </div>
  );
}
