"use client";

/* eslint-disable @next/next/no-img-element -- slike se nalagajo z njihove strani (pri nas jih ni), optimizacija jih ne more brati */
import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Check, ChevronDown, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import type { BlokAgenta, DeloAgenta, HeroAgenta, Predlog, StranAgenta } from "@/lib/predlogi";
import { Eposta, Tekst } from "./Eposta";
import { PredogledFunkcije } from "./PredogledFunkcije";
import { PrviZaslon } from "./PrviZaslon";

/**
 * Predlog prodajnega agenta (Luka, 20. 10. 2026: »pametni morejo bit ti agenti,
 * ne roboti«). Trije deli:
 *  1. Za vas — lastniku na kratko: kaj smo opazili (z dokazom), rešitev, kaj
 *     dobi več kot zdaj, cena. Takoj na vrhu, ker je to bistvo predloga.
 *  2. Njihova nova stran, sestavljena po agentovem načrtu: glava ene od štirih
 *     postavitev, nato bloki v vrstnem redu in različici, ki jo je izbral agent,
 *     pisava in podlaga po njihovem svetu. Bloki so preizkušeni, zato je vsaka
 *     stran drugačna, nobena pa ne more biti zlomljena.
 *  3. Ponudba — kako deluje, prej in potem, cena, garancija, naslednji korak.
 * Za sliki v mailu (zaSliko) se pokaže samo njihova stran, brez animacij.
 */

const PRIVZETA_BARVA = "#1546d8";
const MEHKO = [0.16, 1, 0.3, 1] as const;
const BrezAnimacij = createContext(false);

const PODLAGE: Record<StranAgenta["tema"]["podlaga"], Record<string, string>> = {
  svetla: { "--bg": "#ffffff", "--fg": "#15171c", "--mut": "#4b5563", "--pov": "#f5f6f8", "--rob": "#e3e6ec" },
  kamen: { "--bg": "#eef0ec", "--fg": "#1b1f1a", "--mut": "#4a5148", "--pov": "#ffffff", "--rob": "#d6dad2" },
  temna: { "--bg": "#121417", "--fg": "#f2f3f5", "--mut": "#a8afba", "--pov": "#1c1f24", "--rob": "#2c3139" },
};

export function AgentStran({ p, zaSliko = false, pisava = "" }: { p: Predlog; zaSliko?: boolean; pisava?: string }) {
  const s = p.stran as StranAgenta;
  const a = p.agent as DeloAgenta;
  const barva = /^#[0-9a-f]{6}$/i.test(p.vizual?.barva ?? "") ? (p.vizual?.barva as string) : PRIVZETA_BARVA;
  const slog = {
    "--b": barva,
    "--r": s.tema.oblika === "ostra" ? "2px" : "18px",
    ...PODLAGE[s.tema.podlaga],
  } as CSSProperties;
  return (
    <BrezAnimacij.Provider value={zaSliko}>
      <div
        style={slog}
        className={`${pisava} min-h-screen overflow-x-hidden bg-[var(--bg)] text-[var(--fg)] antialiased [&_h1]:font-[family-name:var(--font-demo)] [&_h2]:font-[family-name:var(--font-demo)] [&_h3]:font-[family-name:var(--font-demo)]`}
      >
        {!zaSliko && <Vrstica p={p} />}
        {imaPrviZaslon(a) ? (
          <>
            <PrviZaslon p={p} a={a} h={a.hero} zaSliko={zaSliko} />
            {!zaSliko && <Temelji p={p} a={a} />}
          </>
        ) : (
          !zaSliko && <ZaVas p={p} a={a} />
        )}
        {!zaSliko && (
          <p className="bg-[#0b1530] pb-3 text-center text-xs font-semibold text-white/60">
            {imaPrviZaslon(a) ? "Spodaj je primer, kako bi to delovalo pri vas" : "Spodaj je vaša nova stran, kot bi jo videli vaši kupci"}
          </p>
        )}
        <Glava p={p} s={s} />
        <Uvod p={p} s={s} />
        {s.bloki.map((b) => (
          <Blok key={b.tip} b={b} p={p} a={a} />
        ))}
        <Kontakt p={p} />
        <Noga p={p} s={s} />
        {!zaSliko && <Ponudba p={p} a={a} />}
      </div>
    </BrezAnimacij.Provider>
  );
}

/* ───────────────────────── za lastnika ───────────────────────── */

function Vrstica({ p }: { p: Predlog }) {
  return (
    <div className="sticky top-0 z-50 bg-[#0b1530] text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2">
        <p className="min-w-0 truncate text-[11px] font-semibold text-white/70">
          Predlog za {p.kratko_ime}, pripravil KodaTim
        </p>
        <div className="flex shrink-0 items-center gap-1 text-xs font-semibold">
          <a href="#za-vas" className="rounded-md px-3 py-1 text-white/80 hover:bg-white/10">
            Za vas
          </a>
          <a href="#ponudba-kodatim" className="rounded-md bg-[var(--b)] px-3 py-1 text-white">
            Cena
          </a>
        </div>
      </div>
    </div>
  );
}

function imaPrviZaslon(a: DeloAgenta): a is DeloAgenta & { hero: HeroAgenta } {
  return !!(a.hero?.problem && a.hero.resitev && a.hero.potem?.length);
}

/** Na čem temelji predlog: problemi s posledico, človeško; brez surovih citatov z njihove strani. */
function Temelji({ p, a }: { p: Predlog; a: DeloAgenta }) {
  const problemi = a.diagnoza.problemi.slice(0, 3);
  if (!problemi.length) return null;
  return (
    <details className="bg-[#0b1530] text-white">
      <summary className="mx-auto max-w-6xl cursor-pointer px-4 pb-6 text-sm font-semibold text-white/60 hover:text-white">
        Kaj smo opazili pri {p.kratko_ime}
      </summary>
      <ul className="mx-auto grid max-w-6xl gap-5 px-4 pb-10 sm:grid-cols-3">
        {problemi.map((x) => (
          <li key={x.problem} className="border-l-2 border-[color-mix(in_srgb,var(--b)_70%,white)] pl-4">
            <p className="font-semibold leading-snug">{x.problem}</p>
            {x.posledica && <p className="mt-1.5 text-sm leading-relaxed text-white/70">{x.posledica}</p>}
          </li>
        ))}
      </ul>
    </details>
  );
}

function izbraniPaket(p: Predlog, a: DeloAgenta) {
  return p.cene?.find((c) => c.st === a.paket.st);
}

function ZaVas({ p, a }: { p: Predlog; a: DeloAgenta }) {
  const paket = izbraniPaket(p, a);
  const problemi = a.diagnoza.problemi.slice(0, 3);
  return (
    <section id="za-vas" className="scroll-mt-10 bg-[#0b1530] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-12 pt-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
        <div>
          <p className="text-sm font-semibold text-white/60">Kaj smo opazili pri {p.kratko_ime}</p>
          <ul className="mt-4 space-y-5">
            {problemi.map((x) => (
              <li key={x.problem} className="border-l-2 border-[color-mix(in_srgb,var(--b)_70%,white)] pl-4">
                <p className="font-semibold leading-snug">{x.problem}</p>
                {x.citat && <p className="mt-1.5 text-sm italic text-white/55">»{x.citat}«</p>}
                {x.posledica && <p className="mt-1.5 text-sm leading-relaxed text-white/75">{x.posledica}</p>}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-white p-6 text-[#0b1530] sm:p-8">
          <p className="text-sm font-semibold text-[var(--b)]">Naš predlog</p>
          <h2 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">{a.resitev.ime}</h2>
          {a.resitev.povzetek && <p className="mt-3 leading-relaxed text-[#374151]">{a.resitev.povzetek}</p>}
          <ul className="mt-5 space-y-3">
            {a.resitev.kaj_dobijo.map((k) => (
              <li key={k.naslov} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--b)_14%,white)]">
                  <Check className="h-3.5 w-3.5 text-[var(--b)]" />
                </span>
                <span className="leading-snug">
                  <span className="font-semibold">{k.naslov}.</span> <span className="text-[#4b5563]">{k.opis}</span>
                </span>
              </li>
            ))}
          </ul>
          {paket && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#eef0f4] pt-5">
              <p>
                <span className="block text-xs text-[#6b7280]">{paket.ime}</span>
                <span className="text-2xl font-extrabold text-[var(--b)]">{paket.cena}</span>
              </p>
              <a href="#ponudba-kodatim" className="text-sm font-semibold underline decoration-2 underline-offset-4">
                Kaj je vključeno
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Ponudba({ p, a }: { p: Predlog; a: DeloAgenta }) {
  const paket = izbraniPaket(p, a);
  const ai = a.paket.ai ? p.cene?.find((c) => c.st === "+") : undefined;
  const ostali = (p.cene ?? []).filter((c) => c.st !== a.paket.st && c.st !== "+");
  const garancija = a.paket.st === "3" || a.paket.ai;
  return (
    <section id="ponudba-kodatim" className="scroll-mt-10 bg-[#0b1530] text-white">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <p className="text-sm font-semibold text-white/60">Za {p.kratko_ime}, pripravil KodaTim</p>
        <h2 className="mt-3 max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">Kako bi delovalo in koliko stane</h2>
        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          <div className="space-y-10">
            {a.resitev.kako_deluje.length > 0 && (
              <ol className="space-y-4">
                {a.resitev.kako_deluje.map((k, i) => (
                  <li key={k} className="flex gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--b)] text-sm font-bold">
                      {i + 1}
                    </span>
                    <p className="pt-1 leading-relaxed text-white/85">{k}</p>
                  </li>
                ))}
              </ol>
            )}
            {a.resitev.pred_po.length > 0 && (
              <div className="overflow-hidden rounded-xl ring-1 ring-white/15">
                <div className="grid grid-cols-2 bg-white/5 text-xs font-semibold text-white/60">
                  <p className="px-4 py-2.5">Zdaj</p>
                  <p className="px-4 py-2.5">Z novo rešitvijo</p>
                </div>
                {a.resitev.pred_po.map((x) => (
                  <div key={x.zdaj} className="grid grid-cols-2 border-t border-white/10 text-sm leading-relaxed">
                    <p className="px-4 py-3 text-white/60">{x.zdaj}</p>
                    <p className="px-4 py-3">{x.potem}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl bg-white p-7 text-[#0b1530] sm:p-8">
            {paket && (
              <p className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#eef0f4] pb-4">
                <span className="font-bold">{paket.ime}</span>
                <span className="text-2xl font-extrabold text-[var(--b)]">{paket.cena}</span>
              </p>
            )}
            {a.paket.zakaj && <p className="mt-4 leading-relaxed text-[#374151]">{a.paket.zakaj}</p>}
            {ai && (
              <p className="mt-3 text-sm text-[#374151]">
                <span className="font-semibold">{ai.ime}:</span> {ai.cena}, {ai.opis.charAt(0).toLowerCase() + ai.opis.slice(1)}
              </p>
            )}
            <div className="mt-5 space-y-2 rounded-xl bg-[#f5f6f8] p-4 text-sm text-[#4b5563]">
              {p.mesecnina && <p>{p.mesecnina}</p>}
              {a.paket.oglasevanje && (
                <p>Po želji uredimo tudi oglaševanje na Googlu in Facebooku, s proračunom, ki ga določite vi.</p>
              )}
              {ostali.length > 0 && (
                <p>
                  Druge možnosti: {ostali.map((c) => `${c.ime} (${c.cena})`).join(", ")}.
                </p>
              )}
            </div>
            {garancija && p.garancija && (
              <div className="mt-5 flex gap-3 text-sm leading-relaxed text-[#374151]">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--b)]" />
                <p>
                  <span className="font-semibold text-[#0b1530]">Garancija, zapisana v pogodbi. </span>
                  {p.garancija}
                </p>
              </div>
            )}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <a
                href="tel:+38640199051"
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--b)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
              >
                <Phone className="h-4 w-4" /> 040 199 051
              </a>
              <a
                href={`mailto:luka@kodatim.si?subject=${encodeURIComponent(`Predlog za ${p.kratko_ime}`)}`}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#e3e6ee] px-5 py-3 text-sm font-semibold hover:border-[var(--b)]"
              >
                <Mail className="h-4 w-4" /> <Eposta naslov="luka@kodatim.si" />
              </a>
            </div>
            {garancija && p.garancija_pogoji && (
              <p className="mt-4 text-[11px] leading-relaxed text-[#9aa1ad]">{p.garancija_pogoji}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── slike in logotip (z njihove strani) ───────────────────────── */

/** Njihova slika; če se ne naloži, je ni (nikoli siva ploskev namesto izdelka). */
function Slika({ src, alt, className = "", takoj = false }: { src?: string; alt: string; className?: string; takoj?: boolean }) {
  const [napaka, setNapaka] = useState(false);
  if (!src || napaka) return null;
  return (
    <img
      ref={(img) => {
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

function Logotip({ p }: { p: Predlog }) {
  const [napaka, setNapaka] = useState(false);
  const logo = p.vizual?.logo;
  if (logo && !napaka) {
    return (
      <img
        ref={(img) => {
          if (img?.complete && img.naturalWidth === 0) setNapaka(true);
        }}
        src={logo}
        alt={p.kratko_ime}
        referrerPolicy="no-referrer"
        onError={() => setNapaka(true)}
        className="h-10 w-auto max-w-[200px] object-contain"
      />
    );
  }
  return <span className="text-xl font-extrabold tracking-tight">{p.kratko_ime}</span>;
}

/* ───────────────────────── njihova stran: glava in uvod ───────────────────────── */

const IMENA_MENIJA: Partial<Record<BlokAgenta["tip"], string>> = {
  ponudba: "Ponudba",
  resitev: "Naročilo",
  o_nas: "O nas",
  vprasanja: "Vprašanja",
  galerija: "Galerija",
};

function Glava({ p, s }: { p: Predlog; s: StranAgenta }) {
  const meni = s.bloki
    .filter((b) => IMENA_MENIJA[b.tip])
    .map((b) => ({ ime: b.tip === "resitev" ? b.naslov.split(" ").slice(0, 2).join(" ") || "Naročilo" : IMENA_MENIJA[b.tip] as string, cilj: `#${b.tip === "resitev" ? "funkcija" : b.tip}` }))
    .slice(0, 4);
  return (
    <header className="border-b border-[var(--rob)] bg-[var(--bg)]">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
        <a href="#" className="shrink-0">
          <Logotip p={p} />
        </a>
        <nav className="hidden flex-1 items-center justify-center gap-7 text-sm font-medium lg:flex">
          {meni.map((m) => (
            <a key={m.cilj} href={m.cilj} className="whitespace-nowrap hover:text-[var(--b)]">
              {m.ime}
            </a>
          ))}
          <a href="#kontakt" className="hover:text-[var(--b)]">
            Kontakt
          </a>
        </nav>
        <a
          href={s.bloki.some((b) => b.tip === "resitev") ? "#funkcija" : "#kontakt"}
          className="ml-auto shrink-0 rounded-[var(--r)] bg-[var(--b)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          {s.glava.poziv || "Pišite nam"}
        </a>
      </div>
    </header>
  );
}

function Uvod({ p, s }: { p: Predlog; s: StranAgenta }) {
  const brez = useContext(BrezAnimacij);
  const g = s.glava;
  const cilj = s.bloki.some((b) => b.tip === "resitev") ? "#funkcija" : "#kontakt";
  const [prva, druga] = g.slike;
  const besedilo = (
    <motion.div
      initial={brez ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.2, ease: MEHKO }}
    >
      {g.nadnaslov && <p className="text-base font-medium opacity-75">{g.nadnaslov}</p>}
      <h1 className="mt-4 max-w-[15ch] text-[clamp(2.5rem,6vw,5.4rem)] font-bold leading-[0.98] tracking-[-0.03em]">
        {g.naslov || p.kratko_ime}
      </h1>
      {g.podnaslov && (
        <p className="mt-6 max-w-[52ch] text-lg leading-relaxed opacity-85">
          <Tekst t={g.podnaslov} />
        </p>
      )}
      <a
        href={cilj}
        className="mt-8 inline-block rounded-[var(--r)] bg-[var(--b)] px-6 py-3.5 text-sm font-semibold text-white hover:brightness-110"
      >
        {g.poziv || "Pišite nam"}
      </a>
    </motion.div>
  );

  if (g.razlicica === "fotografija" && prva) {
    return (
      <section className="relative isolate overflow-hidden bg-[#15171c] text-white">
        <motion.div
          className="absolute inset-0 -z-10"
          initial={brez ? false : { scale: 1.08 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.6, ease: MEHKO }}
        >
          <Slika takoj src={prva} alt={p.kratko_ime} className="h-full w-full" />
        </motion.div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#15171c]/90 via-[#15171c]/60 to-[#15171c]/10" />
        <div className="mx-auto flex min-h-[560px] max-w-7xl items-end px-4 pb-16 pt-24 lg:min-h-[640px]">{besedilo}</div>
      </section>
    );
  }
  if (g.razlicica === "okvir" && prva) {
    return (
      <section className="mx-auto max-w-7xl px-4 pb-10 pt-12">
        {besedilo}
        <motion.div
          className="mt-10 overflow-hidden rounded-[var(--r)]"
          initial={brez ? false : { opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.35, ease: MEHKO }}
        >
          <Slika takoj src={prva} alt={p.kratko_ime} className="aspect-[21/9] w-full" />
        </motion.div>
      </section>
    );
  }
  if (g.razlicica === "razdeljena" && prva) {
    return (
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 lg:grid-cols-[1.05fr_1fr] lg:py-16">
        {besedilo}
        <div className="grid gap-3">
          <Slika takoj src={prva} alt={p.kratko_ime} className="aspect-[4/3] w-full rounded-[var(--r)]" />
          {druga && <Slika takoj src={druga} alt="" className="aspect-[16/7] w-full rounded-[var(--r)]" />}
        </div>
      </section>
    );
  }
  // Tipografska: brez fotografije govori pisava na njihovi barvi.
  return (
    <section className="bg-[var(--b)] text-white">
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-20 lg:pb-24 lg:pt-28">{besedilo}</div>
    </section>
  );
}

/* ───────────────────────── njihova stran: bloki ───────────────────────── */

function Naslov({ children, uvod }: { children: ReactNode; uvod?: string }) {
  return (
    <div className="max-w-3xl">
      <h2 className="text-[clamp(1.9rem,3.6vw,3rem)] font-bold leading-[1.08] tracking-[-0.02em]">{children}</h2>
      {uvod && (
        <p className="mt-4 text-lg leading-relaxed text-[var(--mut)]">
          <Tekst t={uvod} />
        </p>
      )}
    </div>
  );
}

function Blok({ b, p, a }: { b: BlokAgenta; p: Predlog; a: DeloAgenta }) {
  const el = b.elementi ?? [];
  switch (b.tip) {
    case "ponudba":
      return <BlokPonudba b={b} />;
    case "resitev":
      return (
        <section id="funkcija" className="scroll-mt-12 bg-[#0b1530] text-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <h2 className="text-[clamp(1.9rem,3.6vw,3rem)] font-bold leading-[1.08] tracking-[-0.02em]">
                {b.naslov || a.resitev.ime}
              </h2>
              <p className="mt-4 max-w-md text-lg leading-relaxed text-white/80">
                <Tekst t={b.uvod || a.resitev.povzetek} />
              </p>
            </div>
            <div className="rounded-[var(--r)] bg-white p-6 text-[#0b1530] shadow-2xl shadow-black/30 sm:p-8">
              <p className="mb-4 text-xs font-semibold text-[#6b7280]">Preizkusite, tako vidi kupec</p>
              <PredogledFunkcije
                funkcija={a.resitev.pripomocek}
                poziv={p.stran?.glava.poziv || "Pošlji"}
                storitve={a.resitev.artikli.length > 0 ? a.resitev.artikli : p.storitve}
                ime={p.kratko_ime}
                polja={a.resitev.polja}
                rezultat={a.resitev.rezultat}
                vprasanja={(p.stran?.bloki.find((x) => x.tip === "vprasanja")?.elementi ?? []).map((x) => ({ v: x.v, o: x.o }))}
              />
            </div>
          </div>
        </section>
      );
    case "stevilke":
      return (
        <section className="border-y border-[var(--rob)]">
          <dl className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
            {el.map((x) => (
              <div key={x.vrednost}>
                <dt className="font-[family-name:var(--font-demo)] text-5xl font-bold tracking-tight text-[var(--b)]">{x.vrednost}</dt>
                <dd className="mt-2 text-[var(--mut)]">{x.oznaka}</dd>
              </div>
            ))}
          </dl>
        </section>
      );
    case "prednosti":
      return (
        <section className="bg-[var(--pov)]">
          <div className="mx-auto max-w-7xl px-4 py-16">
            <Naslov uvod={b.uvod}>{b.naslov}</Naslov>
            {b.razlicica === "seznam" ? (
              <ul className="mt-10 grid gap-x-12 gap-y-6 sm:grid-cols-2">
                {el.map((x) => (
                  <li key={x.naslov} className="flex gap-4">
                    <Check className="mt-1 h-5 w-5 shrink-0 text-[var(--b)]" />
                    <div>
                      <h3 className="text-lg font-semibold">{x.naslov}</h3>
                      <p className="mt-1 leading-relaxed text-[var(--mut)]"><Tekst t={x.opis} /></p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={`mt-10 grid gap-10 ${el.length === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
                {el.map((x) => (
                  <div key={x.naslov} className="border-t-4 border-[var(--b)] pt-5">
                    <h3 className="text-xl font-semibold tracking-[-0.01em]">{x.naslov}</h3>
                    <p className="mt-2 leading-relaxed text-[var(--mut)]"><Tekst t={x.opis} /></p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      );
    case "o_nas":
      if (b.razlicica === "citat") {
        return (
          <section id="o_nas" className="scroll-mt-12">
            <div className="mx-auto max-w-5xl px-4 py-20">
              {b.naslov && <p className="text-sm font-semibold text-[var(--b)]">{b.naslov}</p>}
              <p className="mt-4 font-[family-name:var(--font-demo)] text-[clamp(1.6rem,3vw,2.5rem)] leading-[1.25] tracking-[-0.01em]">
                <Tekst t={b.besedilo ?? ""} />
              </p>
            </div>
          </section>
        );
      }
      return (
        <section id="o_nas" className="scroll-mt-12 bg-[var(--pov)]">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 lg:grid-cols-2">
            <div>
              <Naslov>{b.naslov || p.kratko_ime}</Naslov>
              <p className="mt-5 text-lg leading-relaxed text-[var(--mut)]"><Tekst t={b.besedilo ?? ""} /></p>
            </div>
            <Slika src={b.slika} alt={p.kratko_ime} className="aspect-[4/3] w-full rounded-[var(--r)]" />
          </div>
        </section>
      );
    case "galerija":
      return (
        <section id="galerija" className="scroll-mt-12 py-16">
          <div className="mx-auto max-w-7xl px-4">
            <Naslov uvod={b.uvod}>{b.naslov || "Iz naših del"}</Naslov>
          </div>
          {b.razlicica === "trak" ? (
            <div className="mt-8 flex snap-x gap-3 overflow-x-auto px-4 pb-2 lg:px-[max(1rem,calc((100vw-80rem)/2+1rem))]">
              {(b.slike ?? []).map((src) => (
                <Slika key={src} src={src} alt="" className="h-72 w-[22rem] shrink-0 snap-start rounded-[var(--r)]" />
              ))}
            </div>
          ) : (
            <div className="mx-auto mt-8 grid max-w-7xl auto-rows-[170px] grid-cols-2 gap-3 px-4 sm:auto-rows-[210px] lg:grid-cols-4">
              {(b.slike ?? []).map((src, i) => (
                <Slika key={src} src={src} alt="" className={`h-full w-full rounded-[var(--r)] ${i === 0 ? "col-span-2 row-span-2" : ""}`} />
              ))}
            </div>
          )}
        </section>
      );
    case "koraki":
      return (
        <section className="mx-auto max-w-7xl px-4 py-16">
          <Naslov uvod={b.uvod}>{b.naslov}</Naslov>
          <ol className={`mt-10 grid gap-8 ${el.length === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
            {el.map((x, i) => (
              <li key={x.naslov}>
                <span className="font-[family-name:var(--font-demo)] text-4xl font-bold text-[var(--b)]">{i + 1}</span>
                <h3 className="mt-3 text-lg font-semibold">{x.naslov}</h3>
                {x.opis && <p className="mt-1.5 leading-relaxed text-[var(--mut)]"><Tekst t={x.opis} /></p>}
              </li>
            ))}
          </ol>
        </section>
      );
    case "vprasanja":
      return <BlokVprasanja b={b} />;
    case "poziv":
      return (
        <section className="bg-[var(--b)] text-white">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-14 md:flex-row md:items-center">
            <div>
              <h2 className="text-3xl font-bold leading-tight">{b.naslov}</h2>
              {b.besedilo && <p className="mt-2 max-w-xl text-white/85"><Tekst t={b.besedilo} /></p>}
            </div>
            <a href="#kontakt" className="shrink-0 rounded-[var(--r)] bg-white px-6 py-3.5 text-sm font-semibold text-[var(--b)] hover:opacity-90">
              {b.gumb || "Pišite nam"}
            </a>
          </div>
        </section>
      );
  }
}

function BlokPonudba({ b }: { b: BlokAgenta }) {
  const el = b.elementi ?? [];
  if (b.razlicica === "seznam" || el.every((x) => !x.slika)) {
    return (
      <section id="ponudba" className="mx-auto max-w-7xl scroll-mt-12 px-4 py-16">
        <Naslov uvod={b.uvod}>{b.naslov}</Naslov>
        <div className="mt-10 grid gap-x-12 border-t-2 border-[var(--b)] sm:grid-cols-2">
          {el.map((x) => (
            <article key={x.ime} className="border-b border-[var(--rob)] py-6">
              <h3 className="text-xl font-semibold tracking-[-0.01em]">{x.ime}</h3>
              {x.opis && <p className="mt-2 leading-relaxed text-[var(--mut)]"><Tekst t={x.opis} /></p>}
            </article>
          ))}
        </div>
      </section>
    );
  }
  if (b.razlicica === "izpostavljeno") {
    const [prvi, ...ostali] = el;
    return (
      <section id="ponudba" className="mx-auto max-w-7xl scroll-mt-12 px-4 py-16">
        <Naslov uvod={b.uvod}>{b.naslov}</Naslov>
        <div className="mt-10 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
          <article>
            <Slika src={prvi.slika} alt={prvi.ime} className="aspect-[4/3] w-full rounded-[var(--r)]" />
            <h3 className="mt-5 text-2xl font-semibold">{prvi.ime}</h3>
            {prvi.opis && <p className="mt-2 leading-relaxed text-[var(--mut)]"><Tekst t={prvi.opis} /></p>}
          </article>
          <div className="divide-y divide-[var(--rob)]">
            {ostali.map((x) => (
              <article key={x.ime} className="flex gap-4 py-5 first:pt-0">
                <Slika src={x.slika} alt={x.ime} className="h-20 w-24 shrink-0 rounded-[var(--r)]" />
                <div>
                  <h3 className="text-lg font-semibold">{x.ime}</h3>
                  {x.opis && <p className="mt-1 text-sm leading-relaxed text-[var(--mut)]"><Tekst t={x.opis} /></p>}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }
  return (
    <section id="ponudba" className="mx-auto max-w-7xl scroll-mt-12 px-4 py-16">
      <Naslov uvod={b.uvod}>{b.naslov}</Naslov>
      <div className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {el.map((x) => (
          <article key={x.ime}>
            <Slika src={x.slika} alt={x.ime} className="mb-5 aspect-[4/3] w-full rounded-[var(--r)]" />
            <h3 className="text-xl font-semibold tracking-[-0.01em]">{x.ime}</h3>
            {x.opis && <p className="mt-2 leading-relaxed text-[var(--mut)]"><Tekst t={x.opis} /></p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function BlokVprasanja({ b }: { b: BlokAgenta }) {
  const [odprto, setOdprto] = useState<number | null>(0);
  const el = b.elementi ?? [];
  return (
    <section id="vprasanja" className="scroll-mt-12 bg-[var(--pov)]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1fr_1.3fr]">
        <Naslov uvod={b.uvod}>{b.naslov || "Pogosta vprašanja"}</Naslov>
        <div className="divide-y divide-[var(--rob)] border-y border-[var(--rob)]">
          {el.map((x, i) => (
            <div key={x.v}>
              <button
                type="button"
                onClick={() => setOdprto(odprto === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 py-5 text-left font-semibold"
              >
                {x.v}
                <ChevronDown className={`h-4 w-4 shrink-0 transition ${odprto === i ? "rotate-180" : ""}`} />
              </button>
              {odprto === i && <p className="pb-5 leading-relaxed text-[var(--mut)]"><Tekst t={x.o} /></p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── kontakt in noga njihove strani ───────────────────────── */

function Kontakt({ p }: { p: Predlog }) {
  const k = p.kontakt ?? {};
  const [poslano, setPoslano] = useState(false);
  const polje =
    "mt-1.5 block w-full cursor-default rounded-[var(--r)] border border-[#d9dde6] bg-white px-4 py-3 text-sm text-[#9aa1ad] outline-none";
  return (
    <section id="kontakt" className="scroll-mt-12 bg-[color-mix(in_srgb,var(--b)_8%,var(--bg))]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <Naslov>Pišite nam ali pokličite</Naslov>
          <ul className="mt-6 space-y-3">
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
        <div className="rounded-[var(--r)] border border-[#e3e6ee] bg-white p-6 text-[#15171c] sm:p-8">
          {poslano ? (
            <div className="py-6 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white">
                <Check className="h-6 w-6" />
              </span>
              <p className="mt-4 font-bold">Sporočilo je poslano</p>
              <p className="mt-1 text-sm text-[#6b7280]">Predogled — nič ni bilo poslano.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {["Ime in priimek", "Podjetje", "E-pošta", "Telefon"].map((o) => (
                <label key={o} className="block text-xs font-semibold text-[#4b5563]">
                  {o}
                  <input readOnly tabIndex={-1} placeholder="Izpolni kupec" className={polje} />
                </label>
              ))}
              <label className="block text-xs font-semibold text-[#4b5563] sm:col-span-2">
                Sporočilo
                <textarea readOnly tabIndex={-1} rows={3} placeholder="Izpolni kupec" className={`${polje} resize-none`} />
              </label>
              <button
                type="button"
                onClick={() => setPoslano(true)}
                className="rounded-[var(--r)] bg-[var(--b)] px-6 py-3.5 text-sm font-semibold text-white hover:opacity-90 sm:col-span-2"
              >
                Pošlji sporočilo
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Noga({ p, s }: { p: Predlog; s: StranAgenta }) {
  const k = p.kontakt ?? {};
  return (
    <footer className="border-t border-[var(--rob)] bg-[var(--bg)]">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <p className="text-xl font-extrabold tracking-tight">{p.kratko_ime}</p>
          {s.glava.nadnaslov && <p className="mt-2 max-w-xs text-sm text-[var(--mut)]">{s.glava.nadnaslov}</p>}
        </div>
        <div className="space-y-2 text-sm text-[var(--mut)]">
          {k.telefon && <p>{k.telefon}</p>}
          {k.email && (
            <p>
              <Eposta naslov={k.email} />
            </p>
          )}
          {(k.naslov || p.kraj) && <p>{k.naslov || p.kraj}</p>}
        </div>
        <div className="space-y-2 text-xs text-[var(--mut)] opacity-80">
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
