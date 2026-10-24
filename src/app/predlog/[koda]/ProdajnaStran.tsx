/* eslint-disable @next/next/no-img-element -- posnetek njihove strani pride s Harveyja */
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowUpRight,
  BellRing,
  Check,
  ClipboardList,
  Clock,
  Mail,
  MessageCircle,
  MoonStar,
  Phone,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";
import type { DeloAgenta, HeroAgenta, MailAgenta, PdfAgenta, Predlog } from "@/lib/predlogi";
import { Eposta } from "./Eposta";
import { pisavaPoImenu } from "./pisave";
import { PredogledFunkcije } from "./PredogledFunkcije";
import { Telefon, TelefonKorak } from "./PrviZaslon";
import { ZanimaMe } from "./ZanimaMe";

/**
 * Prodajna stran predloga (Luka, 23. 10. 2026: »res naredi lep dizajn … prodajni dizajn …
 * v 3 sekundah se mora najti v svojem problemu in takoj videti rešitev«). Ista zgodba kot mail
 * in PDF: problem → rešitev v živo → kako se lotimo → kaj pridobite → cena → pokličite.
 * Ena paleta za vso stran (Luka 24. 10.: »eno paleto barv … ne samo te ene vijolične«): temno modra
 * podlaga, koralna za problem ✕, turkizna za rešitev ✓ in gumbe, jantarna za številke, svetla meta za
 * izmenjujoča ozadja. Barva podjetja ostane samo v njihovem logotipu.
 */

const TELEFON = "040 199 051";
const TEL = "tel:+38640199051";

export type AgentProdaja = DeloAgenta & { hero: HeroAgenta; pdf: PdfAgenta };
export type PredlogProdaja = Predlog & { agent: AgentProdaja; mail: MailAgenta };

/** Predlog z vsem, kar rabi prodajna stran (agentovi predlogi od 23. 10. 2026). */
export function imaProdajo(p: Predlog): p is PredlogProdaja {
  const a = p.agent;
  return !!(a?.hero?.problem && a.hero.potem?.length && a.pdf?.lotimo?.length && a.pdf.korist?.length && p.mail);
}

function alineje(t: string): string[] {
  return t
    .split("\n")
    .map((v) => v.trim())
    .filter((v) => /^[•\-*]/.test(v))
    .map((v) => v.replace(/^[•\-*]\s*/, ""));
}

const PALETA = {
  "--crn": "#0E1B2C", // podlaga, besedilo
  "--rja": "#E8573F", // problem
  "--b": "#0F9D8A", // rešitev, gumbi
  "--amb": "#F2B544", // številke, poudarki
  "--meta": "#EEF4F2", // izmenjujoča ozadja
} as CSSProperties;

function slog(): CSSProperties {
  return PALETA;
}

const NASLOV = "font-[family-name:var(--font-demo)] tracking-[-0.025em]";

/** Prvi zaslon: to vidi v 3 sekundah, isto je slika v mailu (id za-vas, ?korak za GIF). */
function ProdajniVrh({ p, zaSliko = false, korak }: { p: PredlogProdaja; zaSliko?: boolean; korak?: number }) {
  const a = p.agent;
  return (
    <section id="za-vas" className="scroll-mt-12 bg-[var(--crn)] text-white">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 sm:pt-14 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="text-sm font-semibold text-white/50">Za {p.kratko_ime}</p>
          <p className="mt-6 flex items-start gap-3 text-[clamp(1.1rem,2.2vw,1.45rem)] font-semibold leading-snug text-[#F7A08F]">
            <X className="mt-1 h-5 w-5 shrink-0 text-[var(--rja)]" strokeWidth={3} aria-hidden />
            {a.hero.problem}
          </p>
          <h1 className={`${NASLOV} mt-4 flex items-start gap-3 text-[clamp(2.2rem,5vw,3.9rem)] font-bold leading-[1.02]`}>
            <Check className="mt-[0.15em] h-[0.8em] w-[0.8em] shrink-0 text-[color-mix(in_srgb,var(--b)_70%,white)]" strokeWidth={3.5} aria-hidden />
            <span>{a.hero.resitev}</span>
          </h1>
          {p.mail.zakljucek && (
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">{p.mail.zakljucek}</p>
          )}
          {!zaSliko && (
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a href="#zanima" className="rounded-xl bg-[var(--b)] px-6 py-3.5 font-semibold text-white shadow-lg shadow-black/30 hover:brightness-110">
                Zanima me
              </a>
              <a href={TEL} className="flex items-center gap-2 rounded-xl px-5 py-3.5 font-semibold text-white/85 ring-1 ring-white/20 hover:bg-white/10">
                <Phone className="h-4 w-4" aria-hidden /> {TELEFON}
              </a>
              <a href="#preizkusite" className="px-2 py-3.5 font-semibold text-white/70 underline decoration-white/30 underline-offset-4 hover:text-white">
                Preizkusite sami
              </a>
            </div>
          )}
        </div>
        <Telefon p={p} a={a} koraki={a.hero.potem} zaSliko={zaSliko} zacetni={korak} />
      </div>
    </section>
  );
}

export function ProdajnaStran({ p, samoVrh = false, korak }: { p: PredlogProdaja; samoVrh?: boolean; korak?: number }) {
  const a = p.agent;
  // /predogled: samo prvi zaslon, iz njega Harvey naredi sliko in GIF za mail.
  if (samoVrh)
    return (
      <div style={slog()} className={`${pisavaPoImenu("sodobna")} antialiased`}>
        <ProdajniVrh p={p} zaSliko korak={korak} />
      </div>
    );
  const problem = alineje(p.mail.uvod);
  const nadgradnje = a.pdf.nadgradnje ?? [];
  const [prva, ...ostale] = a.pdf.korist;

  return (
    <div style={slog()} className={`${pisavaPoImenu("sodobna")} min-h-screen bg-white pb-20 text-[var(--crn)] antialiased sm:pb-0`}>
      {/* Vrstica: komu je predlog in en klic */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-[var(--crn)] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <p className="min-w-0 truncate text-xs font-semibold text-white/70">
            Predlog za {p.kratko_ime}, pripravil KodaTim
          </p>
          <a href="#zanima" className="hidden shrink-0 rounded-lg bg-[var(--b)] px-3.5 py-1.5 text-xs font-semibold sm:block">
            Zanima me
          </a>
        </div>
      </div>

      <ProdajniVrh p={p} />

      {/* Kaj sem opazil pri vas */}
      <Odsek>
        <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <Oznaka barva="rja">Kaj sem opazil pri vas</Oznaka>
            <ul className="mt-6 space-y-5">
              {problem.map((t) => (
                <li key={t} className="flex gap-4 text-[clamp(1.15rem,2vw,1.4rem)] font-semibold leading-snug">
                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FDE8E4]">
                    <X className="h-4 w-4 text-[var(--rja)]" strokeWidth={3} aria-hidden />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            {a.pdf.problem_pdf && (
              <p className="mt-8 max-w-2xl border-l-2 border-[var(--rja)] pl-5 leading-relaxed text-[#4b5563]">{a.pdf.problem_pdf}</p>
            )}
          </div>
          {p.ima_posnetek && (
            <figure className="mx-auto w-full max-w-[260px]">
              <div className="h-[380px] overflow-hidden rounded-t-[2rem] border-[9px] border-b-0 border-[var(--crn)] bg-[var(--crn)]">
                <img src={`/predlog/${p.koda}/posnetek`} alt={`${p.domena} danes`} width={390} height={844} className="block h-auto w-full rounded-t-[1.4rem] bg-white" />
              </div>
              <figcaption className="mt-3 text-center text-sm text-[#6b7280]">{p.domena} danes</figcaption>
            </figure>
          )}
        </div>
      </Odsek>

      {/* Danes ↔ z rešitvijo */}
      <Odsek siv>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-3xl border-t-4 border-[var(--rja)] bg-white p-7 shadow-sm ring-1 ring-[#e3e9e7]">
            <Oznaka barva="rja">Danes</Oznaka>
            <ol className="mt-5 space-y-4">
              {a.hero.danes.map((k) => (
                <li key={k} className="flex items-center gap-3 text-[#6b7280]">
                  <X className="h-5 w-5 shrink-0 text-[var(--rja)]" strokeWidth={3} aria-hidden />
                  <span className="text-lg">{k}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-3xl border-t-4 border-[var(--b)] bg-[var(--crn)] p-7 text-white shadow-sm">
            <Oznaka barva="svetla">Z rešitvijo</Oznaka>
            <ol className="mt-5 space-y-4">
              {a.hero.potem.map((k) => (
                <li key={k} className="flex items-center gap-3">
                  <Check className="h-5 w-5 shrink-0 text-[color-mix(in_srgb,var(--b)_70%,white)]" strokeWidth={3} aria-hidden />
                  <span className="text-lg font-semibold">{k}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Odsek>

      {/* Kako deluje: trije telefoni, zaporedje, zato številke */}
      <Odsek>
        <Oznaka barva="b">Kako deluje</Oznaka>
        <h2 className={`${NASLOV} mt-3 max-w-3xl text-[clamp(1.8rem,3.4vw,2.6rem)] font-bold leading-[1.08]`}>
          {a.hero.resitev}
        </h2>
        <div className="mt-12 grid gap-10 sm:grid-cols-3">
          {a.hero.potem.slice(0, 3).map((k, i) => (
            <div key={k} className="flex flex-col items-center text-center">
              <div className="relative">
                <span className="absolute -left-4 -top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--amb)] text-lg font-bold text-[var(--crn)] shadow-md">
                  {i + 1}
                </span>
                <TelefonKorak p={p} a={a} korak={i} besedilo={i === 0 ? "" : k} />
              </div>
              <p className="mt-5 max-w-[15rem] text-lg font-semibold leading-snug">{k}</p>
            </div>
          ))}
        </div>
      </Odsek>

      {/* Preizkusite sami: pripomoček v živo */}
      <section id="preizkusite" className="scroll-mt-12 bg-[var(--crn)] text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <Oznaka barva="svetla">Preizkusite sami</Oznaka>
            <h2 className={`${NASLOV} mt-4 text-[clamp(1.9rem,3.6vw,2.8rem)] font-bold leading-[1.05]`}>{a.resitev.ime}</h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-white/70">{a.resitev.povzetek}</p>
          </div>
          <div className="rounded-3xl bg-white p-6 text-[var(--crn)] shadow-2xl shadow-black/40 sm:p-8">
            <p className="mb-4 text-xs font-semibold text-[#6b7280]">Tako vidi vaša stranka</p>
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

      {/* Kako se lotimo: zaporedje, zato številke */}
      <Odsek siv>
        <Oznaka barva="b">Kako se tega lotimo</Oznaka>
        <h2 className={`${NASLOV} mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] font-bold leading-[1.08]`}>
          Trije koraki in sistem dela za vas
        </h2>
        <ol className="relative mt-12 grid gap-6 md:grid-cols-3">
          <span aria-hidden className="absolute left-[16%] right-[16%] top-[3.25rem] hidden border-t-2 border-dashed border-[color-mix(in_srgb,var(--b)_40%,white)] md:block" />
          {a.pdf.lotimo.map((k, i) => {
            const Ikona = KORAKI[i] ?? Check;
            return (
              <li key={k} className="relative rounded-3xl bg-white p-7 shadow-sm ring-1 ring-[#e3e9e7]">
                <div className="flex items-center justify-between">
                  <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--b)] text-white shadow-md">
                    <Ikona className="h-6 w-6" aria-hidden />
                  </span>
                  <span className={`${NASLOV} text-5xl font-bold text-[var(--amb)]`}>{i + 1}</span>
                </div>
                <p className="mt-6 text-lg font-semibold leading-snug">{k}</p>
              </li>
            );
          })}
        </ol>
      </Odsek>

      {/* Kaj pridobite: prva korist velika, ostale ob njej */}
      <Odsek>
        <Oznaka barva="b">Kaj pridobite</Oznaka>
        <div className="mt-8 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          {prva && (
            <div className="rounded-3xl bg-[var(--crn)] p-8 text-white sm:p-10">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--amb)] text-[var(--crn)]">
                <Clock className="h-6 w-6" aria-hidden />
              </span>
              <p className={`${NASLOV} mt-6 text-[clamp(1.8rem,3.4vw,2.6rem)] font-bold leading-[1.05] text-[var(--amb)]`}>
                {prva.naslov}
              </p>
              {prva.izracun && <p className="mt-5 text-lg leading-relaxed text-white/80">{prva.izracun}</p>}
            </div>
          )}
          <div className="space-y-5">
            {ostale.map((k, i) => {
              const Ikona = KORISTI[i] ?? Check;
              return (
                <div key={k.naslov} className="flex gap-5 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-[#e3e9e7]">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--b)_14%,white)] text-[var(--b)]">
                    <Ikona className="h-6 w-6" aria-hidden />
                  </span>
                  <div>
                    <p className="text-xl font-bold">{k.naslov}</p>
                    {k.izracun && <p className="mt-2 leading-relaxed text-[#4b5563]">{k.izracun}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Odsek>

      {/* Nadgradnje za kasneje (Luka 24. 10.: »nekaj upsellanja od spodaj«) */}
      {nadgradnje.length > 0 && (
        <Odsek siv>
          <Oznaka barva="b">Ko prvi del dela, lahko dodamo</Oznaka>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {nadgradnje.map((n) => (
              <div key={n.naslov} className="rounded-3xl border-l-4 border-[var(--amb)] bg-white p-7 shadow-sm">
                <p className="flex items-center gap-3 text-xl font-bold">
                  <ArrowUpRight className="h-5 w-5 shrink-0 text-[var(--amb)]" strokeWidth={3} aria-hidden />
                  {n.naslov}
                </p>
                {n.opis && <p className="mt-2 pl-8 leading-relaxed text-[#4b5563]">{n.opis}</p>}
              </div>
            ))}
          </div>
        </Odsek>
      )}

      {/* Zanimanje in klic — brez zneskov (Luka 24. 10.: »odstrani ceno … se mu prilagajali«) */}
      <section id="ponudba-kodatim" className="scroll-mt-12 bg-[var(--crn)] text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 lg:grid-cols-2 lg:items-center">
          <div id="zanima" className="scroll-mt-16">
            <ZanimaMe koda={p.koda} ime={p.kratko_ime} />
          </div>
          <div>
            <h2 className={`${NASLOV} text-[clamp(2rem,4vw,3.2rem)] font-bold leading-[1.02]`}>Prepoznate to pri sebi?</h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-white/70">
              Pustite telefon ali pokličite me. V 15 minutah vam pokažem, kako bi delovalo pri vas.
            </p>
            <p className="mt-5 max-w-md leading-relaxed text-white/80">
              <span className="font-semibold text-white">Cena je ugodna in se vam prilagodimo</span> — dogovoriva
              se v kratkem klicu.
            </p>
            {p.garancija && (
              <p className="mt-4 flex max-w-md gap-3 text-sm leading-relaxed text-white/65">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[color-mix(in_srgb,var(--b)_60%,white)]" aria-hidden />
                <span>Garancija v pogodbi: če v 6 mesecih ne prinese rezultata, vrnemo 50 % začetnega plačila.</span>
              </p>
            )}
            <a href={TEL} className="mt-8 inline-flex items-center gap-3 rounded-2xl bg-[var(--b)] px-7 py-5 text-[clamp(1.5rem,3vw,2.1rem)] font-extrabold shadow-xl shadow-black/30 hover:brightness-110">
              <Phone className="h-7 w-7" aria-hidden /> {TELEFON}
            </a>
            <p className="mt-6 flex items-center gap-2 text-white/70">
              <Mail className="h-4 w-4" aria-hidden /> ali odgovorite na mail: <Eposta naslov="luka@kodatim.si" />
            </p>
            <p className="mt-8 text-sm text-white/50">Luka Komplet, KodaTim</p>
          </div>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-8 text-[11px] leading-relaxed text-white/35">
          Predlog je pripravila ekipa KodaTim iz javno dostopnih podatkov na {p.domena}. To ni uradna stran podjetja{" "}
          {p.podjetje.replace(/\.+$/, "")}.
        </p>
      </section>

      {/* Na telefonu je klic vedno pri palcu */}
      <div className="fixed inset-x-4 bottom-4 z-50 flex gap-2 sm:hidden">
        <a href="#zanima" className="flex flex-1 items-center justify-center rounded-2xl bg-[var(--b)] py-4 font-semibold text-white shadow-2xl shadow-black/40">
          Zanima me
        </a>
        <a href={TEL} aria-label={`Pokličite ${TELEFON}`} className="flex w-16 items-center justify-center rounded-2xl bg-[var(--crn)] text-white shadow-2xl shadow-black/40">
          <Phone className="h-5 w-5" aria-hidden />
        </a>
      </div>
    </div>
  );
}

function Odsek({ siv = false, children }: { siv?: boolean; children: ReactNode }) {
  return (
    <section className={siv ? "bg-[var(--meta)]" : ""}>
      <div className="mx-auto max-w-6xl px-4 py-20">{children}</div>
    </section>
  );
}

const OZNAKE = {
  rja: "text-[var(--rja)]",
  b: "text-[color-mix(in_srgb,var(--b)_80%,#0E1B2C)]",
  svetla: "text-[color-mix(in_srgb,var(--b)_55%,white)]",
};

function Oznaka({ barva, children }: { barva: keyof typeof OZNAKE; children: ReactNode }) {
  return (
    <p className={`text-sm font-bold ${OZNAKE[barva]}`}>
      {children}
    </p>
  );
}

const KORAKI = [ClipboardList, MessageCircle, BellRing];
const KORISTI = [MoonStar, TrendingUp, Check];
