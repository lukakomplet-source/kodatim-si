/* eslint-disable @next/next/no-img-element -- stran se natisne v PDF; slike morajo biti navadne */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { preberiPredlog, type DeloAgenta, type Predlog } from "@/lib/predlogi";
import { Cene } from "../Cene";
import { datumPredloga } from "../oblika";
import { PredogledStrani } from "../PredogledStrani";
import { imaPdfAgenta, PonudbaAgenta } from "./PonudbaAgenta";

/**
 * Ponudba v PDF (A4), ki gre s prvim mailom kot priloga — ista vsebina kot
 * stran predloga, razporejena na tri strani: kaj smo opazili, predogled,
 * zakaj se splača s cenami in garancijo. Harvey jo natisne s Playwrightom
 * in doda nogo s podatki podjetja in številko strani.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PonudbaPage({ params }: { params: Promise<{ koda: string }> }) {
  const { koda } = await params;
  const branje = await preberiPredlog(koda);
  if (branje.stanje !== "ok") notFound();
  const p = branje.predlog;
  const povezava = `kodatim.si/predlog/${p.koda}`;
  const imaSliki = ["predogled-racunalnik.jpg", "predogled-telefon.jpg"].every((i) => p.priloge?.includes(i));
  const podjetje = p.podjetje.replace(/\.+$/, "");
  const a = p.agent;
  // Agentova ponudba od 23. 10. 2026: pet strani, problem → rešitev → kako → korist → cena.
  if (imaPdfAgenta(p)) return <PonudbaAgenta p={p} />;

  return (
    <main className="flex-1 bg-white text-zinc-900 [-webkit-print-color-adjust:exact] [print-color-adjust:exact]">
      <style>{"@page { size: A4; } html, body { background: #ffffff !important; }"}</style>

      {/* 1 · Kaj smo opazili */}
      <section className="px-[14mm]">
        <div className="flex items-center justify-between border-b border-zinc-200 pb-5">
          <img src="/email-logo.jpg" alt="KodaTim.si" width={180} height={58} className="h-auto w-[180px]" />
          <div className="text-right text-xs text-zinc-500">
            <p className="font-semibold uppercase tracking-wider text-accent">Ponudba</p>
            <p className="mt-0.5">{datumPredloga(p.ustvarjeno)}</p>
          </div>
        </div>
        <h1 className="mt-8 text-[27px] font-semibold leading-tight tracking-tight">
          {a ? `${a.resitev.ime} za ${p.kratko_ime}` : `Predogled nove spletne strani in ponudba za ${p.kratko_ime}`}
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-zinc-600">
          {a
            ? a.resitev.povzetek
            : `Spoštovani, pogledali smo vašo spletno stran ${p.domena} in pripravili predogled nove strani z vašimi storitvami. Spodaj je, kaj smo opazili, kako bi stran izgledala, zakaj se vam splača in koliko stane.`}
        </p>
        <p className="mt-5 rounded-xl border border-accent/30 bg-accent/[0.05] px-4 py-3 text-[13px] text-zinc-700">
          Predogled v živo, kjer lahko preizkusite tudi gumbe:{" "}
          <a href={`https://${povezava}`} className="font-semibold text-accent">
            {povezava}
          </a>
        </p>

        {a && (
          <div className="mt-9 grid grid-cols-2 gap-7">
            <div>
              <h2 className="text-lg font-semibold">Kaj smo opazili</h2>
              <ol className="mt-3 space-y-3">
                {a.diagnoza.problemi.slice(0, 3).map((x) => (
                  <li key={x.problem} className="break-inside-avoid border-l-2 border-accent pl-3">
                    <p className="text-[13px] font-medium">{x.problem}</p>
                    {x.citat && <p className="mt-1 text-[11.5px] italic text-zinc-500">»{x.citat}«</p>}
                    {x.posledica && <p className="mt-1 text-[12px] leading-relaxed text-zinc-600">{x.posledica}</p>}
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Kaj dobite več kot zdaj</h2>
              <Zakaj p={p} brezNaslova />
            </div>
          </div>
        )}

        {!a && (p.izboljsave.length > 0 || p.ima_posnetek) && (
          <>
            <h2 className="mt-9 text-lg font-semibold">Kaj smo opazili na vaši sedanji strani</h2>
            <div className="mt-4 flex items-start gap-7">
              {p.ima_posnetek && (
                <figure className="w-[52mm] shrink-0">
                  <div className="overflow-hidden rounded-[1.6rem] border-[7px] border-zinc-900 bg-zinc-900">
                    <img
                      src={`/predlog/${p.koda}/posnetek`}
                      alt={`Sedanja stran ${p.domena} na telefonu`}
                      width={390}
                      height={844}
                      className="block h-auto w-full rounded-[1.1rem] bg-white"
                    />
                  </div>
                  <figcaption className="mt-2 text-center text-[11px] text-zinc-500">Vaša stran danes, na telefonu</figcaption>
                </figure>
              )}
              <ol className="flex-1 space-y-3">
                {p.izboljsave.map((iz, i) => (
                  <li key={i} className="break-inside-avoid rounded-xl border border-zinc-200 p-4">
                    <div className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-[13px] font-medium">{iz.ugotovitev}</p>
                        {iz.resitev && (
                          <p className="mt-1.5 flex gap-2 text-[12.5px] leading-relaxed text-zinc-600">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            <span>{iz.resitev}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </section>

      {/* 2 · Predogled: sliki, ki ju Harvey naredi tik pred PDF (natančna postavitev); brez njiju živa kopija */}
      <section className="break-before-page px-[14mm]">
        <h2 className="text-lg font-semibold">Tako bi lahko izgledala vaša nova stran</h2>
        <p className="mt-1.5 text-[13px] text-zinc-600">
          Besedila so z vaše strani, slike in barve prilagodimo skupaj z vami. V živo:{" "}
          <span className="font-semibold text-accent">{povezava}</span>
        </p>
        {imaSliki ? (
          <>
            <img
              src={`/predlog/${p.koda}/priloga/predogled-racunalnik.jpg`}
              alt="Predogled nove strani na računalniku"
              width={1280}
              height={800}
              className="mt-5 block h-auto w-full rounded-xl border border-zinc-200"
            />
            <div className="mt-5 flex items-start gap-7">
              <figure className="w-[50mm] shrink-0">
                <div className="overflow-hidden rounded-[1.6rem] border-[7px] border-zinc-900 bg-zinc-900">
                  <img
                    src={`/predlog/${p.koda}/priloga/predogled-telefon.jpg`}
                    alt="Predogled na telefonu"
                    width={390}
                    height={844}
                    className="block h-auto w-full rounded-[1.1rem] bg-white"
                  />
                </div>
                <figcaption className="mt-2 text-center text-[11px] text-zinc-500">Na telefonu</figcaption>
              </figure>
              <div className="flex-1 space-y-4 pt-2">
                {p.funkcija_opis && (
                  <p className="rounded-xl border border-accent/20 bg-accent/[0.05] px-4 py-3 text-[13px] leading-relaxed text-zinc-700">
                    <span className="font-semibold text-zinc-900">Kaj vam to prihrani: </span>
                    {p.funkcija_opis}
                  </p>
                )}
                {a ? <PredPo a={a} /> : <Zakaj p={p} />}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mt-5" style={{ zoom: 0.62 }}>
              <PredogledStrani p={p} />
            </div>
            {p.funkcija_opis && (
              <p className="mt-5 rounded-xl border border-accent/20 bg-accent/[0.05] px-4 py-3 text-[13px] leading-relaxed text-zinc-700">
                <span className="font-semibold text-zinc-900">Kaj vam to prihrani: </span>
                {p.funkcija_opis}
              </p>
            )}
          </>
        )}
      </section>

      {/* 3 · Cene, garancija, naslednji korak (»zakaj« je na 2. strani ob slikah) */}
      <section className="break-before-page px-[14mm]">
        {!imaSliki && (
          <div className="mb-8">
            <Zakaj p={p} />
          </div>
        )}

        {p.cene && p.cene.length > 0 && (
          <div className="break-inside-avoid">
            <h2 className="text-lg font-semibold">Cene</h2>
            <div className="mt-3 text-[13px]">
              <Cene
                cene={p.cene}
                mesecnina={p.mesecnina}
                garancija={p.garancija}
                pogoji={p.garancija_pogoji}
                kompaktno
              />
            </div>
          </div>
        )}

        <div className="break-inside-avoid">
          <h2 className="mt-8 text-lg font-semibold">Naslednji korak</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-700">
            Vas prosim, da mi odpišete, katera možnost vam je najbližje in kaj bi želeli drugače. Potem se lahko na
            kratko slišimo. Stran brez težav prilagodimo vašim željam, po vsebini, izgledu ali obsegu paketa.
          </p>
          <div className="mt-5 flex items-center gap-4">
            <img src="/email-logo.jpg" alt="KodaTim.si" width={130} height={42} className="h-auto w-[130px]" />
            <div className="border-l-2 border-accent pl-4 text-[12.5px] leading-relaxed">
              <p className="font-semibold">Luka Komplet</p>
              <p>KodaTim · digitalne rešitve za podjetja</p>
              <p>luka@kodatim.si · +386 40 199 051</p>
              <p>kodatim.si</p>
            </div>
          </div>
          <p className="mt-6 text-[10.5px] leading-relaxed text-zinc-400">
            Predlog je pripravila ekipa KodaTim iz javno dostopnih podatkov na {p.domena} in v Poslovnem registru
            Slovenije. To ni uradna stran podjetja {podjetje}. Cene so brez DDV.
          </p>
        </div>
      </section>
    </main>
  );
}

function PredPo({ a }: { a: DeloAgenta }) {
  if (a.resitev.pred_po.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 text-[12px] leading-relaxed">
      <div className="grid grid-cols-2 bg-zinc-50 font-semibold text-zinc-500">
        <p className="px-3 py-2">Zdaj</p>
        <p className="px-3 py-2">Z novo rešitvijo</p>
      </div>
      {a.resitev.pred_po.map((x) => (
        <div key={x.zdaj} className="grid grid-cols-2 border-t border-zinc-200">
          <p className="px-3 py-2 text-zinc-500">{x.zdaj}</p>
          <p className="px-3 py-2 text-zinc-800">{x.potem}</p>
        </div>
      ))}
    </div>
  );
}

function Zakaj({ p, brezNaslova = false }: { p: Predlog; brezNaslova?: boolean }) {
  if (!p.zakaj || p.zakaj.length === 0) return null;
  return (
    <div>
      {!brezNaslova && <h2 className="text-[15px] font-semibold">Zakaj se vam splača</h2>}
      <ul className="mt-2.5 space-y-2.5">
        {p.zakaj.map((z) => (
          <li key={z.naslov} className="flex gap-2.5 text-[12.5px] leading-relaxed text-zinc-700">
            <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" />
            <span>
              <span className="font-semibold text-zinc-900">{z.naslov}:</span> {z.besedilo}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
