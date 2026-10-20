"use client";

/* eslint-disable @next/next/no-img-element -- slike se nalagajo z njihove strani (pri nas jih ni), optimizacija jih ne more brati */
import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  Mail,
  MapPin,
  Package,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import type { DemoVsebina, Funkcija, Predlog } from "@/lib/predlogi";
import { Eposta, Tekst } from "./Eposta";
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

export function DemoStran({
  p,
  zacetniPaket,
  zaSliko = false,
  pisava = "",
}: {
  p: Predlog;
  zacetniPaket: Paket;
  zaSliko?: boolean;
  /** Razred next/font z --font-demo (pisava naslovov po panogi). */
  pisava?: string;
}) {
  const d = p.demo as DemoVsebina;
  const [paket, setPaketStanje] = useState<Paket>(zacetniPaket);
  const barva = /^#[0-9a-f]{6}$/i.test(d.barva) ? d.barva : PRIVZETA_BARVA;
  const slog = { "--b": barva } as CSSProperties;

  // Vsaka slika enkrat: prve tri fotografije v uvodu, nato pri izdelkih, ostale v »O nas« in
  // galeriji. Tam samo fotografije (JPG, WebP): PNG so pogosto ikone ali logotipi njihovih strank.
  const fotografije = d.slike.filter(jeFotografija);
  const uvod = fotografije.slice(0, 3);
  const vUvodu = new Set(uvod);
  const vPonudbi = new Set(d.ponudba.map((x) => x.slika).filter(Boolean));
  const proste = fotografije.filter((s) => !vUvodu.has(s) && !vPonudbi.has(s));
  const slikaONas = proste[0];
  const galerija = proste.slice(1, 7);

  function setPaket(novi: Paket) {
    setPaketStanje(novi);
    const url = new URL(window.location.href);
    url.searchParams.set("paket", String(novi));
    window.history.replaceState(null, "", url);
  }

  return (
    // Za slike v mailu brez animacij, da se nič ne ujame napol vidno.
    <BrezAnimacij.Provider value={zaSliko}>
      <div
        style={slog}
        className={`${pisava} min-h-screen overflow-x-hidden bg-white text-[#15171c] antialiased [&_h1]:font-[family-name:var(--font-demo)] [&_h2]:font-[family-name:var(--font-demo)] [&_h3]:font-[family-name:var(--font-demo)]`}
      >
        {!zaSliko && <DemoVrstica p={p} paket={paket} setPaket={setPaket} />}
        <Glava p={p} d={d} paket={paket} />
        <Uvod p={p} d={d} paket={paket} slike={uvod} />
        <Trak d={d} />
        <Ponudba d={d} />
        {paket === 3 && <Aplikacija p={p} d={d} />}
        <Prednosti d={d} />
        {paket >= 2 && <Vidnost p={p} d={d} />}
        {paket < 3 && !zaSliko && <Namig p={p} paket={paket} setPaket={setPaket} />}
        <Galerija slike={galerija} />
        <Koraki d={d} />
        <ONas p={p} d={d} slika={slikaONas} />
        <Kontakt p={p} d={d} />
        {!zaSliko && <ZaLastnika p={p} />}
        {!zaSliko && <KajDobite p={p} d={d} paket={paket} setPaket={setPaket} />}
        <Noga p={p} d={d} />
      </div>
    </BrezAnimacij.Provider>
  );
}

function jeFotografija(url: string): boolean {
  return /\.(jpe?g|webp)(\?|$)/i.test(url);
}

/* ───────────────────────── animacije ───────────────────────── */

const BrezAnimacij = createContext(false);
const MEHKO = [0.16, 1, 0.3, 1] as const;

/**
 * Razdelki so mirni (frontend-design: zdrs ob vsakem razdelku je znak strani, ki jo
 * je naredil AI). Animacija je en sam premišljen trenutek — uvod ob odprtju — in
 * trak izdelkov, ki si ga je Luka želel. Ovoj ostane, da je razporeditev ista.
 */
function Pojav({ children, className }: { children: ReactNode; className?: string; zamik?: number }) {
  return <div className={className}>{children}</div>;
}

/** Trak pod uvodom: njihovi izdelki in prednosti, ki se počasi premikajo. */
function Trak({ d }: { d: DemoVsebina }) {
  const brez = useContext(BrezAnimacij);
  const besede = [...d.ponudba.map((x) => x.ime), ...d.prednosti.map((x) => x.naslov)];
  if (besede.length < 3) return null;
  return (
    <div className="overflow-hidden bg-[var(--b)] py-3 text-white">
      <motion.div
        className="flex w-max gap-10 whitespace-nowrap text-sm font-semibold"
        animate={brez ? undefined : { x: ["0%", "-50%"] }}
        transition={{ duration: 32, ease: "linear", repeat: Infinity }}
      >
        {[...besede, ...besede].map((b, i) => (
          <span key={i} className="flex items-center gap-10">
            {b}
            <Sparkles className="h-3.5 w-3.5 opacity-60" />
          </span>
        ))}
      </motion.div>
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
        <p className="min-w-0 truncate text-[11px] font-semibold text-white/70">
          Predogled nove strani za {p.kratko_ime}, pripravil KodaTim
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
              {st} <span className="hidden sm:inline">{imePaketa(p, st)}</span>
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
                <Mail className="h-3.5 w-3.5 text-[var(--b)]" /> <Eposta naslov={k.email} />
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
         
        </a>
      </div>
    </header>
  );
}

/**
 * Uvod: najbolj značilna stvar njihovega sveta je njihova fotografija, zato čez vso
 * širino; ob odprtju se počasi umiri, naslov vstopi z njo — edini trenutek gibanja.
 * Brez fotografije govori pisava: velik naslov na barvni ploskvi.
 */
function Uvod({ p, d, paket, slike }: { p: Predlog; d: DemoVsebina; paket: Paket; slike: string[] }) {
  const brez = useContext(BrezAnimacij);
  const [prva, druga, tretja] = slike;
  const nadnaslov = d.nadnaslov.replace(/\s·\s/g, ", ");
  if (prva) {
    return (
      <section className="relative isolate overflow-hidden bg-[#15171c] text-white">
        <motion.div
          className="absolute inset-0 -z-10"
          initial={brez ? false : { scale: 1.08, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.6, ease: MEHKO }}
        >
          <Slika takoj src={prva} alt={p.kratko_ime} className="h-full w-full" />
        </motion.div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#15171c]/90 via-[#15171c]/60 to-[#15171c]/10" />
        <div className="mx-auto grid min-h-[560px] max-w-7xl items-end gap-10 px-4 pb-14 pt-24 lg:min-h-[640px] lg:grid-cols-[1.25fr_0.75fr] lg:pb-20">
          <motion.div
            initial={brez ? false : { opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.25, ease: MEHKO }}
          >
            {nadnaslov && <p className="text-base font-medium text-white/75">{nadnaslov}</p>}
            <h1 className="mt-4 max-w-[14ch] text-[clamp(2.6rem,6.2vw,5.6rem)] font-bold leading-[0.98] tracking-[-0.03em]">
              {d.naslov}
            </h1>
            {d.podnaslov && (
              <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-white/85">
                <Tekst t={d.podnaslov} />
              </p>
            )}
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href={paket === 3 ? "#funkcija" : "#kontakt"}
                className="rounded-lg bg-[var(--b)] px-6 py-3.5 text-sm font-semibold text-white hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                {d.poziv}
              </a>
              <a
                href="#ponudba"
                className="rounded-lg bg-white/10 px-6 py-3.5 text-sm font-semibold text-white ring-1 ring-white/30 backdrop-blur hover:bg-white/20"
              >
                {d.ponudba_naslov}
              </a>
            </div>
          </motion.div>
          {(druga || d.stevilke.length > 0) && (
            <motion.div
              className="hidden gap-3 lg:grid"
              initial={brez ? false : { opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.5, ease: MEHKO }}
            >
              {druga && <Slika takoj src={druga} alt="" className="aspect-[4/3] w-full rounded-xl ring-1 ring-white/20" />}
              {d.stevilke.length > 0 && (
                <dl className="grid grid-cols-2 gap-3">
                  {d.stevilke.slice(0, 2).map((s) => (
                    <div key={s.oznaka} className="rounded-xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
                      <dt className="text-2xl font-bold tracking-tight">{s.vrednost}</dt>
                      <dd className="mt-1 text-sm leading-snug text-white/75">{s.oznaka}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {!d.stevilke.length && tretja && <Slika takoj src={tretja} alt="" className="aspect-[4/3] w-full rounded-xl ring-1 ring-white/20" />}
            </motion.div>
          )}
        </div>
      </section>
    );
  }
  return (
    <section className="overflow-hidden bg-gradient-to-b from-white to-[#f6f7f9]">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-14 pt-10 lg:grid-cols-[1fr_1.05fr] lg:pb-20 lg:pt-14">
        <Pojav className="min-w-0">
          {d.nadnaslov && (
            <p className="text-xs font-semibold text-[var(--b)]">{d.nadnaslov}</p>
          )}
          <h1 className="mt-5 text-[clamp(2.1rem,4.6vw,3.9rem)] font-extrabold leading-[1.05] tracking-tight">{d.naslov}</h1>
          {d.podnaslov && <p className="mt-5 max-w-lg text-lg text-[#374151]"><Tekst t={d.podnaslov} /></p>}
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={paket === 3 ? "#funkcija" : "#kontakt"}
              className="flex items-center gap-2 rounded-lg bg-[var(--b)] px-6 py-3.5 text-sm font-semibold text-white hover:opacity-90"
            >
              {d.poziv}
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
        </Pojav>
        {prva ? (
          <Pojav zamik={0.12} className="grid h-[320px] grid-cols-6 grid-rows-6 gap-3 sm:h-[460px]">
            <Slika takoj src={prva} alt={p.kratko_ime} className={`h-full w-full rounded-2xl ${druga ? "col-span-6 row-span-4" : "col-span-6 row-span-6"}`} />
            {druga && <Slika takoj src={druga} alt="" className={`h-full w-full rounded-2xl ${tretja ? "col-span-3" : "col-span-6"} row-span-2`} />}
            {tretja && <Slika takoj src={tretja} alt="" className="col-span-3 row-span-2 h-full w-full rounded-2xl" />}
          </Pojav>
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

/** Naslov razdelka. Oznaka nad njim samo, kadar nekaj pove (kateri paket, komu je namenjeno). */
function Naslov({ nad, children, svetlo = false }: { nad: string; children: ReactNode; svetlo?: boolean }) {
  const pove = /^(Paket|Za vas|Za )/.test(nad);
  return (
    <div className="max-w-3xl">
      {pove && (
        <p
          className={`mb-4 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
            svetlo ? "bg-white/10 text-white" : "bg-[color-mix(in_srgb,var(--b)_12%,white)] text-[var(--b)]"
          }`}
        >
          {nad}
        </p>
      )}
      <h2 className="text-[clamp(1.9rem,3.6vw,3rem)] font-bold leading-[1.08] tracking-[-0.02em]">{children}</h2>
    </div>
  );
}

function Ponudba({ d }: { d: DemoVsebina }) {
  if (d.ponudba.length === 0) return null;
  // Slika gre k izdelku samo, če ji vemo pomen (ime datoteke, opis). Kadar jih za
  // večino izdelkov ne vemo, so kartice brez slik, njihove fotografije pa v galeriji —
  // nikoli slika pod napačnim izdelkom.
  const sSlikami = d.ponudba.filter((x) => x.slika).length * 2 >= d.ponudba.length;
  return (
    <section id="ponudba" className="mx-auto max-w-7xl scroll-mt-14 px-4 py-16">
      <Pojav>
        <Naslov nad="Ponudba">{d.ponudba_naslov}</Naslov>
      </Pojav>
      {sSlikami ? (
        // Fotografija je izdelek: velika, brez okvirja in sence, napis pod njo.
        <div className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {d.ponudba.map((x, i) => (
            <article key={x.ime} className={i === 0 && d.ponudba.length > 3 ? "sm:col-span-2 lg:col-span-2" : ""}>
              <Slika
                src={x.slika}
                alt={x.ime}
                className={`w-full rounded-md ${i === 0 && d.ponudba.length > 3 ? "aspect-[16/9]" : "aspect-[4/3]"}`}
              />
              <Opis x={x} />
            </article>
          ))}
        </div>
      ) : (
        // Brez slik: seznam z linijo v njihovi barvi, kot cenik v izložbi.
        <div className="mt-10 grid gap-x-10 border-t-2 border-[var(--b)] sm:grid-cols-2">
          {d.ponudba.map((x) => (
            <article key={x.ime} className="border-b border-[#dfe2e8]">
              <Opis x={x} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/** Njihove fotografije, ki jih nismo pokazali drugje — največ šest, prva večja. */
function Galerija({ slike }: { slike: string[] }) {
  if (slike.length < 3) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-16">
      <Pojav>
        <Naslov nad="Galerija">Iz naših del</Naslov>
      </Pojav>
      <div className="mt-8 grid auto-rows-[160px] grid-cols-2 gap-3 sm:auto-rows-[200px] lg:grid-cols-4">
        {slike.map((s, i) => (
          <div key={s} className={`overflow-hidden rounded-md ${i === 0 ? "col-span-2 row-span-2" : ""}`}>
            <Slika src={s} alt="" className="h-full w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

function Opis({ x }: { x: DemoVsebina["ponudba"][number] }) {
  return (
    <div className="py-5">
      <h3 className="text-xl font-semibold tracking-[-0.01em]">{x.ime}</h3>
      {x.opis && <p className="mt-2 max-w-[60ch] leading-relaxed text-[#4b5563]"><Tekst t={x.opis} /></p>}
      <a
        href="#kontakt"
        className="mt-3 inline-block text-sm font-semibold text-[var(--b)] underline decoration-2 underline-offset-4 hover:decoration-[3px]"
      >
        Povprašajte za {x.ime.toLowerCase()}
      </a>
    </div>
  );
}

function Prednosti({ d }: { d: DemoVsebina }) {
  if (d.prednosti.length === 0) return null;
  return (
    <section className="bg-[#f6f7f9]">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <Pojav>
          <Naslov nad="Zakaj mi">Zakaj k nam</Naslov>
        </Pojav>
        {/* Tri trditve, ne kartice: debela linija v njihovi barvi nosi vsako. */}
        <div className="mt-10 grid gap-10 sm:grid-cols-3">
          {d.prednosti.map((x) => (
            <div key={x.naslov} className="border-t-4 border-[var(--b)] pt-5">
              <h3 className="text-xl font-semibold tracking-[-0.01em]">{x.naslov}</h3>
              <p className="mt-2 leading-relaxed text-[#4b5563]"><Tekst t={x.opis} /></p>
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
          <Naslov nad="Paket 2: Google in AI vidnost">Ko vas iščejo, najdejo vas</Naslov>
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
              <p className="mt-1 text-sm leading-relaxed text-[#4d5156]"><Tekst t={d.google.opis} /></p>
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
                  {odprto === i && <p className="px-5 pb-4 text-sm leading-relaxed text-[#4b5563]"><Tekst t={v.o} /></p>}
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
          <Naslov nad={`Paket 3: ${KRATKO[p.funkcija]?.paket ?? "aplikacija"}`} svetlo>
            {d.aplikacija.naslov || p.funkcija_opis}
          </Naslov>
          {d.aplikacija.opis && <p className="mt-4 max-w-md text-lg text-white/80"><Tekst t={d.aplikacija.opis} /></p>}
          {p.funkcija_opis && (
            <p className="mt-6 flex max-w-md gap-3 rounded-xl bg-white/5 p-4 text-sm leading-relaxed text-white/80">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[color-mix(in_srgb,var(--b)_60%,white)]" />
              {p.funkcija_opis}
            </p>
          )}
        </div>
        <div className="rounded-2xl bg-white p-6 text-[#0b1530] shadow-2xl shadow-black/30 sm:p-8">
          <p className="mb-4 text-xs font-semibold text-[#6b7280]">Preizkusite, tako vidi stranka</p>
          <PredogledFunkcije
            funkcija={p.funkcija}
            poziv={d.poziv}
            storitve={artikli}
            ime={p.kratko_ime}
            polja={d.aplikacija.polja}
            rezultat={d.aplikacija.rezultat}
            vprasanja={d.vprasanja}
          />
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
          <span className="block text-xs font-semibold text-[var(--b)]">Paket {naslednji}</span>
          <span className="mt-1 block font-bold">
            {naslednji === 2
              ? "Poglejte, kako vas najdejo na Googlu in v ChatGPT"
              : `Poglejte ${(KRATKO[p.funkcija]?.paket ?? "aplikacijo").toLowerCase()} v živo`}
          </span>
        </span>
       
      </button>
    </section>
  );
}

/* ───────────────────────── koraki, o nas, kontakt ───────────────────────── */

function Koraki({ d }: { d: DemoVsebina }) {
  if (d.koraki.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-16">
      <Pojav>
        <Naslov nad="Kako poteka">Do nas v {d.koraki.length} korakih</Naslov>
      </Pojav>
      <ol className="mt-8 grid gap-4 sm:grid-cols-3">
        {d.koraki.map((k, i) => (
          <li key={k}>
            <Pojav zamik={i * 0.1} className="h-full rounded-2xl border border-[#e3e6ee] bg-white p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--b)] text-sm font-bold text-white">{i + 1}</span>
              <p className="mt-4 font-semibold leading-snug"><Tekst t={k} /></p>
            </Pojav>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ONas({ p, d, slika }: { p: Predlog; d: DemoVsebina; slika?: string }) {
  if (!d.o_nas) return null;
  return (
    <section id="o-nas" className="scroll-mt-14 bg-[#f6f7f9]">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 lg:grid-cols-2">
        <Pojav>
          <Naslov nad="O nas">{p.kratko_ime}</Naslov>
          <p className="mt-5 text-lg leading-relaxed text-[#374151]"><Tekst t={d.o_nas} /></p>
        </Pojav>
        {slika && (
          <Pojav zamik={0.1} className="overflow-hidden rounded-2xl">
            <Slika src={slika} alt={p.kratko_ime} className="aspect-[4/3] w-full" />
          </Pojav>
        )}
      </div>
    </section>
  );
}

/** Za lastnika (ne del njihove strani): kaj mu nova stran prinese, v Lukovem slogu. */
function ZaLastnika({ p }: { p: Predlog }) {
  if (!p.zakaj || p.zakaj.length === 0) return null;
  const IKONE = [Search, Sparkles, Zap];
  return (
    <section className="bg-[#0b1530] text-white">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <Pojav>
          <Naslov nad={`Za vas, predlog KodaTim za ${p.kratko_ime}`} svetlo>
            Zakaj se vam nova stran splača
          </Naslov>
          {p.funkcija_opis && <p className="mt-4 max-w-2xl text-lg text-white/80">{p.funkcija_opis}</p>}
        </Pojav>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {p.zakaj.map((z, i) => {
            const Ikona = IKONE[i % IKONE.length];
            return (
              <Pojav key={z.naslov} zamik={i * 0.08} className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--b)]">
                  <Ikona className="h-5 w-5 text-white" />
                </span>
                <p className="mt-4 font-bold">{z.naslov}</p>
                <p className="mt-2 text-sm leading-relaxed text-white/75"><Tekst t={z.besedilo} /></p>
              </Pojav>
            );
          })}
        </div>
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
                <Mail className="h-5 w-5 text-[var(--b)]" /> <Eposta naslov={k.email} />
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
          <p className="text-xs font-semibold text-white/70">Za {p.kratko_ime}, pripravil KodaTim</p>
          <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            Paket {paket} — {cena?.ime ?? imePaketa(p, paket)}
          </h2>
          {d.paketi_zakaj[kljuc] && <p className="mt-5 max-w-md text-lg text-white/85"><Tekst t={d.paketi_zakaj[kljuc]} /></p>}
          <div className="mt-8 flex flex-wrap gap-2">
            {([1, 2, 3] as Paket[]).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setPaket(st)}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${paket === st ? "bg-white text-[var(--b)]" : "bg-white/10 hover:bg-white/20"}`}
              >
                {st} {imePaketa(p, st)}
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
                <span className="leading-snug"><Tekst t={t} /></span>
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
              <Mail className="h-4 w-4" /> <Eposta naslov="luka@kodatim.si" />
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
          {k.email && (
            <p>
              <Eposta naslov={k.email} />
            </p>
          )}
          {(k.naslov || p.kraj) && <p>{k.naslov || p.kraj}</p>}
        </div>
        <div className="space-y-2 text-xs text-white/40">
          <p>Predogled nove strani, izdelal KodaTim.si</p>
          <p>
            To ni uradna stran podjetja {p.podjetje.replace(/\.+$/, "")}. Besedila so iz javnih podatkov, slike se nalagajo z
            vaše strani {p.domena} in jih na željo odstranimo.
          </p>
        </div>
      </div>
    </footer>
  );
}
