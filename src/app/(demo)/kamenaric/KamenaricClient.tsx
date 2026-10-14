"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  ChevronRight,
  Package,
  Phone,
  RotateCcw,
  Send,
  ShoppingBag,
  Sparkles,
  Truck,
  Upload,
  X,
} from "lucide-react";
import Ilustracija from "./Ilustracija";
import Skatla3D from "./Skatla3D";
import {
  IZDELKI,
  KATEGORIJE,
  KONTAKT,
  PAKETI,
  POSTOPKI,
  TISKI,
  VSEBINA_PAKETOV,
  eur,
  izracun,
  type Izdelek,
  type Paket,
} from "./podatki";

type Postavka = { id: string; izdelek: Izdelek; kolicina: number; tiskId: string; logo: string | null };

const KRAFT = "#c69c6d";

export default function KamenaricClient({ zacetniPaket }: { zacetniPaket: Paket }) {
  const [paket, setPaketState] = useState<Paket>(zacetniPaket);
  const [logo, setLogo] = useState<string | null>(null);
  const [kosarica, setKosarica] = useState<Postavka[]>([]);
  const [kosaricaOdprta, setKosaricaOdprta] = useState(false);
  const [konfigurator, setKonfigurator] = useState<Izdelek | null>(null);
  const [potrdilo, setPotrdilo] = useState<string | null>(null);

  function setPaket(p: Paket) {
    setPaketState(p);
    const url = new URL(window.location.href);
    url.searchParams.set("paket", String(p));
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function dodaj(p: Omit<Postavka, "id">) {
    setKosarica((k) => [...k, { ...p, id: `${p.izdelek.id}-${k.length}-${p.kolicina}` }]);
    setKosaricaOdprta(true);
  }

  const skupaj = kosarica.reduce((s, p) => s + izracun(p.izdelek, p.kolicina, p.tiskId).skupaj, 0);

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-[#f3efe8] antialiased selection:bg-[#ff5a1f] selection:text-black">
      <style>{`
        @keyframes km-trak { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes km-vrti { from { transform: rotateY(0deg) } to { transform: rotateY(360deg) } }
        .km-trak { animation: km-trak 28s linear infinite }
        .km-vrtenje { animation: km-vrti 18s linear infinite }
        @media (prefers-reduced-motion: reduce) { .km-trak, .km-vrtenje { animation: none } }
      `}</style>

      <DemoVrstica paket={paket} setPaket={setPaket} />

      <Glava paket={paket} stevilo={kosarica.length} odpriKosarico={() => setKosaricaOdprta(true)} />

      <Hero paket={paket} logo={logo} />

      <Trak />

      <Kategorije />

      <Postopki />

      {paket === 1 && <Povprasevanje logo={logo} setLogo={setLogo} />}

      {paket >= 2 && <Trgovina odpri={setKonfigurator} />}

      {paket === 3 && <Portal logo={logo} setLogo={setLogo} dodaj={dodaj} />}

      <KajDobite paket={paket} setPaket={setPaket} />

      <Noga />

      {konfigurator && (
        <Konfigurator
          izdelek={konfigurator}
          logo={logo}
          setLogo={setLogo}
          zapri={() => setKonfigurator(null)}
          dodaj={(p) => {
            dodaj(p);
            setKonfigurator(null);
          }}
        />
      )}

      {kosaricaOdprta && (
        <Kosarica
          postavke={kosarica}
          skupaj={skupaj}
          odstrani={(id) => setKosarica((k) => k.filter((p) => p.id !== id))}
          zapri={() => setKosaricaOdprta(false)}
          oddaj={() => {
            setPotrdilo(`KM-2026-${String(140 + kosarica.length).padStart(4, "0")}`);
            setKosarica([]);
            setKosaricaOdprta(false);
          }}
        />
      )}

      {potrdilo && <Potrdilo st={potrdilo} zapri={() => setPotrdilo(null)} />}
    </div>
  );
}

/* ───────────────────────── demo vrstica ───────────────────────── */

function DemoVrstica({ paket, setPaket }: { paket: Paket; setPaket: (p: Paket) => void }) {
  return (
    <div className="sticky top-0 z-50 border-b border-white/10 bg-[#ff5a1f] text-black">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2">
        <p className="text-[11px] font-black uppercase tracking-[0.2em]">
          Predogled · KodaTim.si <span className="hidden sm:inline">— izberite različico</span>
        </p>
        <div className="flex gap-1">
          {PAKETI.map((p) => (
            <button
              key={p.st}
              onClick={() => setPaket(p.st)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-black uppercase tracking-wide transition ${
                paket === p.st ? "bg-black text-[#ff5a1f]" : "bg-black/10 hover:bg-black/20"
              }`}
            >
              <span className="text-base leading-none">{p.st}</span>
              <span className="hidden sm:inline">{p.ime}</span>
            </button>
          ))}
          <a href="#kaj-dobite" className="ml-1 hidden items-center px-3 text-xs font-bold underline underline-offset-4 md:flex">
            Kaj dobim?
          </a>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── glava ───────────────────────── */

function Glava({ paket, stevilo, odpriKosarico }: { paket: Paket; stevilo: number; odpriKosarico: () => void }) {
  return (
    <header className="border-b border-white/10">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5">
        <a href="#" className="group flex items-baseline gap-2">
          <span className="text-2xl font-black uppercase tracking-tighter sm:text-3xl">Kamenarič</span>
          <span className="h-2.5 w-2.5 bg-[#ff5a1f]" />
        </a>
        <nav className="hidden items-center gap-7 text-sm font-semibold uppercase tracking-wide text-white/70 lg:flex">
          <a href="#izdelki" className="hover:text-white">Izdelki</a>
          <a href="#tisk" className="hover:text-white">Tisk</a>
          {paket >= 2 && <a href="#trgovina" className="hover:text-white">Trgovina</a>}
          {paket === 3 && <a href="#portal" className="hover:text-white">Portal za podjetja</a>}
          <a href={paket === 1 ? "#povprasevanje" : "#trgovina"} className="hover:text-white">
            {paket === 1 ? "Povpraševanje" : "Naroči"}
          </a>
        </nav>
        <div className="flex items-center gap-2">
          {paket === 3 && (
            <a href="#portal" className="hidden border border-white/20 px-3 py-2 text-xs font-bold uppercase tracking-wide hover:border-white sm:block">
              Prijava podjetja
            </a>
          )}
          {paket >= 2 && (
            <button onClick={odpriKosarico} className="relative border border-white/20 p-2.5 hover:border-white" aria-label="Košarica">
              <ShoppingBag className="h-5 w-5" />
              {stevilo > 0 && (
                <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center bg-[#ff5a1f] px-1 text-[11px] font-black text-black">
                  {stevilo}
                </span>
              )}
            </button>
          )}
          <a
            href={KONTAKT.telefonHref}
            className="flex items-center gap-2 bg-[#f3efe8] px-4 py-2.5 text-sm font-black text-black hover:bg-white"
          >
            <Phone className="h-4 w-4" />
            <span className="hidden sm:inline">{KONTAKT.telefon}</span>
          </a>
        </div>
      </div>
    </header>
  );
}

/* ───────────────────────── hero ───────────────────────── */

function Hero({ paket, logo }: { paket: Paket; logo: string | null }) {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-14 lg:grid-cols-[1.25fr_1fr] lg:pb-24 lg:pt-20">
        <div>
          <p className="mb-6 inline-flex items-center gap-2 border border-white/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-white/60">
            <span className="h-1.5 w-1.5 bg-[#ff5a1f]" /> Embalaža · Tisk · Poslovna darila
          </p>
          <h1 className="text-[clamp(3rem,9vw,8rem)] font-black uppercase leading-[0.85] tracking-tighter">
            Embalaža,
            <br />
            ki <span className="text-[#ff5a1f]">prodaja</span>.
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-white/70">
            Vrečke, škatle, trakovi, koledarji in darila z vašim logotipom. Od ideje do tiska — tampotisk,
            globoki, slepi in reliefni tisk pod eno streho.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <a
              href={paket === 1 ? "#povprasevanje" : "#trgovina"}
              className="group flex items-center gap-3 bg-[#ff5a1f] px-7 py-4 text-sm font-black uppercase tracking-wide text-black hover:bg-[#ff7a45]"
            >
              {paket === 1 ? "Pošlji povpraševanje" : "Sestavi naročilo"}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </a>
            <a
              href="#izdelki"
              className="flex items-center gap-3 border border-white/25 px-7 py-4 text-sm font-black uppercase tracking-wide hover:border-white"
            >
              Poglej izdelke
            </a>
          </div>
          <dl className="mt-14 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-6">
            {[
              ["6", "postopkov tiska"],
              ["50+", "kosov že od"],
              [paket === 1 ? "24 h" : "24/7", paket === 1 ? "odgovor na povpraševanje" : "naročanje na spletu"],
            ].map(([a, b]) => (
              <div key={b}>
                <dt className="text-3xl font-black">{a}</dt>
                <dd className="mt-1 text-xs uppercase tracking-wide text-white/50">{b}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex flex-col items-center">
          <Skatla3D logo={logo} barva={KRAFT} velikost={230} />
          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-white/40">Zavrti me ↻</p>
        </div>
      </div>
    </section>
  );
}

function Trak() {
  const besede = ["Vrečke z logotipom", "Kartonske škatle", "Tampotisk", "Reliefni tisk", "Darilni trakovi", "Koledarji", "Poslovna darila", "QR embalaža"];
  const vrsta = [...besede, ...besede];
  return (
    <div className="overflow-hidden border-y border-white/10 bg-[#f3efe8] py-4 text-black">
      <div className="km-trak flex w-max gap-10 whitespace-nowrap">
        {vrsta.map((b, i) => (
          <span key={i} className="flex items-center gap-10 text-2xl font-black uppercase tracking-tight">
            {b} <span className="h-3 w-3 bg-[#ff5a1f]" />
          </span>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── kategorije in tisk ───────────────────────── */

function Naslov({ oznaka, children, id }: { oznaka: string; children: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="mb-12 flex scroll-mt-20 flex-wrap items-end justify-between gap-4">
      <h2 className="text-[clamp(2.2rem,5vw,4.5rem)] font-black uppercase leading-[0.9] tracking-tighter">{children}</h2>
      <span className="text-xs font-bold uppercase tracking-[0.25em] text-white/40">{oznaka}</span>
    </div>
  );
}

function Kategorije() {
  const slika: Record<string, Izdelek> = Object.fromEntries(KATEGORIJE.map((k) => [k.id, IZDELKI.find((i) => i.kategorija === k.id)!]));
  return (
    <section className="mx-auto max-w-7xl px-4 py-24">
      <Naslov oznaka="Ponudba" id="izdelki">
        Kaj
        <br />
        potiskamo
      </Naslov>
      <div className="grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
        {KATEGORIJE.map((k) => (
          <article key={k.id} className="group relative flex min-h-[320px] flex-col justify-between overflow-hidden bg-[#0b0b0b] p-7 transition hover:bg-[#c69c6d] hover:text-black">
            <div className="flex items-start justify-between">
              <span className="text-sm font-black text-[#ff5a1f] group-hover:text-black">{k.stevilka}</span>
              <ArrowUpRight className="h-5 w-5 opacity-40 transition group-hover:rotate-45 group-hover:opacity-100" />
            </div>
            <Ilustracija oblika={slika[k.id].oblika} barva={slika[k.id].barva} className="mx-auto h-32 w-32 transition group-hover:scale-110" />
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tight">{k.ime}</h3>
              <p className="mt-2 text-sm leading-relaxed opacity-70">{k.opis}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Postopki() {
  return (
    <section id="tisk" className="scroll-mt-20 bg-[#f3efe8] text-black">
      <div className="mx-auto max-w-7xl px-4 py-24">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-[clamp(2.2rem,5vw,4.5rem)] font-black uppercase leading-[0.9] tracking-tighter">
            Šest načinov,
            <br />
            <span className="text-[#ff5a1f]">en</span> podpis.
          </h2>
          <p className="max-w-sm text-sm leading-relaxed text-black/60">
            Vsak material ima svoj tisk. Svetujemo, kateri bo na vaši embalaži izgledal najboljše — in koliko bo stal.
          </p>
        </div>
        <div className="grid gap-px bg-black/15 md:grid-cols-2 lg:grid-cols-3">
          {POSTOPKI.map((p, i) => (
            <div key={p.ime} className="bg-[#f3efe8] p-7">
              <span className="font-mono text-xs text-black/40">/{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-4 text-xl font-black uppercase">{p.ime}</h3>
              <p className="mt-2 text-sm leading-relaxed text-black/65">{p.opis}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── paket 1: povpraševanje ───────────────────────── */

function NalaganjeLoga({ logo, setLogo, svetlo = false }: { logo: string | null; setLogo: (l: string | null) => void; svetlo?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3">
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => setLogo(String(r.result));
          r.readAsDataURL(f);
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={`flex items-center gap-2 border px-4 py-3 text-sm font-bold ${
          svetlo ? "border-black/20 hover:border-black" : "border-white/20 hover:border-white"
        }`}
      >
        <Upload className="h-4 w-4" /> {logo ? "Zamenjaj logotip" : "Naloži logotip"}
      </button>
      {logo && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="Logotip" className="h-10 w-10 bg-white object-contain p-1" />
          <button type="button" onClick={() => setLogo(null)} className="text-xs underline opacity-60">
            odstrani
          </button>
        </>
      )}
    </div>
  );
}

function Povprasevanje({ logo, setLogo }: { logo: string | null; setLogo: (l: string | null) => void }) {
  const [poslano, setPoslano] = useState(false);
  return (
    <section id="povprasevanje" className="scroll-mt-20 mx-auto max-w-7xl px-4 py-24">
      <div className="grid gap-12 lg:grid-cols-2">
        <div>
          <Naslov oznaka="Povpraševanje">
            Pošljite
            <br />
            logotip.
          </Naslov>
          <p className="max-w-md text-white/70">
            Povejte, kaj potrebujete in v kakšni količini. Ponudbo z vizualizacijo dobite v 24 urah — ali pa nas
            preprosto pokličite.
          </p>
          <a href={KONTAKT.telefonHref} className="mt-8 inline-flex items-center gap-3 text-4xl font-black tracking-tight hover:text-[#ff5a1f]">
            <Phone className="h-8 w-8" /> {KONTAKT.telefon}
          </a>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPoslano(true);
          }}
          className="space-y-4 border border-white/10 bg-white/[0.03] p-6 sm:p-8"
        >
          {poslano ? (
            <div className="py-16 text-center">
              <Check className="mx-auto h-12 w-12 text-[#ff5a1f]" />
              <p className="mt-4 text-2xl font-black uppercase">Hvala!</p>
              <p className="mt-2 text-sm text-white/60">Demo — povpraševanje ni bilo nikamor poslano.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Polje oznaka="Ime in priimek" />
                <Polje oznaka="Podjetje" />
                <Polje oznaka="E-pošta" tip="email" />
                <Polje oznaka="Telefon" />
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-white/50">Kaj potrebujete</span>
                <select className="w-full border border-white/15 bg-[#0b0b0b] px-4 py-3 text-sm outline-none focus:border-[#ff5a1f]">
                  {KATEGORIJE.map((k) => (
                    <option key={k.id}>{k.ime}</option>
                  ))}
                </select>
              </label>
              <Polje oznaka="Količina (pribl.)" tip="number" />
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-white/50">Opis</span>
                <textarea rows={3} className="w-full border border-white/15 bg-transparent px-4 py-3 text-sm outline-none focus:border-[#ff5a1f]" />
              </label>
              <NalaganjeLoga logo={logo} setLogo={setLogo} />
              <button className="flex w-full items-center justify-center gap-2 bg-[#ff5a1f] py-4 text-sm font-black uppercase tracking-wide text-black hover:bg-[#ff7a45]">
                Pošlji povpraševanje <Send className="h-4 w-4" />
              </button>
            </>
          )}
        </form>
      </div>
    </section>
  );
}

function Polje({ oznaka, tip = "text" }: { oznaka: string; tip?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-white/50">{oznaka}</span>
      <input type={tip} className="w-full border border-white/15 bg-transparent px-4 py-3 text-sm outline-none focus:border-[#ff5a1f]" />
    </label>
  );
}

/* ───────────────────────── paket 2: trgovina ───────────────────────── */

function Trgovina({ odpri }: { odpri: (i: Izdelek) => void }) {
  const [filter, setFilter] = useState<string>("vse");
  const prikazani = filter === "vse" ? IZDELKI : IZDELKI.filter((i) => i.kategorija === filter);
  return (
    <section id="trgovina" className="scroll-mt-20 mx-auto max-w-7xl px-4 py-24">
      <Naslov oznaka="Spletna trgovina">
        Izračunaj.
        <br />
        <span className="text-[#ff5a1f]">Naroči.</span>
      </Naslov>
      <div className="mb-8 flex flex-wrap gap-2">
        {[{ id: "vse", ime: "Vse" }, ...KATEGORIJE].map((k) => (
          <button
            key={k.id}
            onClick={() => setFilter(k.id)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wide ${
              filter === k.id ? "bg-[#f3efe8] text-black" : "border border-white/15 text-white/70 hover:border-white"
            }`}
          >
            {k.ime}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {prikazani.map((i) => (
          <article key={i.id} className="group flex flex-col border border-white/10 bg-white/[0.02] transition hover:border-[#ff5a1f]">
            <div className="flex aspect-[4/3] items-center justify-center bg-[#151515] sm:aspect-square">
              <Ilustracija oblika={i.oblika} barva={i.barva} className="h-3/4 w-3/4 transition group-hover:scale-105" />
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h3 className="font-black uppercase leading-tight">{i.ime}</h3>
              <p className="mt-1 text-xs text-white/50">{i.opis}</p>
              <div className="mt-auto flex items-end justify-between pt-5">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-white/40">že od / kos</p>
                  <p className="text-2xl font-black">{eur(i.cena)}</p>
                  <p className="text-[10px] text-white/40">min. {i.min} kos · cena je primer</p>
                </div>
                <button
                  onClick={() => odpri(i)}
                  className="flex items-center gap-1 bg-[#ff5a1f] px-3 py-2 text-xs font-black uppercase text-black hover:bg-[#ff7a45]"
                >
                  Sestavi <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Konfigurator({
  izdelek,
  logo,
  setLogo,
  zapri,
  dodaj,
}: {
  izdelek: Izdelek;
  logo: string | null;
  setLogo: (l: string | null) => void;
  zapri: () => void;
  dodaj: (p: Omit<Postavka, "id">) => void;
}) {
  const [kolicina, setKolicina] = useState(Math.max(izdelek.min, 500));
  const [tiskId, setTiskId] = useState<string>("1b");
  const c = izracun(izdelek, kolicina, tiskId);
  const prikaziLogo = tiskId !== "brez" ? logo : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-4" onClick={zapri}>
      <div
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto border border-white/15 bg-[#111] text-[#f3efe8]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">Konfigurator</p>
          <button onClick={zapri} aria-label="Zapri">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid gap-0 md:grid-cols-2">
          <div className="flex items-center justify-center bg-[#c69c6d]/10 p-8">
            <Ilustracija oblika={izdelek.oblika} barva={izdelek.barva} logo={prikaziLogo} className="h-72 w-72" />
          </div>
          <div className="space-y-6 p-6">
            <div>
              <h3 className="text-2xl font-black uppercase leading-tight">{izdelek.ime}</h3>
              <p className="text-sm text-white/50">{izdelek.opis}</p>
            </div>
            <div>
              <div className="mb-2 flex justify-between text-xs font-bold uppercase tracking-wide text-white/50">
                <span>Količina</span>
                <span className="text-[#f3efe8]">{kolicina.toLocaleString("sl-SI")} kos</span>
              </div>
              <input
                type="range"
                min={izdelek.min}
                max={10000}
                step={izdelek.min >= 100 ? 50 : 10}
                value={kolicina}
                onChange={(e) => setKolicina(Number(e.target.value))}
                className="w-full accent-[#ff5a1f]"
              />
              <div className="mt-2 flex gap-2">
                {[izdelek.min, 500, 1000, 5000].filter((v, i, a) => a.indexOf(v) === i && v >= izdelek.min).map((v) => (
                  <button key={v} onClick={() => setKolicina(v)} className="border border-white/15 px-2.5 py-1 text-xs hover:border-white">
                    {v.toLocaleString("sl-SI")}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-white/50">Tisk</p>
              <div className="grid grid-cols-2 gap-2">
                {TISKI.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTiskId(t.id)}
                    className={`px-3 py-2.5 text-left text-xs font-bold ${
                      tiskId === t.id ? "bg-[#f3efe8] text-black" : "border border-white/15 hover:border-white"
                    }`}
                  >
                    {t.ime}
                  </button>
                ))}
              </div>
            </div>
            {tiskId !== "brez" && <NalaganjeLoga logo={logo} setLogo={setLogo} />}
            <div className="space-y-1.5 border-t border-white/10 pt-5 text-sm">
              <Vrstica a="Cena na kos" b={eur(c.naKos)} />
              {c.popust > 0 && <Vrstica a="Količinski popust" b={`−${Math.round(c.popust * 100)} %`} poudari />}
              {c.priprava > 0 && <Vrstica a="Priprava tiska (enkratno)" b={eur(c.priprava)} />}
              <div className="flex items-end justify-between pt-3">
                <span className="text-xs font-bold uppercase tracking-wide text-white/50">Skupaj brez DDV</span>
                <span className="text-4xl font-black">{eur(c.skupaj)}</span>
              </div>
              <p className="text-[11px] text-white/35">Demo — cene so informativni primer, ne ponudba.</p>
            </div>
            <button
              onClick={() => dodaj({ izdelek, kolicina, tiskId, logo: prikaziLogo })}
              className="flex w-full items-center justify-center gap-2 bg-[#ff5a1f] py-4 text-sm font-black uppercase tracking-wide text-black hover:bg-[#ff7a45]"
            >
              <ShoppingBag className="h-4 w-4" /> Dodaj v košarico
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Vrstica({ a, b, poudari }: { a: string; b: string; poudari?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-white/60">{a}</span>
      <span className={poudari ? "font-bold text-[#ff5a1f]" : "font-semibold"}>{b}</span>
    </div>
  );
}

function Kosarica({
  postavke,
  skupaj,
  odstrani,
  zapri,
  oddaj,
}: {
  postavke: Postavka[];
  skupaj: number;
  odstrani: (id: string) => void;
  zapri: () => void;
  oddaj: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/70 backdrop-blur-sm" onClick={zapri}>
      <aside className="flex h-full w-full max-w-md flex-col border-l border-white/15 bg-[#111]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <h3 className="text-xl font-black uppercase">Košarica</h3>
          <button onClick={zapri} aria-label="Zapri">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-6">
          {postavke.length === 0 && <p className="py-10 text-center text-sm text-white/50">Košarica je prazna.</p>}
          {postavke.map((p) => {
            const c = izracun(p.izdelek, p.kolicina, p.tiskId);
            return (
              <div key={p.id} className="flex gap-3 border border-white/10 p-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center bg-[#1a1a1a]">
                  <Ilustracija oblika={p.izdelek.oblika} barva={p.izdelek.barva} logo={p.logo} className="h-14 w-14" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{p.izdelek.ime}</p>
                  <p className="text-xs text-white/50">
                    {p.kolicina.toLocaleString("sl-SI")} kos · {TISKI.find((t) => t.id === p.tiskId)?.ime}
                  </p>
                  <p className="mt-1 text-sm font-black">{eur(c.skupaj)}</p>
                </div>
                <button onClick={() => odstrani(p.id)} className="self-start text-white/40 hover:text-white" aria-label="Odstrani">
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="space-y-3 border-t border-white/10 p-6">
          <div className="flex items-end justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-white/50">Skupaj brez DDV</span>
            <span className="text-3xl font-black">{eur(skupaj)}</span>
          </div>
          <button
            disabled={postavke.length === 0}
            onClick={oddaj}
            className="flex w-full items-center justify-center gap-2 bg-[#ff5a1f] py-4 text-sm font-black uppercase tracking-wide text-black hover:bg-[#ff7a45] disabled:opacity-40"
          >
            Oddaj naročilo <ArrowRight className="h-4 w-4" />
          </button>
          <p className="text-center text-[11px] text-white/35">Demo — naročilo se ne pošlje nikamor.</p>
        </div>
      </aside>
    </div>
  );
}

function Potrdilo({ st, zapri }: { st: string; zapri: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" onClick={zapri}>
      <div className="w-full max-w-md bg-[#f3efe8] p-8 text-black" onClick={(e) => e.stopPropagation()}>
        <Check className="h-12 w-12 text-[#ff5a1f]" />
        <h3 className="mt-4 text-3xl font-black uppercase leading-none">Naročilo prejeto</h3>
        <p className="mt-3 text-sm text-black/70">
          Številka naročila <b>{st}</b>. V pravi trgovini bi zdaj stranka dobila e-mail s potrdilom in predračunom,
          Kamenarič pa naročilo z logotipom v prilogi.
        </p>
        <p className="mt-4 bg-black/5 p-3 text-xs text-black/60">To je predogled — naročilo ni bilo poslano.</p>
        <button onClick={zapri} className="mt-6 w-full bg-black py-3 text-sm font-black uppercase text-white">
          V redu
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── paket 3: portal ───────────────────────── */

const PRETEKLA = [
  { st: "KM-2025-0912", datum: "4. 11. 2025", opis: "Stenski koledar 12 listov", izdelek: "koledar", kolicina: 300, tisk: "polno" },
  { st: "KM-2025-0655", datum: "12. 6. 2025", opis: "Papirnata vrečka kraft", izdelek: "papir-vrecka", kolicina: 1000, tisk: "1b" },
  { st: "KM-2024-1120", datum: "28. 11. 2024", opis: "Darilna škatla s pokrovom", izdelek: "darilna-skatla", kolicina: 200, tisk: "slepi" },
];

type Sporocilo = { od: "ai" | "jaz"; besedilo: string; predlog?: Omit<Postavka, "id"> };

function Portal({
  logo,
  setLogo,
  dodaj,
}: {
  logo: string | null;
  setLogo: (l: string | null) => void;
  dodaj: (p: Omit<Postavka, "id">) => void;
}) {
  return (
    <section id="portal" className="scroll-mt-20 border-t border-white/10 bg-[#101010]">
      <div className="mx-auto max-w-7xl px-4 py-24">
        <Naslov oznaka="Portal za podjetja">
          Vaš račun.
          <br />
          <span className="text-[#ff5a1f]">Vaše cene.</span>
        </Naslov>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border border-white/10 bg-black/40 p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center bg-[#c69c6d] text-lg font-black text-black">PN</div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/40">Prijavljeni kot (primer)</p>
              <p className="font-black uppercase">Pekarna Novak d.o.o.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-bold uppercase">
            <span className="bg-[#ff5a1f] px-3 py-1.5 text-black">Vaš popust −12 %</span>
            <span className="border border-white/20 px-3 py-1.5">Plačilo na 30 dni</span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <AiPomocnik dodaj={dodaj} logo={logo} />

          <div className="border border-white/10 p-6">
            <p className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-white/50">
              <Package className="h-4 w-4" /> 3D predogled z vašim logotipom
            </p>
            <div className="flex flex-col items-center gap-4">
              <Skatla3D logo={logo} barva="#111827" velikost={190} samaSeVrti={false} svetelNapis />
              <NalaganjeLoga logo={logo} setLogo={setLogo} />
              <p className="text-center text-xs text-white/40">Naložite logotip in zavrtite škatlo — tako bo videti, še preden jo naročite.</p>
            </div>
          </div>

          <div className="border border-white/10 p-6">
            <p className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-white/50">
              <RotateCcw className="h-4 w-4" /> Pretekla naročila
            </p>
            <div className="divide-y divide-white/10">
              {PRETEKLA.map((n) => (
                <div key={n.st} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-bold">{n.opis}</p>
                    <p className="text-xs text-white/45">
                      {n.st} · {n.datum} · {n.kolicina} kos
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      dodaj({ izdelek: IZDELKI.find((i) => i.id === n.izdelek)!, kolicina: n.kolicina, tiskId: n.tisk, logo })
                    }
                    className="shrink-0 bg-[#f3efe8] px-3 py-2 text-xs font-black uppercase text-black hover:bg-white"
                  >
                    Ponovi
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-white/10 p-6">
            <p className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-white/50">
              <Truck className="h-4 w-4" /> Sledenje · KM-2026-0131
            </p>
            <ol className="space-y-4">
              {[
                ["Naročilo potrjeno", "2. 10.", true],
                ["Grafična priprava odobrena", "3. 10.", true],
                ["V tisku", "danes", true],
                ["Odprema", "predvidoma 9. 10.", false],
              ].map(([a, b, ok]) => (
                <li key={a as string} className="flex items-center gap-4">
                  <span className={`flex h-7 w-7 items-center justify-center ${ok ? "bg-[#ff5a1f] text-black" : "border border-white/20"}`}>
                    {ok ? <Check className="h-4 w-4" /> : null}
                  </span>
                  <span className={`flex-1 text-sm font-bold ${ok ? "" : "text-white/40"}`}>{a}</span>
                  <span className="text-xs text-white/40">{b}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 border border-[#c69c6d]/40 bg-[#c69c6d]/10 p-4 text-sm">
              <p className="font-black uppercase text-[#c69c6d]">Opomnik pred sezono</p>
              <p className="mt-1 text-white/70">
                Lani ste 4. 11. naročili 300 koledarjev. Želite letos enake — z novo fotografijo?
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function razumi(vnos: string, logo: string | null): Sporocilo {
  const t = vnos.toLowerCase();
  const st = Number((t.match(/(\d[\d.\s]*)/)?.[1] ?? "").replace(/[.\s]/g, "")) || 0;
  const izdelek =
    /vreč|vrec/.test(t) ? IZDELKI.find((i) => i.id === (/(^|\s)pe(\s|$)|plastič|plastic/.test(t) ? "pe-vrecka" : "papir-vrecka"))
    : /škatl|skatl|embala/.test(t) ? IZDELKI.find((i) => i.id === (/daril/.test(t) ? "darilna-skatla" : "posiljka"))
    : /koledar/.test(t) ? IZDELKI.find((i) => i.id === "koledar")
    : /pisal|kuli/.test(t) ? IZDELKI.find((i) => i.id === "pisalo")
    : /majic|polo/.test(t) ? IZDELKI.find((i) => i.id === "polo")
    : /trak/.test(t) ? IZDELKI.find((i) => i.id === "trak")
    : undefined;
  if (!izdelek) {
    return { od: "ai", besedilo: "Povejte mi izdelek in količino — npr. »500 papirnatih vrečk z logotipom do petka«." };
  }
  const kolicina = Math.max(izdelek.min, st || 500);
  const tiskId = /barv|polno|fotograf/.test(t) ? "polno" : /relief|slep|vtis/.test(t) ? "slepi" : /brez/.test(t) ? "brez" : "1b";
  const c = izracun(izdelek, kolicina, tiskId);
  const rok = t.match(/do (ponedeljka|torka|srede|četrtka|petka|sobote|nedelje|\d{1,2}\.\s?\d{1,2}\.?)/)?.[1];
  return {
    od: "ai",
    besedilo:
      `Predlagam: ${kolicina.toLocaleString("sl-SI")} × ${izdelek.ime}, ${TISKI.find((x) => x.id === tiskId)?.ime.toLowerCase()}. ` +
      `Cena ${eur(c.naKos)}/kos, skupaj ${eur(c.skupaj)} brez DDV` +
      (rok ? `. Rok »do ${rok}« je izvedljiv, če grafiko potrdite danes.` : ". Dobava v 7–10 delovnih dneh.") +
      (logo ? " Vaš logotip že imam." : " Naložite še logotip, pa pripravim vizualizacijo."),
    predlog: { izdelek, kolicina, tiskId, logo },
  };
}

function AiPomocnik({ dodaj, logo }: { dodaj: (p: Omit<Postavka, "id">) => void; logo: string | null }) {
  const [sporocila, setSporocila] = useState<Sporocilo[]>([
    { od: "ai", besedilo: "Pozdravljeni! Napišite, kaj potrebujete, in sestavim ponudbo v nekaj sekundah." },
  ]);
  const [vnos, setVnos] = useState("");
  const predlogi = useMemo(() => ["500 vrečk z logotipom do petka", "200 darilnih škatel z reliefnim tiskom", "300 koledarjev s fotografijami"], []);

  function poslji(besedilo: string) {
    if (!besedilo.trim()) return;
    setSporocila((s) => [...s, { od: "jaz", besedilo }, razumi(besedilo, logo)]);
    setVnos("");
  }

  return (
    <div className="flex flex-col border border-white/10 p-6 lg:row-span-1">
      <p className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-white/50">
        <Bot className="h-4 w-4" /> AI pomočnik za ponudbe
      </p>
      <div className="flex max-h-80 min-h-56 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {sporocila.map((s, i) => (
          <div key={i} className={`max-w-[88%] px-4 py-3 text-sm ${s.od === "jaz" ? "self-end bg-[#f3efe8] text-black" : "self-start bg-white/[0.06]"}`}>
            {s.besedilo}
            {s.predlog && (
              <button
                onClick={() => dodaj(s.predlog!)}
                className="mt-3 flex items-center gap-1.5 bg-[#ff5a1f] px-3 py-1.5 text-xs font-black uppercase text-black"
              >
                <ShoppingBag className="h-3.5 w-3.5" /> V košarico
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {predlogi.map((p) => (
          <button key={p} onClick={() => poslji(p)} className="flex items-center gap-1 border border-white/15 px-2.5 py-1 text-[11px] text-white/70 hover:border-white">
            <Sparkles className="h-3 w-3" /> {p}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          poslji(vnos);
        }}
        className="mt-3 flex"
      >
        <input
          value={vnos}
          onChange={(e) => setVnos(e.target.value)}
          placeholder="npr. 1000 PE vrečk, 2 barvi, do 15. 11."
          className="flex-1 border border-white/15 bg-transparent px-4 py-3 text-sm outline-none focus:border-[#ff5a1f]"
        />
        <button className="bg-[#ff5a1f] px-4 text-black" aria-label="Pošlji">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

/* ───────────────────────── kaj dobite ───────────────────────── */

function KajDobite({ paket, setPaket }: { paket: Paket; setPaket: (p: Paket) => void }) {
  const v = VSEBINA_PAKETOV[paket];
  const naslednji = paket < 3 ? ((paket + 1) as Paket) : null;
  return (
    <section id="kaj-dobite" className="scroll-mt-14 bg-[#ff5a1f] text-black">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em]">Za Kamenarič d.o.o. · pripravil KodaTim</p>
          <h2 className="mt-4 text-[clamp(2rem,4.5vw,3.8rem)] font-black uppercase leading-[0.9] tracking-tighter">{v.naslov}</h2>
          <p className="mt-6 max-w-md text-lg font-semibold leading-snug">{v.zakaj}</p>
          <div className="mt-8 flex flex-wrap gap-2">
            {PAKETI.map((p) => (
              <button
                key={p.st}
                onClick={() => setPaket(p.st)}
                className={`px-4 py-2.5 text-xs font-black uppercase ${paket === p.st ? "bg-black text-[#ff5a1f]" : "border-2 border-black hover:bg-black/10"}`}
              >
                {p.st} · {p.ime}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-black p-8 text-[#f3efe8]">
          <ul className="space-y-4">
            {v.tocke.map((t) => (
              <li key={t} className="flex gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#ff5a1f]" />
                <span className="leading-snug">{t}</span>
              </li>
            ))}
          </ul>
          {naslednji && (
            <button
              onClick={() => setPaket(naslednji)}
              className="mt-8 flex w-full items-center justify-between border border-white/20 px-5 py-4 text-left hover:border-[#ff5a1f]"
            >
              <span>
                <span className="block text-xs uppercase tracking-wide text-white/50">Še korak dlje</span>
                <span className="font-black uppercase">
                  Poglej paket {naslednji} — {PAKETI[naslednji - 1].kratko}
                </span>
              </span>
              <ArrowRight className="h-5 w-5 text-[#ff5a1f]" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Noga() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-6 px-4 py-12">
        <div>
          <p className="text-4xl font-black uppercase tracking-tighter sm:text-6xl">Kamenarič</p>
          <p className="mt-2 text-sm text-white/50">{KONTAKT.podjetje} · embalaža, tisk, poslovna darila</p>
        </div>
        <div className="text-right">
          <a href={KONTAKT.telefonHref} className="text-2xl font-black hover:text-[#ff5a1f]">
            {KONTAKT.telefon}
          </a>
          <p className="mt-2 text-xs text-white/35">Predogled nove strani · izdelal KodaTim.si</p>
        </div>
      </div>
    </footer>
  );
}
