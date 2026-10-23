/* eslint-disable @next/next/no-img-element -- stran se natisne v PDF; slike morajo biti navadne */
import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, Check, Phone, X } from "lucide-react";
import type { DeloAgenta, HeroAgenta, MailAgenta, PdfAgenta, Predlog } from "@/lib/predlogi";
import { datumPredloga } from "../oblika";
import { TelefonKorak } from "../PrviZaslon";

/**
 * PDF ponudba prodajnega agenta (Luka, 23. 10. 2026: »problem, rešitev … kak bi se ti tega
 * lotil … kaj bodo prišparali … na koncu še cena«, »par besed na stran, slikice«). Pet strani,
 * na vsaki ena misel in ena slika: problem, rešitev, kako se lotimo, kaj pridobite, cena in klic.
 */

const TELEFON = "040 199 051";
const PRIVZETA_BARVA = "#2f5bd3";

type Agent = DeloAgenta & { hero: HeroAgenta; pdf: PdfAgenta };

export function imaPdfAgenta(p: Predlog): p is Predlog & { agent: Agent; mail: MailAgenta } {
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

export function PonudbaAgenta({ p }: { p: Predlog & { agent: Agent; mail: MailAgenta } }) {
  const a = p.agent;
  const barva = /^#[0-9a-f]{6}$/i.test(p.vizual?.barva ?? "") ? (p.vizual?.barva as string) : PRIVZETA_BARVA;
  const problem = alineje(p.mail.uvod);
  const glavni = p.cene?.find((c) => c.st === a.paket.st);
  const ai = a.paket.ai ? p.cene?.find((c) => c.st === "+") : undefined;

  return (
    <main
      style={{ "--b": barva } as CSSProperties}
      className="flex-1 bg-white text-[#0b1530] [-webkit-print-color-adjust:exact] [print-color-adjust:exact]"
    >
      <style>{"@page { size: A4; } html, body { background: #ffffff !important; }"}</style>

      {/* 1 · Problem */}
      <Stran p={p} prva>
        <Oznaka>Kaj sem opazil pri vas</Oznaka>
        <h1 className="mt-4 flex items-start gap-4 text-[34px] font-bold leading-[1.1] tracking-tight">
          <X className="mt-1.5 h-9 w-9 shrink-0 text-[#c2410c]" strokeWidth={3} aria-hidden />
          {a.hero.problem}
        </h1>
        <div className="mt-10 flex flex-1 items-start gap-8">
          <div className="flex-1 space-y-4">
            {problem.map((t) => (
              <p key={t} className="border-l-4 border-[#c2410c] pl-4 text-[18px] font-medium leading-snug">
                {t}
              </p>
            ))}
            {a.pdf.problem_pdf && (
              <p className="pt-4 text-[14px] leading-relaxed text-[#4b5563]">{a.pdf.problem_pdf}</p>
            )}
          </div>
          {p.ima_posnetek && (
            <figure className="w-[56mm] shrink-0">
              <div className="overflow-hidden rounded-[1.6rem] border-[7px] border-[#0b1530] bg-[#0b1530]">
                <img
                  src={`/predlog/${p.koda}/posnetek`}
                  alt={`Vaša stran ${p.domena} danes`}
                  width={390}
                  height={844}
                  className="block h-auto w-full rounded-[1.1rem] bg-white"
                />
              </div>
              <figcaption className="mt-2 text-center text-[11px] text-[#6b7280]">{p.domena} danes</figcaption>
            </figure>
          )}
        </div>
      </Stran>

      {/* 2 · Rešitev: danes → telefon v treh korakih */}
      <Stran p={p}>
        <Oznaka>Rešitev</Oznaka>
        <h2 className="mt-4 flex items-start gap-4 text-[34px] font-bold leading-[1.1] tracking-tight">
          <Check className="mt-1.5 h-9 w-9 shrink-0 text-[var(--b)]" strokeWidth={3} aria-hidden />
          {a.hero.resitev}
        </h2>
        {a.hero.danes.length > 0 && (
          <p className="mt-8 flex flex-wrap items-center gap-2 text-[13px] text-[#6b7280]">
            <span className="font-semibold text-[#0b1530]">Danes:</span>
            {a.hero.danes.map((d, i) => (
              <span key={d} className="flex items-center gap-2">
                <span className="rounded-full bg-[#f3f4f6] px-3 py-1 line-through decoration-[#9ca3af]">{d}</span>
                {i < a.hero.danes.length - 1 && <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
              </span>
            ))}
          </p>
        )}
        <div className="mt-10 grid flex-1 grid-cols-3 gap-6">
          {a.hero.potem.slice(0, 3).map((k, i) => (
            <div key={k} className="flex flex-col items-center text-center">
              <TelefonKorak p={p} a={a} korak={i} besedilo={k} />
              <p className="mt-4 text-[15px] font-semibold leading-snug">{k}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 rounded-xl bg-[color-mix(in_srgb,var(--b)_8%,white)] px-4 py-3 text-[13px]">
          Preizkusite v živo:{" "}
          <a href={`https://kodatim.si/predlog/${p.koda}`} className="font-semibold text-[var(--b)]">
            kodatim.si/predlog/{p.koda}
          </a>
        </p>
      </Stran>

      {/* 3 · Kako se lotimo (zaporedje, zato številke) */}
      <Stran p={p}>
        <Oznaka>Kako se tega lotimo</Oznaka>
        <ol className="mt-12 flex-1 space-y-10">
          {a.pdf.lotimo.map((k, i) => (
            <li key={k} className="flex items-center gap-6">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--b)] text-[26px] font-bold text-white">
                {i + 1}
              </span>
              <span className="text-[22px] font-semibold leading-snug">{k}</span>
            </li>
          ))}
        </ol>
        {a.paket.zakaj && <p className="text-[13px] leading-relaxed text-[#4b5563]">{a.paket.zakaj}</p>}
      </Stran>

      {/* 4 · Kaj pridobite */}
      <Stran p={p}>
        <Oznaka>Kaj pridobite</Oznaka>
        {p.mail.zakljucek && (
          <p className="mt-4 text-[30px] font-bold leading-[1.15] tracking-tight">{p.mail.zakljucek}</p>
        )}
        <div className="mt-10 flex-1 space-y-5">
          {a.pdf.korist.map((k) => (
            <div key={k.naslov} className="rounded-2xl bg-[#f6f7f9] px-6 py-5">
              <p className="flex items-center gap-3 text-[20px] font-bold">
                <Check className="h-6 w-6 shrink-0 text-[var(--b)]" strokeWidth={3} aria-hidden />
                {k.naslov}
              </p>
              {k.izracun && <p className="mt-2 pl-9 text-[14px] leading-relaxed text-[#374151]">{k.izracun}</p>}
            </div>
          ))}
        </div>
      </Stran>

      {/* 5 · Cena in klic */}
      <Stran p={p}>
        <Oznaka>Cena</Oznaka>
        <div className="mt-6 rounded-2xl border-2 border-[#0b1530] px-6 py-5">
          {glavni && <Vrstica ime={glavni.ime} cena={glavni.cena} krepko />}
          {ai && <Vrstica ime={ai.ime} cena={ai.cena} />}
          {p.mesecnina && <Vrstica ime="Mesečno vzdrževanje" cena={p.mesecnina} />}
        </div>
        {p.garancija && (
          <p className="mt-5 flex gap-3 text-[14px] leading-relaxed">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-[var(--b)]" strokeWidth={3} aria-hidden />
            <span>{p.garancija}</span>
          </p>
        )}
        {p.cene_trg?.primerjava && <p className="mt-3 text-[12px] text-[#6b7280]">{p.cene_trg.primerjava}</p>}

        <div className="mt-auto rounded-2xl bg-[#0b1530] px-7 py-7 text-white">
          <p className="text-[24px] font-bold leading-tight">Prepoznate to pri sebi?</p>
          <p className="mt-3 flex items-center gap-3 text-[30px] font-extrabold">
            <Phone className="h-7 w-7" aria-hidden /> {TELEFON}
          </p>
          <p className="mt-2 text-[14px] text-white/70">
            Pokličite ali odgovorite na mail — v 15 minutah vam pokažem, kako bi delovalo pri vas.
          </p>
          <p className="mt-5 text-[13px] text-white/80">Luka Komplet · KodaTim · luka@kodatim.si</p>
        </div>
        <p className="mt-4 text-[10px] leading-relaxed text-[#9ca3af]">
          Predlog je pripravila ekipa KodaTim iz javno dostopnih podatkov na {p.domena}. To ni uradna stran podjetja{" "}
          {p.podjetje.replace(/\.+$/, "")}. Cene so brez DDV.
        </p>
      </Stran>
    </main>
  );
}

/** Ena stran A4: glava z logotipom, vsebina zapolni višino (natisnjeno brez praznih repov). */
function Stran({ p, prva = false, children }: { p: Predlog; prva?: boolean; children: ReactNode }) {
  return (
    <section className={`${prva ? "" : "break-before-page"} flex h-[262mm] flex-col px-[16mm]`}>
      <div className="mb-10 flex items-center justify-between">
        <img src="/email-logo.jpg" alt="KodaTim.si" width={120} height={39} className="h-auto w-[120px]" />
        <p className="text-right text-[11px] text-[#6b7280]">
          Za {p.kratko_ime} · {datumPredloga(p.ustvarjeno)}
        </p>
      </div>
      {children}
    </section>
  );
}

function Oznaka({ children }: { children: ReactNode }) {
  return <p className="text-[14px] font-semibold text-[var(--b)]">{children}</p>;
}

function Vrstica({ ime, cena, krepko = false }: { ime: string; cena: string; krepko?: boolean }) {
  return (
    <p className={`flex items-baseline justify-between gap-6 py-1.5 ${krepko ? "text-[18px] font-bold" : "text-[15px]"}`}>
      <span>{ime}</span>
      <span className="whitespace-nowrap">{cena}</span>
    </p>
  );
}
