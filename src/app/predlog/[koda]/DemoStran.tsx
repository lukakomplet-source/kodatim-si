"use client";

/* eslint-disable @next/next/no-img-element -- slike se nalagajo z njihove strani (pri nas jih ni), optimizacija jih ne more brati */
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Mail,
  MapPin,
  Package,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import type { DemoVsebina, Funkcija, Predlog } from "@/lib/predlogi";
import { PredogledFunkcije } from "./PredogledFunkcije";

/**
 * Demo nove strani podjetja v treh paketih — tako kot je Luka naredil za
 * Kamenarič (kodatim.si/kamenaric): zgoraj vrstica s paketi, spodaj njihova
 * nova stran, ki z vsakim paketom pridobi del (Google in AI vidnost, nato
 * delujoča aplikacija), na koncu »Kaj dobite« s cenami in garancijo.
 *
 * Besedila so iz njihovih javnih podatkov; slike se nalagajo z njihove strani
 * (no-referrer), pri nas niso shranjene — če se slika ne naloži, je namesto
 * nje barvna ploskev. Nič se ne pošlje in nič se ne shrani.
 */

type Paket = 1 | 2 | 3;

const PRIVZETA_BARVA = "#1546d8";

const KRATKO: Record<Funkcija, { paket: string; meni: string }> = {
  rezervacija: { paket: "Naročanje", meni: "Rezervacija" },
  narocilo: { paket: "Naročila", meni: "Naročilo" },
  povprasevanje: { paket: "Povpraševanja", meni: "Povpraševanje" },
  ai_asistent: { paket: "AI pomočnik", meni: "Pomočnik" },
  portal: { paket: "B2B portal", meni: "Portal" },
};

const OSNOVA: Record<"1" | "2" | "3", string[]> = {
  "1": ["Hitra in varna stran, lepa na telefonu in računalniku", "Obrazec za povpraševanje na vsaki strani"],
  "2": ["Vse iz paketa 1", "Priprava za Google in AI iskalnike (ChatGPT): opisi, vprašanja, lokalno iskanje"],
  "3": ["Vse iz paketa 2"],
};

export function DemoStran({ p, zacetniPaket, zaSliko = false }: { p: Predlog; zacetniPaket: Paket; zaSliko?: boolean }) {
  const d = p.demo as DemoVsebina;
  const [paket, setPaketStanje] = useState<Paket>(zacetniPaket);
  const barva = /^#[0-9a-f]{6}$/i.test(d.barva) ? d.barva : PRIVZETA_BARVA;
  const slog = { "--b": barva } as CSSProperties;

  function setPaket(novi: Paket) {
    setPaketStanje(novi);
    const url = new URL(window.location.href);
    url.searchParams.set("paket", String(novi));
    window.history.replaceState(null, "", url);
  }

  return (
    <div style={slog} className="min-h-screen overflow-x-hidden bg-white text-[#0b1530] antialiased">
      {!zaSliko && <DemoVrstica p={p} paket={paket} setPaket={setPaket} />}
      <Glava p={p} d={d} paket={paket} />
      <Uvod p={p} d={d} paket={paket} />
      <Ponudba d={d} />
      {paket === 3 && <Aplikacija p={p} d={d} />}
      <Prednosti d={d} />
      {paket >= 2 && <Vidnost p={p} d={d} />}
      {paket < 3 && !zaSliko && <Namig p={p} paket={paket} setPaket={setPaket} />}
      <Koraki d={d} />
      <ONas p={p} d={d} />
      <Kontakt p={p} d={d} />
      {!zaSliko && <KajDobite p={p} d={d} paket={paket} setPaket={setPaket} />}
      <Noga p={p} d={d} />
    </div>
  );
}

/* ───────────────────────── vrstica s paketi ───────────────────────── */

function imePaketa(p: Predlog, st: Paket): string {
  if (st === 1) return "Osnovna";
  if (st === 2) return "Google in AI";
  return KRATKO[p.funkcija]?.paket ?? "Aplikacija";
}

function DemoVrstica({ p, paket, setPaket }: { p: Predlog; paket: Paket; setPaket: (p: Paket) => void }) {
  return (
    <div className="sticky top-0 z-50 bg-[#0b1530] text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2">
        <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
          Predogled nove strani za {p.kratko_ime} · KodaTim
        </p>
        <div className="flex items-center gap-1">
          {([1, 2, 3] as Paket[]).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setPaket(st)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                paket === st ? "bg-[var(--b)] text-white" : "text-white/70 hover:bg-white/10"
              }`}
            >
              {st} <span className="hidden sm:inline">· {imePaketa(p, st)}</span>
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

/* ───────────────────────── slike in logotip (z njihove strani) ───────────────────────── */

function Slika({ src, alt, className = "", takoj = false }: { src?: string; alt: string; className?: string; takoj?: boolean }) {
  const [napaka, setNapaka] = useState(false);
  if (!src || napaka) {
    return (
      <div className={`flex items-center justify-center bg-[color-mix(in_srgb,var(--b)_10%,white)] ${className}`}>
        <Package className="h-9 w-9 text-[var(--b)] opacity-40" />
      </div>
    );
  }
  return (
    <img
      ref={(img) => {
        // Slika, ki odpove, preden se stran zažene, ne sproži onError — ujamemo jo tu.
        if (img?.complete && img.naturalWidth === 0) setNapaka(true);
      }}
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading={takoj ? "eager" : "lazy"}
      onError={() => setNapaka(true)}
      className={`object-cover ${className}`}
    />
  );
}

function Logotip({ p, d }: { p: Predlog; d: DemoVsebina }) {
  const [napaka, setNapaka] = useState(false);
  if (d.logo && !napaka) {
    return (
      <img
        ref={(img) => {
          if (img?.complete && img.naturalWidth === 0) setNapaka(true);
        }}
        src={d.logo}
        alt={p.kratko_ime}
        referrerPolicy="no-referrer"
        onError={() => setNapaka(true)}
        className="h-10 w-auto max-w-[200px] object-contain"
      />
    );
  }
  return <span className="text-xl font-extrabold tracking-tight text-[var(--b)]">{p.kratko_ime}</span>;
}

/* ───────────────────────── glava in uvod ───────────────────────── */

function Glava({ p, d, paket }: { p: Predlog; d: DemoVsebina; paket: Paket }) {
  const k = d.kontakt ?? {};
  const meni = [
    { ime: "Ponudba", cilj: "#ponudba" },
    ...(paket === 3 ? [{ ime: KRATKO[p.funkcija]?.meni ?? "Aplikacija", cilj: "#funkcija" }] : []),
    ...(paket >= 2 && d.vprasanja.length > 0 ? [{ ime: "Vprašanja", cilj: "#vprasanja" }] : []),
    { ime: "O nas", cilj: "#o-nas" },
    { ime: "Kontakt", cilj: "#kontakt" },
  ];
  return (
    <header className="bg-white">
      {(k.telefon || k.email) && (
        <div className="border-b border-[#eef0f4] bg-[#f6f7f9]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-x-6 gap-y-1 px-4 py-1.5 text-xs text-[#4b5563]">
            {k.email && (
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-[var(--b)]" /> {k.email}
              </span>
            )}
            {k.telefon && (
              <span className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-[var(--b)]" /> {k.telefon}
              </span>
            )}
          </div>
        </div>
      )}
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
        <a href="#" className="shrink-0">
          <Logotip p={p} d={d} />
        </a>
        <nav className="hidden flex-1 items-center justify-center gap-7 text-sm font-medium text-[#1f2a44] lg:flex">
          {meni.map((m) => (
            <a key={m.ime} href={m.cilj} className="whitespace-nowrap hover:text-[var(--b)]">
              {m.ime}
            </a>
          ))}
        </nav>
        <a
          href={paket === 3 ? "#funkcija" : "#kontakt"}
          className="ml-auto flex shrink-0 items-center gap-2 rounded-lg bg-[var(--b)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          <span className="hidden sm:inline">{d.poziv}</span>
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </header>
  );
}

function Uvod({ p, d, paket }: { p: Predlog; d: DemoVsebina; paket: Paket }) {
  const [prva, druga, tretja] = d.slike;
  return (
    <section className="overflow-hidden bg-gradient-to-b from-white to-[#f6f7f9]">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-14 pt-10 lg:grid-cols-[1fr_1.05fr] lg:pb-20 lg:pt-14">
        <div className="min-w-0">
          {d.nadnaslov && (
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--b)]">{d.nadnaslov}</p>
          )}
          <h1 className="mt-5 text-[clamp(2.1rem,4.6vw,3.9rem)] font-extrabold leading-[1.05] tracking-tight">{d.naslov}</h1>
          {d.podnaslov && <p className="mt-5 max-w-lg text-lg text-[#374151]">{d.podnaslov}</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={paket === 3 ? "#funkcija" : "#kontakt"}
              className="flex items-center gap-2 rounded-lg bg-[var(--b)] px-6 py-3.5 text-sm font-semibold text-white hover:opacity-90"
            >
              {d.poziv} <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#ponudba"
              className="flex items-center gap-2 rounded-lg border border-[#e3e6ee] bg-white px-6 py-3.5 text-sm font-semibold hover:border-[var(--b)]"
            >
              {d.ponudba_naslov}
            </a>
          </div>
          {d.stevilke.length > 0 && (
            <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4 sm:divide-x sm:divide-[#e3e6ee]">
              {d.stevilke.map((s) => (
                <div key={s.oznaka} className="sm:pl-4 sm:first:pl-0">
                  <dt className="text-xl font-extrabold tracking-tight sm:text-2xl">{s.vrednost}</dt>
                  <dd className="text-xs leading-tight text-[#6b7280]">{s.oznaka}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        {prva ? (
          <div className="grid h-[320px] grid-cols-6 grid-rows-6 gap-3 sm:h-[460px]">
            <Slika takoj src={prva} alt={p.kratko_ime} className={`h-full w-full rounded-2xl ${druga ? "col-span-6 row-span-4" : "col-span-6 row-span-6"}`} />
            {druga && <Slika takoj src={druga} alt="" className={`h-full w-full rounded-2xl ${tretja ? "col-span-3" : "col-span-6"} row-span-2`} />}
            {tretja && <Slika takoj src={tretja} alt="" className="col-span-3 row-span-2 h-full w-full rounded-2xl" />}
          </div>
        ) : (
          <div className="flex h-[320px] items-center justify-center rounded-3xl bg-gradient-to-br from-[var(--b)] to-[color-mix(in_srgb,var(--b)_55%,black)] p-10 text-center text-white sm:h-[420px]">
            <div>
              <p className="text-3xl font-extrabold tracking-tight">{p.kratko_ime}</p>
              {d.nadnaslov && <p className="mt-3 text-white/80">{d.nadnaslov}</p>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ───────────────────────── ponudba, prednosti ───────────────────────── */

function Naslov({ nad, children, svetlo = false }: { nad: string; children: ReactNode; svetlo?: boolean }) {
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-[0.3em] ${svetlo ? "text-white/70" : "text-[var(--b)]"}`}>{nad}</p>
      <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{children}</h2>
    </div>
  );
}

function Ponudba({ d }: { d: DemoVsebina }) {
  if (d.ponudba.length === 0) return null;
  // Slika gre k izdelku samo, če ji vemo pomen (ime datoteke, opis). Kadar jih za
  // večino izdelkov ne vemo, so kartice brez slik, njihove fotografije pa v galeriji —
  // nikoli slika pod napačnim izdelkom.
  const vUvodu = new Set(d.slike.slice(0, 3));
  const vPonudbi = new Set(d.ponudba.map((x) => x.slika).filter(Boolean));
  const sSlikami = vPonudbi.size * 2 >= d.ponudba.length;
  const galerija = sSlikami ? [] : d.slike.filter((s) => !vUvodu.has(s) && !vPonudbi.has(s)).slice(0, 4);
  return (
    <section id="ponudba" className="mx-auto max-w-7xl scroll-mt-14 px-4 py-16">
      <Naslov nad="Ponudba">{d.ponudba_naslov}</Naslov>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {d.ponudba.map((x) =>
          sSlikami ? (
            <article key={x.ime} className="group overflow-hidden rounded-2xl border border-[#e3e6ee] bg-white transition hover:border-[var(--b)] hover:shadow-lg hover:shadow-black/5">
              <Slika src={x.slika} alt={x.ime} className="aspect-[4/3] w-full transition duration-500 group-hover:scale-[1.03]" />
              <Opis x={x} />
            </article>
          ) : (
            <article key={x.ime} className="rounded-2xl border border-[#e3e6ee] bg-white transition hover:border-[var(--b)] hover:shadow-lg hover:shadow-black/5">
              <div className="px-5 pt-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--b)_10%,white)] text-lg font-extrabold text-[var(--b)]">
                  {x.ime.charAt(0)}
                </span>
              </div>
              <Opis x={x} />
            </article>
          ),
        )}
      </div>
      {galerija.length >= 2 && (
        <div className="mt-10">
          <p className="text-sm font-semibold text-[#1f2a44]">Iz naših del</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {galerija.map((s) => (
              <Slika key={s} src={s} alt="" className="aspect-[4/3] w-full rounded-xl" />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Opis({ x }: { x: DemoVsebina["ponudba"][number] }) {
  return (
    <div className="p-5">
      <h3 className="text-lg font-bold">{x.ime}</h3>
      {x.opis && <p className="mt-1.5 text-sm leading-relaxed text-[#4b5563]">{x.opis}</p>}
      <a href="#kontakt" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--b)]">
        Povprašajte <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  );
}

function Prednosti({ d }: { d: DemoVsebina }) {
  if (d.prednosti.length === 0) return null;
  return (
    <section className="bg-[#f6f7f9]">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <Naslov nad="Zakaj mi">Zakaj k nam</Naslov>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {d.prednosti.map((x) => (
            <div key={x.naslov} className="rounded-2xl border border-[#e3e6ee] bg-white p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--b)_10%,white)]">
                <Star className="h-5 w-5 text-[var(--b)]" />
              </span>
              <p className="mt-4 font-bold">{x.naslov}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#4b5563]">{x.opis}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── paket 2: Google in AI vidnost ───────────────────────── */

function Vidnost({ p, d }: { p: Predlog; d: DemoVsebina }) {
  const [odprto, setOdprto] = useState<number | null>(0);
  return (
    <section className="mx-auto max-w-7xl px-4 py-16">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <Naslov nad="Paket 2 · Google in AI vidnost">Ko vas iščejo, najdejo vas</Naslov>
          <p className="mt-4 max-w-md text-[#4b5563]">
            Stran je pripravljena tako, da jo Google in AI iskalniki (ChatGPT) razumejo: kdo ste, kaj ponujate in kje.
          </p>
          {d.iskanja.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {d.iskanja.map((i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f3f7] px-3 py-1.5 text-sm text-[#1f2a44]">
                  <Search className="h-3.5 w-3.5 text-[var(--b)]" /> {i}
                </span>
              ))}
            </div>
          )}
          {d.google.naslov && (
            <div className="mt-8 rounded-2xl border border-[#e3e6ee] bg-white p-5 shadow-sm">
              <p className="text-xs text-[#4d5156]">{p.domena}</p>
              <p className="mt-1 text-lg leading-snug text-[#1a0dab]">{d.google.naslov}</p>
              <p className="mt-1 text-sm leading-relaxed text-[#4d5156]">{d.google.opis}</p>
              <p className="mt-3 text-[11px] text-[#9aa1ad]">Tako bi bil videti vaš zadetek na Googlu.</p>
            </div>
          )}
        </div>
        {d.vprasanja.length > 0 && (
          <div id="vprasanja" className="scroll-mt-14">
            <p className="text-sm font-semibold text-[#1f2a44]">Pogosta vprašanja</p>
            <div className="mt-3 divide-y divide-[#e3e6ee] rounded-2xl border border-[#e3e6ee] bg-white">
              {d.vprasanja.map((v, i) => (
                <div key={v.v}>
                  <button
                    type="button"
                    onClick={() => setOdprto(odprto === i ? null : i)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold"
                  >
                    {v.v}
                    <ChevronDown className={`h-4 w-4 shrink-0 transition ${odprto === i ? "rotate-180" : ""}`} />
                  </button>
                  {odprto === i && <p className="px-5 pb-4 text-sm leading-relaxed text-[#4b5563]">{v.o}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ───────────────────────── paket 3: delujoča aplikacija ───────────────────────── */

function Aplikacija({ p, d }: { p: Predlog; d: DemoVsebina }) {
  const artikli = d.aplikacija.artikli.length > 0 ? d.aplikacija.artikli : p.storitve;
  return (
    <section id="funkcija" className="scroll-mt-14 bg-[#0b1530] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <Naslov nad={`Paket 3 · ${KRATKO[p.funkcija]?.paket ?? "Aplikacija"}`} svetlo>
            {d.aplikacija.naslov || p.funkcija_opis}
          </Naslov>
          {d.aplikacija.opis && <p className="mt-4 max-w-md text-lg text-white/80">{d.aplikacija.opis}</p>}
          {p.funkcija_opis && (
            <p className="mt-6 flex max-w-md gap-3 rounded-xl bg-white/5 p-4 text-sm leading-relaxed text-white/80">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[color-mix(in_srgb,var(--b)_60%,white)]" />
              {p.funkcija_opis}
            </p>
          )}
        </div>
        <div className="rounded-2xl bg-white p-6 text-[#0b1530] shadow-2xl shadow-black/30 sm:p-8">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#6b7280]">Preizkusite — tako vidi stranka</p>
          <PredogledFunkcije funkcija={p.funkcija} poziv={d.poziv} storitve={artikli} ime={p.kratko_ime} />
        </div>
      </div>
    </section>
  );
}

function Namig({ p, paket, setPaket }: { p: Predlog; paket: Paket; setPaket: (p: Paket) => void }) {
  const naslednji = (paket + 1) as Paket;
  return (
    <section className="mx-auto max-w-7xl px-4 pb-4">
      <button
        type="button"
        onClick={() => {
          setPaket(naslednji);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        className="flex w-full items-center justify-between gap-4 rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--b)_45%,white)] bg-[color-mix(in_srgb,var(--b)_5%,white)] px-6 py-5 text-left"
      >
        <span>
          <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--b)]">Predogled · paket {naslednji}</span>
          <span className="mt-1 block font-bold">
            {naslednji === 2
              ? "Poglejte, kako vas najdejo na Googlu in v ChatGPT"
              : `Poglejte ${(KRATKO[p.funkcija]?.paket ?? "aplikacijo").toLowerCase()} v živo`}
          </span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0 text-[var(--b)]" />
      </button>
    </section>
  );
}

/* ───────────────────────── koraki, o nas, kontakt ───────────────────────── */

function Koraki({ d }: { d: DemoVsebina }) {
  if (d.koraki.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-16">
      <Naslov nad="Kako poteka">Do nas v {d.koraki.length} korakih</Naslov>
      <ol className="mt-8 grid gap-4 sm:grid-cols-3">
        {d.koraki.map((k, i) => (
          <li key={k} className="rounded-2xl border border-[#e3e6ee] bg-white p-6">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--b)] text-sm font-bold text-white">{i + 1}</span>
            <p className="mt-4 font-semibold leading-snug">{k}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ONas({ p, d }: { p: Predlog; d: DemoVsebina }) {
  if (!d.o_nas) return null;
  const slika = d.slike[3] ?? d.slike[1];
  return (
    <section id="o-nas" className="scroll-mt-14 bg-[#f6f7f9]">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 lg:grid-cols-2">
        <div>
          <Naslov nad="O nas">{p.kratko_ime}</Naslov>
          <p className="mt-5 text-lg leading-relaxed text-[#374151]">{d.o_nas}</p>
        </div>
        {slika && <Slika src={slika} alt={p.kratko_ime} className="aspect-[4/3] w-full rounded-2xl" />}
      </div>
    </section>
  );
}

function Kontakt({ p, d }: { p: Predlog; d: DemoVsebina }) {
  const k = d.kontakt ?? {};
  const [poslano, setPoslano] = useState(false);
  const polje =
    "mt-1.5 block w-full cursor-default rounded-lg border border-[#d9dde6] bg-white px-4 py-3 text-sm text-[#9aa1ad] outline-none";
  return (
    <section id="kontakt" className="scroll-mt-14 bg-[color-mix(in_srgb,var(--b)_7%,white)]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <Naslov nad="Kontakt">Pišite nam ali pokličite</Naslov>
          <ul className="mt-6 space-y-3 text-[#1f2a44]">
            {k.telefon && (
              <li className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-[var(--b)]" /> {k.telefon}
              </li>
            )}
            {k.email && (
              <li className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-[var(--b)]" /> {k.email}
              </li>
            )}
            {(k.naslov || p.kraj) && (
              <li className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-[var(--b)]" /> {k.naslov || p.kraj}
              </li>
            )}
          </ul>
        </div>
        <div className="rounded-2xl border border-[#e3e6ee] bg-white p-6 sm:p-8">
          {poslano ? (
            <div className="py-6 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white">
                <Check className="h-6 w-6" />
              </span>
              <p className="mt-4 font-bold">Povpraševanje je poslano</p>
              <p className="mt-1 text-sm text-[#6b7280]">Predogled — nič ni bilo poslano.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {["Ime in priimek", "Podjetje", "E-pošta", "Telefon"].map((o) => (
                <label key={o} className="block text-xs font-semibold text-[#4b5563]">
                  {o}
                  <input readOnly tabIndex={-1} placeholder="Izpolni stranka" className={polje} />
                </label>
              ))}
              <label className="block text-xs font-semibold text-[#4b5563] sm:col-span-2">
                Sporočilo
                <textarea readOnly tabIndex={-1} rows={3} placeholder="Izpolni stranka" className={`${polje} resize-none`} />
              </label>
              <button
                type="button"
                onClick={() => setPoslano(true)}
                className="rounded-lg bg-[var(--b)] px-6 py-3.5 text-sm font-semibold text-white hover:opacity-90 sm:col-span-2"
              >
                Pošlji povpraševanje
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── kaj dobite (cene, garancija) ───────────────────────── */

function KajDobite({ p, d, paket, setPaket }: { p: Predlog; d: DemoVsebina; paket: Paket; setPaket: (p: Paket) => void }) {
  const kljuc = String(paket) as "1" | "2" | "3";
  const cena = p.cene?.find((c) => c.st === kljuc);
  const ai = p.cene?.find((c) => c.st === "+");
  const tocke = [...OSNOVA[kljuc], ...(d.paketi[kljuc] ?? [])];
  return (
    <section id="kaj-dobite" className="scroll-mt-12 bg-[var(--b)] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/70">Za {p.kratko_ime} · pripravil KodaTim</p>
          <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            Paket {paket} — {cena?.ime ?? imePaketa(p, paket)}
          </h2>
          {d.paketi_zakaj[kljuc] && <p className="mt-5 max-w-md text-lg text-white/85">{d.paketi_zakaj[kljuc]}</p>}
          <div className="mt-8 flex flex-wrap gap-2">
            {([1, 2, 3] as Paket[]).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setPaket(st)}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${paket === st ? "bg-white text-[var(--b)]" : "bg-white/10 hover:bg-white/20"}`}
              >
                {st} · {imePaketa(p, st)}
              </button>
            ))}
          </div>
          {p.garancija && (
            <div className="mt-8 flex max-w-md gap-3 rounded-xl bg-white/10 p-4 text-sm leading-relaxed text-white/90">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                <span className="font-semibold text-white">Brez tveganja: </span>
                {p.garancija}
              </p>
            </div>
          )}
        </div>
        <div className="rounded-2xl bg-white p-7 text-[#0b1530] sm:p-8">
          {cena && (
            <p className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#eef0f4] pb-4">
              <span className="font-bold">{cena.ime}</span>
              <span className="text-2xl font-extrabold text-[var(--b)]">{cena.cena}</span>
            </p>
          )}
          <ul className="mt-5 space-y-3.5">
            {tocke.map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--b)_12%,white)]">
                  <Check className="h-3.5 w-3.5 text-[var(--b)]" />
                </span>
                <span className="leading-snug">{t}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-2 rounded-xl bg-[#f6f7f9] p-4 text-sm text-[#4b5563]">
            {ai && (
              <p>
                <span className="font-semibold text-[#0b1530]">{ai.ime}:</span> {ai.cena} — {ai.opis}
              </p>
            )}
            {p.mesecnina && <p>{p.mesecnina}</p>}
            <p>
              Po želji uredimo tudi oglaševanje na Googlu in Facebooku, s proračunom, ki ga določite vi. Cilj je več strank in
              prometa, ne le lepša stran.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a href="tel:+38640199051" className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--b)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90">
              <Phone className="h-4 w-4" /> 040 199 051
            </a>
            <a
              href={`mailto:luka@kodatim.si?subject=${encodeURIComponent(`Predogled za ${p.kratko_ime}`)}`}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#e3e6ee] px-5 py-3 text-sm font-semibold hover:border-[var(--b)]"
            >
              <Mail className="h-4 w-4" /> luka@kodatim.si
            </a>
          </div>
          {p.garancija_pogoji && <p className="mt-4 text-[11px] leading-relaxed text-[#9aa1ad]">{p.garancija_pogoji}</p>}
        </div>
      </div>
    </section>
  );
}

function Noga({ p, d }: { p: Predlog; d: DemoVsebina }) {
  const k = d.kontakt ?? {};
  return (
    <footer className="bg-[#0b1530] text-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <p className="text-xl font-extrabold tracking-tight">{p.kratko_ime}</p>
          {d.nadnaslov && <p className="mt-2 max-w-xs text-sm text-white/60">{d.nadnaslov}</p>}
        </div>
        <div className="space-y-2 text-sm text-white/80">
          <p className="font-bold text-white">Kontakt</p>
          {k.telefon && <p>{k.telefon}</p>}
          {k.email && <p>{k.email}</p>}
          {(k.naslov || p.kraj) && <p>{k.naslov || p.kraj}</p>}
        </div>
        <div className="space-y-2 text-xs text-white/40">
          <p>Predogled nove strani · izdelal KodaTim.si</p>
          <p>
            To ni uradna stran podjetja {p.podjetje.replace(/\.+$/, "")}. Besedila so iz javnih podatkov, slike se nalagajo z
            vaše strani {p.domena} in jih na željo odstranimo.
          </p>
        </div>
      </div>
    </footer>
  );
}
