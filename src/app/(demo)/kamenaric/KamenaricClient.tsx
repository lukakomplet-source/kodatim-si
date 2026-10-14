"use client";

import { useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  Box,
  Check,
  FileText,
  Lightbulb,
  Package,
  Phone,
  RotateCcw,
  Search,
  Send,
  Settings2,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
  Truck,
  Upload,
  Users,
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
  SLIKE,
  TISKI,
  VSEBINA_PAKETOV,
  eur,
  izracun,
  type Izdelek,
  type Paket,
} from "./podatki";

type Postavka = { id: string; izdelek: Izdelek; kolicina: number; tiskId: string; logo: string | null };

const slika = (ime: string) => `${SLIKE}/${ime}.jpg`;

/* Barve po predlogi: svetla podlaga, temno modra besedila, živo modri poudarki. */
const MODRA = "bg-[#1546d8] hover:bg-[#0f38b4] text-white";
const OBROBA = "border border-[#e3e6ee]";

export default function KamenaricClient({ zacetniPaket }: { zacetniPaket: Paket }) {
  const [paket, setPaketState] = useState<Paket>(zacetniPaket);
  const [logo, setLogo] = useState<string | null>(null);
  const [kosarica, setKosarica] = useState<Postavka[]>([]);
  const [kosaricaOdprta, setKosaricaOdprta] = useState(false);
  const [konfigurator, setKonfigurator] = useState<Izdelek | null>(null);
  const [potrdilo, setPotrdilo] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("vse");

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

  function odpriKategorijo(id: string) {
    if (paket === 1) {
      document.getElementById("povprasevanje")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setFilter(id);
    document.getElementById("trgovina")?.scrollIntoView({ behavior: "smooth" });
  }

  const skupaj = kosarica.reduce((s, p) => s + izracun(p.izdelek, p.kolicina, p.tiskId).skupaj, 0);

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-[#0b1530] antialiased selection:bg-[#1546d8] selection:text-white">
      <style>{`
        @keyframes km-vrti { from { transform: rotateY(0deg) } to { transform: rotateY(360deg) } }
        .km-vrtenje { animation: km-vrti 18s linear infinite }
        @media (prefers-reduced-motion: reduce) { .km-vrtenje { animation: none } }
      `}</style>

      <DemoVrstica paket={paket} setPaket={setPaket} />
      <Glava paket={paket} stevilo={kosarica.length} odpriKosarico={() => setKosaricaOdprta(true)} />
      <Uvod paket={paket} />
      <Kategorije odpri={odpriKategorijo} />
      <Proces />
      <Postopki />
      <Stranke />

      {paket === 1 && <Povprasevanje logo={logo} setLogo={setLogo} />}
      {paket >= 2 && <Trgovina odpri={setKonfigurator} filter={filter} setFilter={setFilter} />}
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

/* ───────────────────────── demo vrstica in glava ───────────────────────── */

function DemoVrstica({ paket, setPaket }: { paket: Paket; setPaket: (p: Paket) => void }) {
  return (
    <div className="sticky top-0 z-50 bg-[#0b1530] text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
          Predogled · KodaTim.si <span className="hidden sm:inline">— izberite različico</span>
        </p>
        <div className="flex items-center gap-1">
          {PAKETI.map((p) => (
            <button
              key={p.st}
              onClick={() => setPaket(p.st)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                paket === p.st ? "bg-[#1546d8] text-white" : "text-white/70 hover:bg-white/10"
              }`}
            >
              {p.st} <span className="hidden sm:inline">· {p.ime}</span>
            </button>
          ))}
          <a href="#kaj-dobite" className="ml-1 hidden px-2 text-xs font-semibold text-white/80 underline underline-offset-4 md:block">
            Kaj dobim?
          </a>
        </div>
      </div>
    </div>
  );
}

function ZnakK({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <polygon points="4,4 14,4 14,36 4,36" fill="#0b1530" />
      <polygon points="14,20 28,4 38,4 22,22" fill="#1546d8" />
      <polygon points="18,18 26,16 38,36 27,36" fill="#0b1530" />
    </svg>
  );
}

function Glava({ paket, stevilo, odpriKosarico }: { paket: Paket; stevilo: number; odpriKosarico: () => void }) {
  return (
    <header className="bg-white">
      <div className="border-b border-[#eef0f4] bg-[#f6f7f9]">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-6 px-4 py-1.5 text-xs text-[#4b5563]">
          <a href={KONTAKT.telefonHref} className="flex items-center gap-1.5 hover:text-[#1546d8]">
            <Phone className="h-3.5 w-3.5 text-[#1546d8]" /> +386 (0)41 336 547
          </a>
        </div>
      </div>
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3.5">
        <a href="#" className="flex shrink-0 items-center gap-2">
          <ZnakK className="h-9 w-9" />
          <span className="text-xl font-extrabold tracking-tight sm:text-2xl">KAMENARIČ</span>
        </a>
        <nav className="hidden flex-1 items-center gap-6 text-sm font-medium text-[#1f2a44] xl:flex">
          {KATEGORIJE.map((k) => (
            <a key={k.id} href="#ponudba" className="whitespace-nowrap hover:text-[#1546d8]">
              {k.ime}
            </a>
          ))}
          <a href="#tisk" className="whitespace-nowrap hover:text-[#1546d8]">Tisk in dodelava</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <label className="hidden items-center gap-2 rounded-lg bg-[#f1f3f7] px-3 py-2.5 text-sm text-[#6b7280] lg:flex">
            <Search className="h-4 w-4" />
            <input placeholder="Išči izdelke …" className="w-36 bg-transparent outline-none placeholder:text-[#9aa1ad]" />
          </label>
          {paket >= 2 && (
            <button onClick={odpriKosarico} className={`relative rounded-lg ${OBROBA} bg-white p-2.5 hover:border-[#1546d8]`} aria-label="Košarica">
              <ShoppingBag className="h-5 w-5" />
              {stevilo > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1546d8] px-1 text-[11px] font-bold text-white">
                  {stevilo}
                </span>
              )}
            </button>
          )}
          {paket === 3 && (
            <a href="#portal" className={`hidden rounded-lg ${OBROBA} bg-white px-4 py-2.5 text-sm font-semibold hover:border-[#1546d8] md:block`}>
              Prijava za podjetja
            </a>
          )}
          <a
            href={paket === 1 ? "#povprasevanje" : "#trgovina"}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${MODRA}`}
          >
            <span className="hidden sm:inline">{paket === 1 ? "Pošlji povpraševanje" : "Naroči na spletu"}</span>
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </header>
  );
}

/* ───────────────────────── uvod ───────────────────────── */

const PREDNOSTI = [
  { ikona: Tag, a: "Personalizacija", b: "z vašim logotipom" },
  { ikona: Box, a: "Široka izbira", b: "izdelkov" },
  { ikona: Users, a: "Osebni pristop", b: "in svetovanje" },
];

function Uvod({ paket }: { paket: Paket }) {
  return (
    <section className="overflow-hidden bg-gradient-to-b from-white to-[#f6f7f9]">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-14 pt-10 lg:grid-cols-[1fr_1.1fr] lg:pb-20 lg:pt-14">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1546d8]">Promocijski izdelki in poslovna darila</p>
          <h1 className="mt-5 text-[clamp(2.4rem,5.2vw,4.4rem)] font-extrabold leading-[1.02] tracking-tight">
            Promocijski izdelki,
            <br />
            ki <span className="text-[#1546d8]">pustijo vtis.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-[#374151]">
            Izdelki po meri vašega podjetja — <span className="text-[#6b7280]">z vašim logotipom, idejo in zgodbo.</span>
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#ponudba" className={`flex items-center gap-2 rounded-lg px-6 py-3.5 text-sm font-semibold ${MODRA}`}>
              Razišči ponudbo <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={paket === 1 ? "#povprasevanje" : "#trgovina"}
              className={`flex items-center gap-2 rounded-lg ${OBROBA} bg-white px-6 py-3.5 text-sm font-semibold hover:border-[#1546d8]`}
            >
              <FileText className="h-4 w-4" /> {paket === 1 ? "Pošlji povpraševanje" : "Izračunaj ceno"}
            </a>
          </div>
          <div className="mt-10 grid max-w-xl grid-cols-1 gap-5 sm:grid-cols-3 sm:divide-x sm:divide-[#e3e6ee]">
            {PREDNOSTI.map(({ ikona: I, a, b }) => (
              <div key={a} className="flex items-center gap-3 sm:pl-5 sm:first:pl-0">
                <I className="h-7 w-7 shrink-0 text-[#1546d8]" strokeWidth={1.6} />
                <p className="text-sm leading-tight text-[#374151]">
                  {a}
                  <br />
                  {b}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative grid h-[340px] grid-cols-6 grid-rows-6 gap-3 sm:h-[460px]">
          <Foto ime="uvod-vrecke" className="col-span-3 row-span-6" />
          <Foto ime="uvod-majice" className="col-span-3 row-span-3" />
          <Foto ime="uvod-skatle" className="col-span-2 row-span-3" />
          <Foto ime="uvod-darilo" className="col-span-1 row-span-3" />
          <div className="absolute -bottom-4 left-4 hidden items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-lg shadow-black/10 sm:flex">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eef3ff]">
              <Star className="h-5 w-5 fill-[#1546d8] text-[#1546d8]" />
            </div>
            <div>
              <p className="text-sm font-bold">Tisk z vašim logotipom</p>
              <p className="text-xs text-[#6b7280]">že od 50 kosov</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Foto({ ime, className = "", alt = "" }: { ime: string; className?: string; alt?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl bg-[#e9ecf2] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={slika(ime)} alt={alt} className="h-full w-full object-cover transition duration-500 hover:scale-105" loading="lazy" />
    </div>
  );
}

/* ───────────────────────── ponudba, proces, tisk ───────────────────────── */

function Kategorije({ odpri }: { odpri: (id: string) => void }) {
  return (
    <section id="ponudba" className="scroll-mt-12 mx-auto max-w-7xl px-4 py-16">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-5">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Raziščite našo ponudbo</h2>
        <p className="max-w-xl text-[15px] text-[#4b5563]">
          Embalaža, promocijski izdelki in poslovna darila, ki jih prilagodimo vašim željam. Poiščite navdih v naših glavnih kategorijah.
        </p>
        <button onClick={() => odpri("vse")} className={`flex items-center gap-2 rounded-lg ${OBROBA} bg-white px-4 py-2.5 text-sm font-semibold hover:border-[#1546d8]`}>
          Vsi izdelki <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {KATEGORIJE.map((k) => (
          <button
            key={k.id}
            onClick={() => odpri(k.id)}
            className={`group overflow-hidden rounded-xl ${OBROBA} bg-white text-left transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5`}
          >
            <div className="aspect-[4/3] overflow-hidden bg-[#eef0f4]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={slika(k.slika)} alt={k.ime} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
            </div>
            <div className="flex items-start justify-between gap-2 p-4">
              <div>
                <h3 className="font-bold leading-tight">{k.ime}</h3>
                <p className="mt-1 text-xs leading-snug text-[#6b7280]">{k.opis}</p>
              </div>
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${OBROBA} group-hover:border-[#1546d8] group-hover:bg-[#1546d8] group-hover:text-white`}>
                <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

const KORAKI = [
  { ikona: Lightbulb, a: "1. Ideja", b: "Skupaj poiščemo najboljšo rešitev" },
  { ikona: Settings2, a: "2. Oblikovanje", b: "Pripravimo predlog z vašim logotipom" },
  { ikona: Box, a: "3. Izdelava", b: "Kakovostna produkcija in personalizacija" },
  { ikona: Truck, a: "4. Dostava", b: "Hitra in zanesljiva dobava" },
];

function Proces() {
  return (
    <section className="border-y border-[#e9ecf2] bg-white">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 lg:grid-cols-[0.9fr_1.6fr]">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Od ideje do končnega izdelka</h2>
          <p className="mt-2 text-[15px] text-[#4b5563]">
            Poskrbimo za celoten proces – od izbire izdelka, oblikovanja in personalizacije do hitre in zanesljive dobave.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {KORAKI.map(({ ikona: I, a, b }, i) => (
            <div key={a} className="relative flex items-start gap-3">
              <I className="h-9 w-9 shrink-0 text-[#1546d8]" strokeWidth={1.5} />
              <div>
                <p className="text-sm font-bold">{a}</p>
                <p className="text-xs leading-snug text-[#6b7280]">{b}</p>
              </div>
              {i < 3 && <ArrowRight className="absolute -right-4 top-2 hidden h-4 w-4 text-[#9aa1ad] md:block" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Postopki() {
  return (
    <section id="tisk" className="scroll-mt-12 mx-auto max-w-7xl px-4 py-16">
      <div className="mb-8 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1546d8]">Tisk in dodelava</p>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Šest načinov, en podpis.</h2>
        <p className="mt-2 text-[15px] text-[#4b5563]">Vsak material ima svoj tisk. Svetujemo, kateri bo na vašem izdelku izgledal najboljše — in koliko bo stal.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {POSTOPKI.map((p, i) => (
          <div key={p.ime} className={`rounded-xl ${OBROBA} bg-white p-6`}>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef3ff] text-sm font-bold text-[#1546d8]">{i + 1}</span>
            <h3 className="mt-4 font-bold">{p.ime}</h3>
            <p className="mt-1 text-sm leading-relaxed text-[#6b7280]">{p.opis}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* Mnenja NISO resnična — v demu so označena kot primer, dokler stranka ne
   da svojih (npr. z Googla). Izmišljena mnenja kot prava bi bila zavajanje. */
const MNENJA = [
  { ime: "Pekarna (primer)", vloga: "Papirnate vrečke s tiskom", besedilo: "Vrečke z našim logotipom so bile narejene v dogovorjenem roku, tisk je oster in barve točno take, kot smo jih želeli." },
  { ime: "Gradbeno podjetje (primer)", vloga: "Polo majice in delovna oblačila", besedilo: "Za celo ekipo smo naročili majice z vezenim logotipom. Svetovali so nam pri izbiri materiala, kar se je izkazalo za odlično." },
  { ime: "Turistična agencija (primer)", vloga: "Koledarji in poslovna darila", besedilo: "Novoletna darila za partnerje vsako leto naročamo tu. Pokličeš, poveš idejo, in za ostalo poskrbijo sami." },
];

function Zvezdice({ velikost = "h-4 w-4" }: { velikost?: string }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`${velikost} fill-[#facc15] text-[#facc15]`} />
      ))}
    </div>
  );
}

function Stranke() {
  return (
    <section className="bg-[#0b1530] text-white">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#8fb0ff]">Zadovoljne stranke</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Zaupajo nam podjetja iz vse Slovenije</h2>
          </div>
          <div className="flex items-center gap-3">
            <Zvezdice velikost="h-5 w-5" />
            <span className="text-sm text-white/70">ocena z Googla — vstavimo vašo pravo</span>
          </div>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {MNENJA.map((m) => (
            <figure key={m.ime} className="flex flex-col rounded-xl bg-white/[0.06] p-6 ring-1 ring-white/10">
              <Zvezdice />
              <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-white/85">“{m.besedilo}”</blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1546d8] text-sm font-bold">{m.ime[0]}</span>
                <span>
                  <span className="block text-sm font-bold">{m.ime}</span>
                  <span className="block text-xs text-white/55">{m.vloga}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-6 text-xs text-white/45">
          Mnenja so v predogledu primer. Na pravi strani prikažemo vaša resnična mnenja strank (npr. z Googla ali Facebooka).
        </p>
      </div>
    </section>
  );
}

/* ───────────────────────── paket 1: povpraševanje ───────────────────────── */

function NalaganjeLoga({ logo, setLogo }: { logo: string | null; setLogo: (l: string | null) => void }) {
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
      <button type="button" onClick={() => ref.current?.click()} className={`flex items-center gap-2 rounded-lg ${OBROBA} bg-white px-4 py-2.5 text-sm font-semibold hover:border-[#1546d8]`}>
        <Upload className="h-4 w-4" /> {logo ? "Zamenjaj logotip" : "Naloži logotip"}
      </button>
      {logo && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="Logotip" className={`h-10 w-10 rounded ${OBROBA} bg-white object-contain p-1`} />
          <button type="button" onClick={() => setLogo(null)} className="text-xs text-[#6b7280] underline">
            odstrani
          </button>
        </>
      )}
    </div>
  );
}

const VNOS = "w-full rounded-lg border border-[#d9dde6] bg-white px-4 py-3 text-sm outline-none focus:border-[#1546d8] focus:ring-2 focus:ring-[#1546d8]/15";

function Polje({ oznaka, tip = "text" }: { oznaka: string; tip?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[#4b5563]">{oznaka}</span>
      <input type={tip} className={VNOS} />
    </label>
  );
}

function Povprasevanje({ logo, setLogo }: { logo: string | null; setLogo: (l: string | null) => void }) {
  const [poslano, setPoslano] = useState(false);
  return (
    <section id="povprasevanje" className="scroll-mt-12 mx-auto max-w-7xl px-4 py-16">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1546d8]">Povpraševanje</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Pošljite nam idejo in logotip</h2>
          <p className="mt-3 max-w-md text-[#4b5563]">Povejte, kaj potrebujete in v kakšni količini. Pripravimo ponudbo z vizualizacijo — ali pa nas preprosto pokličite.</p>
          <a href={KONTAKT.telefonHref} className="mt-6 inline-flex items-center gap-3 text-3xl font-extrabold tracking-tight hover:text-[#1546d8]">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#eef3ff]">
              <Phone className="h-6 w-6 text-[#1546d8]" />
            </span>
            {KONTAKT.telefon}
          </a>
          <div className="mt-8 hidden grid-cols-2 gap-3 sm:grid">
            <Foto ime="kat-skatle" className="aspect-square" />
            <Foto ime="kat-vrecke" className="aspect-square" />
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPoslano(true);
          }}
          className={`space-y-4 rounded-2xl ${OBROBA} bg-white p-6 shadow-sm sm:p-8`}
        >
          {poslano ? (
            <div className="py-16 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#eef3ff]">
                <Check className="h-7 w-7 text-[#1546d8]" />
              </span>
              <p className="mt-4 text-2xl font-extrabold">Hvala za povpraševanje!</p>
              <p className="mt-2 text-sm text-[#6b7280]">Predogled — povpraševanje ni bilo nikamor poslano.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Polje oznaka="Ime in priimek" />
                <Polje oznaka="Podjetje" />
                <Polje oznaka="E-pošta" tip="email" />
                <Polje oznaka="Telefon" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-[#4b5563]">Kaj potrebujete</span>
                  <select className={VNOS}>
                    {KATEGORIJE.map((k) => (
                      <option key={k.id}>{k.ime}</option>
                    ))}
                  </select>
                </label>
                <Polje oznaka="Količina (pribl.)" tip="number" />
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-[#4b5563]">Opis</span>
                <textarea rows={3} className={VNOS} />
              </label>
              <NalaganjeLoga logo={logo} setLogo={setLogo} />
              <button className={`flex w-full items-center justify-center gap-2 rounded-lg py-3.5 text-sm font-semibold ${MODRA}`}>
                Pošlji povpraševanje <Send className="h-4 w-4" />
              </button>
            </>
          )}
        </form>
      </div>
    </section>
  );
}

/* ───────────────────────── paket 2: trgovina ───────────────────────── */

function Trgovina({ odpri, filter, setFilter }: { odpri: (i: Izdelek) => void; filter: string; setFilter: (f: string) => void }) {
  const prikazani = filter === "vse" ? IZDELKI : IZDELKI.filter((i) => i.kategorija === filter);
  return (
    <section id="trgovina" className="scroll-mt-12 border-t border-[#e9ecf2] bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1546d8]">Spletna trgovina</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Izračunajte ceno in naročite</h2>
          </div>
          <p className="text-sm text-[#6b7280]">Cene so informativni primer.</p>
        </div>
        <div className="mb-8 flex flex-wrap gap-2">
          {[{ id: "vse", ime: "Vse" }, ...KATEGORIJE].map((k) => (
            <button
              key={k.id}
              onClick={() => setFilter(k.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                filter === k.id ? "bg-[#0b1530] text-white" : "bg-[#f1f3f7] text-[#374151] hover:bg-[#e6e9f0]"
              }`}
            >
              {k.ime}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {prikazani.map((i) => (
            <article key={i.id} className={`group flex flex-col overflow-hidden rounded-xl ${OBROBA} bg-white transition hover:shadow-lg hover:shadow-black/5`}>
              <div className="aspect-square overflow-hidden bg-[#eef0f4]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slika(i.slika)} alt={i.ime} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="text-sm font-bold leading-snug sm:text-base">{i.ime}</h3>
                <p className="mt-1 text-xs text-[#6b7280]">{i.opis}</p>
                <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-4">
                  <div>
                    <p className="text-[11px] text-[#6b7280]">že od</p>
                    <p className="text-xl font-extrabold">
                      {eur(i.cena)} <span className="text-xs font-medium text-[#6b7280]">/ kos</span>
                    </p>
                    <p className="text-[11px] text-[#9aa1ad]">min. {i.min} kos</p>
                  </div>
                  <button onClick={() => odpri(i)} className={`rounded-lg px-3.5 py-2 text-xs font-semibold ${MODRA}`}>
                    Sestavi
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
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
  const [pogled, setPogled] = useState<"foto" | "tisk">("foto");
  const c = izracun(izdelek, kolicina, tiskId);
  const prikaziLogo = tiskId !== "brez" ? logo : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0b1530]/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={zapri}>
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#eef0f4] px-6 py-4">
          <p className="text-sm font-semibold text-[#6b7280]">Sestavite naročilo</p>
          <button onClick={zapri} aria-label="Zapri" className="rounded-lg p-1 hover:bg-[#f1f3f7]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid md:grid-cols-2">
          <div className="bg-[#f6f7f9] p-6">
            <div className="mb-3 flex gap-1 rounded-lg bg-white p-1 text-xs font-semibold">
              {(["foto", "tisk"] as const).map((v) => (
                <button key={v} onClick={() => setPogled(v)} className={`flex-1 rounded-md py-1.5 ${pogled === v ? "bg-[#0b1530] text-white" : "text-[#6b7280]"}`}>
                  {v === "foto" ? "Fotografija" : "Predogled tiska"}
                </button>
              ))}
            </div>
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-white">
              {pogled === "foto" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={slika(izdelek.slika)} alt={izdelek.ime} className="h-full w-full object-cover" />
              ) : (
                <Ilustracija oblika={izdelek.oblika} barva={izdelek.barva} logo={prikaziLogo} className="h-4/5 w-4/5" />
              )}
            </div>
          </div>
          <div className="space-y-5 p-6">
            <div>
              <h3 className="text-2xl font-extrabold leading-tight">{izdelek.ime}</h3>
              <p className="text-sm text-[#6b7280]">{izdelek.opis}</p>
            </div>
            <div>
              <div className="mb-2 flex justify-between text-sm font-semibold">
                <span className="text-[#4b5563]">Količina</span>
                <span>{kolicina.toLocaleString("sl-SI")} kos</span>
              </div>
              <input
                type="range"
                min={izdelek.min}
                max={10000}
                step={izdelek.min >= 100 ? 50 : 10}
                value={kolicina}
                onChange={(e) => setKolicina(Number(e.target.value))}
                className="w-full accent-[#1546d8]"
              />
              <div className="mt-2 flex gap-2">
                {[izdelek.min, 500, 1000, 5000].filter((v, i, a) => a.indexOf(v) === i && v >= izdelek.min).map((v) => (
                  <button key={v} onClick={() => setKolicina(v)} className="rounded-md bg-[#f1f3f7] px-2.5 py-1 text-xs font-medium hover:bg-[#e6e9f0]">
                    {v.toLocaleString("sl-SI")}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-[#4b5563]">Tisk</p>
              <div className="grid grid-cols-2 gap-2">
                {TISKI.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTiskId(t.id);
                      if (t.id !== "brez") setPogled("tisk");
                    }}
                    className={`rounded-lg px-3 py-2.5 text-left text-xs font-semibold ${
                      tiskId === t.id ? "bg-[#1546d8] text-white" : `${OBROBA} hover:border-[#1546d8]`
                    }`}
                  >
                    {t.ime}
                  </button>
                ))}
              </div>
            </div>
            {tiskId !== "brez" && (
              <NalaganjeLoga
                logo={logo}
                setLogo={(l) => {
                  setLogo(l);
                  setPogled("tisk");
                }}
              />
            )}
            <div className="space-y-1.5 rounded-xl bg-[#f6f7f9] p-4 text-sm">
              <Vrstica a="Cena na kos" b={eur(c.naKos)} />
              {c.popust > 0 && <Vrstica a="Količinski popust" b={`−${Math.round(c.popust * 100)} %`} poudari />}
              {c.priprava > 0 && <Vrstica a="Priprava tiska (enkratno)" b={eur(c.priprava)} />}
              <div className="flex items-end justify-between border-t border-[#e3e6ee] pt-3">
                <span className="text-xs font-semibold text-[#6b7280]">Skupaj brez DDV</span>
                <span className="text-3xl font-extrabold">{eur(c.skupaj)}</span>
              </div>
              <p className="text-[11px] text-[#9aa1ad]">Predogled — cene so informativni primer, ne ponudba.</p>
            </div>
            <button
              onClick={() => dodaj({ izdelek, kolicina, tiskId, logo: prikaziLogo })}
              className={`flex w-full items-center justify-center gap-2 rounded-lg py-3.5 text-sm font-semibold ${MODRA}`}
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
      <span className="text-[#6b7280]">{a}</span>
      <span className={poudari ? "font-bold text-[#1546d8]" : "font-semibold"}>{b}</span>
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
    <div className="fixed inset-0 z-[60] flex justify-end bg-[#0b1530]/50 backdrop-blur-sm" onClick={zapri}>
      <aside className="flex h-full w-full max-w-md flex-col bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#eef0f4] px-6 py-5">
          <h3 className="text-xl font-extrabold">Košarica</h3>
          <button onClick={zapri} aria-label="Zapri" className="rounded-lg p-1 hover:bg-[#f1f3f7]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-6">
          {postavke.length === 0 && <p className="py-10 text-center text-sm text-[#6b7280]">Košarica je prazna.</p>}
          {postavke.map((p) => {
            const c = izracun(p.izdelek, p.kolicina, p.tiskId);
            return (
              <div key={p.id} className={`flex gap-3 rounded-xl ${OBROBA} p-3`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slika(p.izdelek.slika)} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{p.izdelek.ime}</p>
                  <p className="text-xs text-[#6b7280]">
                    {p.kolicina.toLocaleString("sl-SI")} kos · {TISKI.find((t) => t.id === p.tiskId)?.ime}
                    {p.logo ? " · z logotipom" : ""}
                  </p>
                  <p className="mt-1 text-sm font-extrabold">{eur(c.skupaj)}</p>
                </div>
                <button onClick={() => odstrani(p.id)} className="self-start text-[#9aa1ad] hover:text-[#0b1530]" aria-label="Odstrani">
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="space-y-3 border-t border-[#eef0f4] p-6">
          <div className="flex items-end justify-between">
            <span className="text-sm font-semibold text-[#6b7280]">Skupaj brez DDV</span>
            <span className="text-3xl font-extrabold">{eur(skupaj)}</span>
          </div>
          <button
            disabled={postavke.length === 0}
            onClick={oddaj}
            className={`flex w-full items-center justify-center gap-2 rounded-lg py-3.5 text-sm font-semibold disabled:opacity-40 ${MODRA}`}
          >
            Oddaj naročilo <ArrowRight className="h-4 w-4" />
          </button>
          <p className="text-center text-[11px] text-[#9aa1ad]">Predogled — naročilo se ne pošlje nikamor.</p>
        </div>
      </aside>
    </div>
  );
}

function Potrdilo({ st, zapri }: { st: string; zapri: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0b1530]/60 p-4" onClick={zapri}>
      <div className="w-full max-w-md rounded-2xl bg-white p-8" onClick={(e) => e.stopPropagation()}>
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#eef3ff]">
          <Check className="h-7 w-7 text-[#1546d8]" />
        </span>
        <h3 className="mt-4 text-2xl font-extrabold">Naročilo prejeto</h3>
        <p className="mt-2 text-sm text-[#4b5563]">
          Številka naročila <b>{st}</b>. V pravi trgovini bi stranka zdaj dobila e-mail s potrdilom in predračunom, Kamenarič pa naročilo z logotipom v prilogi.
        </p>
        <p className="mt-4 rounded-lg bg-[#f6f7f9] p-3 text-xs text-[#6b7280]">To je predogled — naročilo ni bilo poslano.</p>
        <button onClick={zapri} className={`mt-6 w-full rounded-lg py-3 text-sm font-semibold ${MODRA}`}>
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

function Kartica({ ikona: I, naslov, children }: { ikona: typeof Bot; naslov: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl ${OBROBA} bg-white p-6`}>
      <p className="mb-4 flex items-center gap-2 text-sm font-bold">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef3ff]">
          <I className="h-4 w-4 text-[#1546d8]" />
        </span>
        {naslov}
      </p>
      {children}
    </div>
  );
}

function Portal({ logo, setLogo, dodaj }: { logo: string | null; setLogo: (l: string | null) => void; dodaj: (p: Omit<Postavka, "id">) => void }) {
  return (
    <section id="portal" className="scroll-mt-12 bg-[#eef3ff]">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1546d8]">Portal za podjetja</p>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Vaš račun. Vaše cene. Vaša naročila.</h2>

        <div className={`mb-6 mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl ${OBROBA} bg-white p-5`}>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0b1530] text-lg font-bold text-white">PN</div>
            <div>
              <p className="text-xs text-[#6b7280]">Prijavljeni kot (primer)</p>
              <p className="font-bold">Pekarna Novak d.o.o.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-[#1546d8] px-3 py-1.5 text-white">Vaš popust −12 %</span>
            <span className="rounded-full bg-[#f1f3f7] px-3 py-1.5">Plačilo na 30 dni</span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <AiPomocnik dodaj={dodaj} logo={logo} />
          <Kartica ikona={Package} naslov="3D predogled z vašim logotipom">
            <div className="flex flex-col items-center gap-4">
              <Skatla3D logo={logo} barva="#c69c6d" velikost={190} samaSeVrti={false} />
              <NalaganjeLoga logo={logo} setLogo={setLogo} />
              <p className="text-center text-xs text-[#6b7280]">Naložite logotip in zavrtite škatlo — tako bo videti, še preden jo naročite.</p>
            </div>
          </Kartica>
          <Kartica ikona={RotateCcw} naslov="Pretekla naročila">
            <div className="divide-y divide-[#eef0f4]">
              {PRETEKLA.map((n) => {
                const iz = IZDELKI.find((i) => i.id === n.izdelek)!;
                return (
                  <div key={n.st} className="flex items-center gap-3 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={slika(iz.slika)} alt="" className="h-12 w-12 rounded-lg object-cover" />
                    <div className="flex-1">
                      <p className="text-sm font-bold">{n.opis}</p>
                      <p className="text-xs text-[#6b7280]">
                        {n.st} · {n.datum} · {n.kolicina} kos
                      </p>
                    </div>
                    <button onClick={() => dodaj({ izdelek: iz, kolicina: n.kolicina, tiskId: n.tisk, logo })} className={`rounded-lg px-3 py-2 text-xs font-semibold ${MODRA}`}>
                      Ponovi
                    </button>
                  </div>
                );
              })}
            </div>
          </Kartica>
          <Kartica ikona={Truck} naslov="Sledenje · KM-2026-0131">
            <ol className="space-y-4">
              {[
                ["Naročilo potrjeno", "2. 10.", true],
                ["Grafična priprava odobrena", "3. 10.", true],
                ["V tisku", "danes", true],
                ["Odprema", "predvidoma 9. 10.", false],
              ].map(([a, b, ok]) => (
                <li key={a as string} className="flex items-center gap-4">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full ${ok ? "bg-[#1546d8] text-white" : "border-2 border-[#d9dde6]"}`}>
                    {ok ? <Check className="h-4 w-4" /> : null}
                  </span>
                  <span className={`flex-1 text-sm font-semibold ${ok ? "" : "text-[#9aa1ad]"}`}>{a}</span>
                  <span className="text-xs text-[#6b7280]">{b}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 rounded-xl bg-[#fff7e6] p-4 text-sm ring-1 ring-[#fde3a7]">
              <p className="font-bold text-[#a16207]">Opomnik pred sezono</p>
              <p className="mt-1 text-[#4b5563]">Lani ste 4. 11. naročili 300 koledarjev. Želite letos enake — z novo fotografijo?</p>
            </div>
          </Kartica>
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

const PREDLOGI = ["500 vrečk z logotipom do petka", "200 darilnih škatel z reliefnim tiskom", "300 koledarjev s fotografijami"];

function AiPomocnik({ dodaj, logo }: { dodaj: (p: Omit<Postavka, "id">) => void; logo: string | null }) {
  const [sporocila, setSporocila] = useState<Sporocilo[]>([
    { od: "ai", besedilo: "Pozdravljeni! Napišite, kaj potrebujete, in sestavim ponudbo v nekaj sekundah." },
  ]);
  const [vnos, setVnos] = useState("");

  function poslji(besedilo: string) {
    if (!besedilo.trim()) return;
    setSporocila((s) => [...s, { od: "jaz", besedilo }, razumi(besedilo, logo)]);
    setVnos("");
  }

  return (
    <Kartica ikona={Bot} naslov="AI pomočnik za ponudbe">
      <div className="flex max-h-80 min-h-56 flex-col gap-3 overflow-y-auto pr-1">
        {sporocila.map((s, i) => (
          <div key={i} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${s.od === "jaz" ? "self-end bg-[#1546d8] text-white" : "self-start bg-[#f1f3f7]"}`}>
            {s.besedilo}
            {s.predlog && (
              <button onClick={() => dodaj(s.predlog!)} className="mt-3 flex items-center gap-1.5 rounded-lg bg-[#0b1530] px-3 py-1.5 text-xs font-semibold text-white">
                <ShoppingBag className="h-3.5 w-3.5" /> V košarico
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {PREDLOGI.map((p) => (
          <button key={p} onClick={() => poslji(p)} className="flex items-center gap-1 rounded-full bg-[#eef3ff] px-3 py-1 text-[11px] font-medium text-[#1546d8] hover:bg-[#dfe8ff]">
            <Sparkles className="h-3 w-3" /> {p}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          poslji(vnos);
        }}
        className="mt-3 flex gap-2"
      >
        <input value={vnos} onChange={(e) => setVnos(e.target.value)} placeholder="npr. 1000 PE vrečk, 2 barvi, do 15. 11." className={VNOS} />
        <button className={`rounded-lg px-4 ${MODRA}`} aria-label="Pošlji">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </Kartica>
  );
}

/* ───────────────────────── kaj dobite, noga ───────────────────────── */

function KajDobite({ paket, setPaket }: { paket: Paket; setPaket: (p: Paket) => void }) {
  const v = VSEBINA_PAKETOV[paket];
  const naslednji = paket < 3 ? ((paket + 1) as Paket) : null;
  return (
    <section id="kaj-dobite" className="scroll-mt-10 bg-[#1546d8] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/70">Za Kamenarič d.o.o. · pripravil KodaTim</p>
          <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{v.naslov}</h2>
          <p className="mt-5 max-w-md text-lg text-white/85">{v.zakaj}</p>
          <div className="mt-8 flex flex-wrap gap-2">
            {PAKETI.map((p) => (
              <button
                key={p.st}
                onClick={() => setPaket(p.st)}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${paket === p.st ? "bg-white text-[#1546d8]" : "bg-white/10 hover:bg-white/20"}`}
              >
                {p.st} · {p.ime}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-8 text-[#0b1530]">
          <ul className="space-y-4">
            {v.tocke.map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#eef3ff]">
                  <Check className="h-3.5 w-3.5 text-[#1546d8]" />
                </span>
                <span className="leading-snug">{t}</span>
              </li>
            ))}
          </ul>
          {naslednji && (
            <button
              onClick={() => setPaket(naslednji)}
              className={`mt-8 flex w-full items-center justify-between rounded-xl ${OBROBA} px-5 py-4 text-left hover:border-[#1546d8]`}
            >
              <span>
                <span className="block text-xs text-[#6b7280]">Še korak dlje</span>
                <span className="font-bold">
                  Poglej paket {naslednji} — {PAKETI[naslednji - 1].kratko}
                </span>
              </span>
              <ArrowRight className="h-5 w-5 text-[#1546d8]" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Noga() {
  return (
    <footer className="bg-[#0b1530] text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-4 py-10">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-white p-1.5">
            <ZnakK className="h-8 w-8" />
          </span>
          <div>
            <p className="text-lg font-extrabold">KAMENARIČ</p>
            <p className="text-xs text-white/60">{KONTAKT.podjetje} · embalaža, tisk, poslovna darila</p>
          </div>
        </div>
        <div className="text-right">
          <a href={KONTAKT.telefonHref} className="flex items-center gap-2 text-xl font-bold hover:text-[#8fb0ff]">
            <Phone className="h-5 w-5" /> {KONTAKT.telefon}
          </a>
          <p className="mt-1 text-xs text-white/40">Predogled nove strani · izdelal KodaTim.si</p>
        </div>
      </div>
    </footer>
  );
}
