import Link from "next/link";
import type { ReactNode } from "react";
import {
  AtSign,
  BadgeCheck,
  ChartLine,
  Compass,
  Globe,
  Handshake,
  Inbox,
  PenLine,
  ScanSearch,
  Search,
  Send,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import {
  SLOJI,
  VLOGE,
  type Delavec,
  type KljucDelavca,
  type Povzetek,
  type Lijak,
} from "@/lib/prodajna-ekipa";
import { ODLOCITEV, STANJE, kdaj, stevilo, uraLokalno } from "./oblika";

/**
 * Ekipa na eni sliki: vodja zgoraj, plasti od iskanja do prodaje, analitik
 * ob strani s povratno zanko. Puščica med delavcema »teče«, ko je tisti, h
 * kateremu vodi, v zadnjih 20 minutah kaj naredil — tako se na prvi pogled
 * vidi, kje se delo premika in kje stoji. Na telefonu se plasti zložijo.
 */

const IKONE: Record<KljucDelavca, ReactNode> = {
  vodja: <Compass className="h-5 w-5" />,
  iskalec: <Search className="h-5 w-5" />,
  bralec: <Globe className="h-5 w-5" />,
  ocenjevalec: <ScanSearch className="h-5 w-5" />,
  raziskovalec: <AtSign className="h-5 w-5" />,
  pisec: <PenLine className="h-5 w-5" />,
  kontrolor: <ShieldCheck className="h-5 w-5" />,
  odobritev: <UserCheck className="h-5 w-5" />,
  preverjevalec: <BadgeCheck className="h-5 w-5" />,
  posiljatelj: <Send className="h-5 w-5" />,
  bralec_odgovorov: <Inbox className="h-5 w-5" />,
  analitik: <ChartLine className="h-5 w-5" />,
  prodaja: <Handshake className="h-5 w-5" />,
};


export function Diagram({ povzetek, lijak }: { povzetek: Povzetek; lijak: Lijak | null }) {
  const po = Object.fromEntries(povzetek.delavci.map((d) => [d.kljuc, d])) as Record<KljucDelavca, Delavec>;
  const zdaj = povzetek.ustvarjeno;
  const vSloju = (sloj: string) =>
    (Object.keys(VLOGE) as KljucDelavca[]).filter((k) => VLOGE[k].sloj === sloj && po[k]);

  return (
    <div className="pe-oder relative mt-5 overflow-hidden rounded-2xl p-4 text-zinc-100 ring-1 ring-indigo-400/20 sm:p-6">
      <style>{CSS}</style>
      <div className="grid gap-4 lg:grid-cols-[1fr_15rem]">
        <div>
          {SLOJI.map((sloj, i) => {
            const kljuci = vSloju(sloj.kljuc);
            if (kljuci.length === 0) return null;
            return (
              <div key={sloj.kljuc}>
                {i > 0 ? <Navpicna tece={povzetek.tok[kljuci[0]]} /> : null}
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-300/80">
                  {sloj.naslov}
                </p>
                <div className="flex flex-col items-stretch gap-0 sm:flex-row sm:items-stretch">
                  {kljuci.map((k, j) => (
                    <div key={k} className="flex flex-1 flex-col sm:flex-row sm:items-center">
                      {j > 0 ? <Vodoravna tece={povzetek.tok[k]} /> : null}
                      <Kartica delavec={po[k]} zdaj={zdaj} siroka={k === "vodja" || k === "odobritev"}>
                        {k === "vodja" ? <VodjaVrstica povzetek={povzetek} /> : null}
                        {k === "prodaja" && lijak ? <LijakVrstica lijak={lijak} /> : null}
                      </Kartica>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="lg:pt-7">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-300/80">
            Ob strani · povratna zanka
          </p>
          {po.analitik ? <Kartica delavec={po.analitik} zdaj={zdaj} /> : null}
          <p className="mt-3 text-xs leading-relaxed text-zinc-400">
            Analitik spremlja odzivnost, odjave in odbitja. Ko odbitij preseže mejo, vodja sam ustavi
            pošiljanje — črtkana zanka nazaj k vodji.
          </p>
          <div className="pe-zanka mt-3 hidden h-40 rounded-xl border border-dashed border-indigo-400/30 lg:block" />
        </div>
      </div>
    </div>
  );
}

function Kartica({
  delavec,
  zdaj,
  siroka = false,
  children,
}: {
  delavec: Delavec;
  zdaj: string;
  siroka?: boolean;
  children?: ReactNode;
}) {
  const vloga = VLOGE[delavec.kljuc];
  const stanje = STANJE[delavec.stanje] ?? STANJE.caka;
  const dela = delavec.stanje === "dela";
  return (
    <Link
      href={`/admin/prodajna-ekipa/${delavec.kljuc}`}
      className={`pe-kartica group block flex-1 rounded-xl p-3 transition hover:-translate-y-0.5 ${
        dela ? "pe-dela" : ""
      } ${siroka ? "sm:min-w-[22rem]" : "sm:min-w-0"}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
            dela ? "bg-emerald-400/15 text-emerald-300" : "bg-indigo-400/10 text-indigo-200"
          } ring-1 ring-inset ring-white/10`}
        >
          {IKONE[delavec.kljuc]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-white">{vloga.ime}</p>
            <span className={`flex shrink-0 items-center gap-1.5 text-[11px] ${stanje.besedilo}`}>
              <span className={`h-2 w-2 rounded-full ${stanje.pika}`} />
              {stanje.oznaka}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-zinc-400">{vloga.naloga}</p>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold tabular-nums text-white">
          {stevilo(delavec.glavna.vrednost)}
          <span className="ml-1.5 text-xs font-normal text-zinc-400">{delavec.glavna.oznaka}</span>
        </p>
        <p className="shrink-0 text-[11px] text-zinc-500">{kdaj(delavec.zadnjic, zdaj)}</p>
      </div>
      {delavec.cilj ? (
        <div className="mt-2">
          <div className="flex justify-between text-[11px] text-zinc-500">
            <span>{delavec.cilj.oznaka}</span>
            <span className="tabular-nums">
              {stevilo(delavec.cilj.vrednost)} / {stevilo(delavec.cilj.cilj)}
            </span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-indigo-400"
              style={{
                width: `${Math.min(100, (100 * delavec.cilj.vrednost) / Math.max(1, delavec.cilj.cilj))}%`,
              }}
            />
          </div>
        </div>
      ) : null}
      {children}
    </Link>
  );
}

function VodjaVrstica({ povzetek }: { povzetek: Povzetek }) {
  const z = povzetek.zanka;
  const kaj = ODLOCITEV[z.odlocitev] ?? "še ni odločil";
  return (
    <p className="mt-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-zinc-300">
      Zadnji krog: <span className="text-white">{kaj}</span>
      {z.naslednji_krog ? <> · naslednji ob {uraLokalno(z.naslednji_krog).split(" ").pop()}</> : null}
      {!povzetek.posiljanje.vklopljeno ? (
        <> · pošiljanje izklopljeno ({povzetek.posiljanje.razlog})</>
      ) : null}
    </p>
  );
}

function LijakVrstica({ lijak }: { lijak: Lijak }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
      {lijak.faze.map((f, i) => (
        <span key={f.kljuc} className="flex items-center gap-1">
          {i > 0 ? <span className="text-zinc-600">→</span> : null}
          <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-zinc-300">
            {f.oznaka} <span className="tabular-nums text-white">{f.stevilo}</span>
          </span>
        </span>
      ))}
      <span className="ml-1 text-zinc-400">
        · prodano {lijak.prodano} ({stevilo(Math.round(lijak.vrednost))} €)
      </span>
    </div>
  );
}

function Vodoravna({ tece }: { tece: boolean }) {
  return (
    <div className="flex h-6 items-center justify-center sm:h-auto sm:w-8">
      <div className={`pe-crta-n h-full w-0.5 sm:hidden ${tece ? "pe-tece-n" : ""}`} />
      <div className={`pe-crta hidden h-0.5 w-full sm:block ${tece ? "pe-tece" : ""}`} />
    </div>
  );
}

function Navpicna({ tece }: { tece: boolean }) {
  return (
    <div className="flex h-7 justify-center">
      <div className={`pe-crta-n h-full w-0.5 ${tece ? "pe-tece-n" : ""}`} />
    </div>
  );
}

const CSS = `
.pe-oder {
  background-color: #070b18;
  background-image:
    radial-gradient(60rem 30rem at 50% -10%, rgba(99,102,241,.22), transparent 60%),
    linear-gradient(rgba(129,140,248,.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(129,140,248,.06) 1px, transparent 1px);
  background-size: auto, 28px 28px, 28px 28px;
}
.pe-kartica {
  background: linear-gradient(180deg, rgba(30,34,64,.92), rgba(15,18,38,.92));
  box-shadow: inset 0 0 0 1px rgba(129,140,248,.18), 0 8px 24px -12px rgba(0,0,0,.7);
}
.pe-kartica:hover { box-shadow: inset 0 0 0 1px rgba(165,180,252,.55), 0 10px 30px -10px rgba(99,102,241,.45); }
.pe-dela { box-shadow: inset 0 0 0 1px rgba(52,211,153,.55), 0 0 26px -6px rgba(52,211,153,.45); }
.pe-crta { background: rgba(129,140,248,.25); }
.pe-crta-n { background: rgba(129,140,248,.25); }
.pe-tece {
  background-image: repeating-linear-gradient(90deg, rgba(165,180,252,.95) 0 6px, transparent 6px 12px);
  background-size: 24px 2px;
  animation: pe-tok 0.9s linear infinite;
}
.pe-tece-n {
  background-image: repeating-linear-gradient(180deg, rgba(165,180,252,.95) 0 6px, transparent 6px 12px);
  background-size: 2px 24px;
  animation: pe-tok-n 0.9s linear infinite;
}
@keyframes pe-tok { from { background-position: 0 0; } to { background-position: 24px 0; } }
@keyframes pe-tok-n { from { background-position: 0 0; } to { background-position: 0 24px; } }
@media (prefers-reduced-motion: reduce) {
  .pe-tece, .pe-tece-n { animation: none; }
}
`;
