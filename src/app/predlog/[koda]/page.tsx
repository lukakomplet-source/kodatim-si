/* eslint-disable @next/next/no-img-element -- posnetek streže naša pot /posnetek, optimizacija slik ga ne more brati */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, Check, Download, Mail, Phone, Smartphone, Sparkles } from "lucide-react";
import { preberiPredlog } from "@/lib/predlogi";
import { Cene } from "./Cene";
import { DemoStran } from "./DemoStran";
import { Eposta } from "./Eposta";
import { pisavaZa } from "./pisave";
import { datumPredloga } from "./oblika";
import { Ogled } from "./Ogled";
import { PredogledStrani } from "./PredogledStrani";

/**
 * Osebni predlog za podjetje, ki mu piše prodajna ekipa — tako, kot Luka
 * prodaja sam (ponudba Kamenariču, 15. 10. 2026): kaj smo opazili na
 * njihovi strani, predogled nove (iz njihovih lastnih podatkov), zakaj se
 * splača, cene z garancijo in en jasen korak naprej.
 *
 * Stran ni v iskalnikih in jasno piše, da ni uradna stran podjetja.
 * ?interno = ogled, ki se ne šteje (Luka, ekipa).
 */

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ koda: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const TELEFON = "040 199 051";
const TELEFON_URI = "tel:+38640199051";
const EPOSTA = "luka@kodatim.si";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { koda } = await params;
  const branje = await preberiPredlog(koda);
  const ime = branje.stanje === "ok" ? branje.predlog.kratko_ime : "";
  const demo = branje.stanje === "ok" && Boolean(branje.predlog.demo);
  return {
    title: ime
      ? demo
        ? `${ime} — predogled nove strani · KodaTim`
        : `Predlog nove spletne strani za ${ime} — KodaTim`
      : "Predlog nove spletne strani — KodaTim",
    description: "Kaj smo opazili na vaši spletni strani in kako bi lahko izgledala nova.",
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  };
}

export default async function PredlogPage({ params, searchParams }: Props) {
  const [{ koda }, iskanje] = await Promise.all([params, searchParams]);
  const branje = await preberiPredlog(koda);
  if (branje.stanje === "ni") notFound();
  if (branje.stanje === "nedosegljiv") return <Nedosegljiv />;
  const p = branje.predlog;
  const pripravljeno = datumPredloga(p.ustvarjeno);

  // Cela demo stran v treh paketih (kot Kamenarič); ?paket=1|2|3 izbere začetni paket.
  if (p.demo) {
    const izbran = Array.isArray(iskanje.paket) ? iskanje.paket[0] : iskanje.paket;
    const paket = izbran === "2" ? 2 : izbran === "3" ? 3 : 1;
    return (
      <>
        {!("interno" in iskanje) && <Ogled koda={p.koda} />}
        <DemoStran p={p} zacetniPaket={paket} pisava={pisavaZa(p.dejavnost)} />
      </>
    );
  }

  return (
    <>
      {!("interno" in iskanje) && <Ogled koda={p.koda} />}
      <Glava oznaka={`Predlog KodaTim · ni uradna stran podjetja ${p.kratko_ime}`} />

      <main className="flex-1">
        {/* Uvod */}
        <section className="px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-accent/20 bg-accent/[0.06] px-3 py-1 text-xs font-medium text-accent">
              <Sparkles className="h-3.5 w-3.5" />
              Osebni predlog za {p.kratko_ime}
              {pripravljeno && <span className="text-accent/70">· {pripravljeno}</span>}
            </p>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
              Tako bi lahko vaša spletna stran delala več za vas
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-zinc-500">
              Pogledali smo <span className="font-medium text-zinc-700">{p.domena}</span> in pripravili predogled
              nove strani z vašimi storitvami. Spodaj je, kaj smo opazili, kako bi stran izgledala in koliko stane.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="#predogled"
                className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700"
              >
                Poglejte predogled <ArrowDown className="h-4 w-4" />
              </a>
              <a
                href={TELEFON_URI}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
              >
                <Phone className="h-4 w-4" /> {TELEFON}
              </a>
            </div>
          </div>
        </section>

        {/* Kaj smo opazili */}
        {(p.izboljsave.length > 0 || p.ima_posnetek) && (
          <section className="border-t border-zinc-200/70 bg-white px-4 py-16 sm:px-6 sm:py-24">
            <div
              className={`mx-auto grid max-w-6xl items-start gap-12 lg:gap-16 ${
                p.ima_posnetek ? "lg:grid-cols-[280px_1fr]" : ""
              }`}
            >
              {p.ima_posnetek && (
                <figure className="mx-auto w-[240px] sm:w-[260px] lg:sticky lg:top-8">
                  <div className="overflow-hidden rounded-[2.2rem] border-[9px] border-zinc-900 bg-zinc-900 shadow-xl">
                    <img
                      src={`/predlog/${p.koda}/posnetek`}
                      alt={`Sedanja stran ${p.domena} na telefonu`}
                      width={390}
                      height={844}
                      loading="lazy"
                      className="block h-auto w-full rounded-[1.5rem] bg-white"
                    />
                  </div>
                  <figcaption className="mt-3 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
                    <Smartphone className="h-3.5 w-3.5" /> Vaša stran danes, na telefonu
                  </figcaption>
                </figure>
              )}
              <div>
                <p className="text-sm font-medium text-accent">Kaj smo opazili</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
                  Kaj bi na vaši strani izboljšali
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-500">
                  Stran smo pregledali tako, kot jo vidita stranka na telefonu in iskalnik. Vsaka ugotovitev ima
                  rešitev v novi strani.
                </p>
                {p.izboljsave.length > 0 && (
                  <ol className="mt-8 space-y-4">
                    {p.izboljsave.map((iz, i) => (
                      <li key={i} className="rounded-2xl border border-zinc-200 bg-[#fbfbfd] p-5 sm:p-6">
                        <div className="flex gap-4">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-zinc-900">{iz.ugotovitev}</p>
                            {iz.resitev && (
                              <p className="mt-2 flex gap-2 text-sm leading-relaxed text-zinc-600">
                                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                <span>{iz.resitev}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Predogled nove strani */}
        <section id="predogled" className="scroll-mt-6 px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium text-accent">Predogled</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
                Tako bi lahko izgledala vaša nova stran
              </h2>
              <p className="mt-4 text-base leading-relaxed text-zinc-500">
                Besedila so z vaše strani, slike in barve prilagodimo skupaj z vami. Gumbe lahko preizkusite.
              </p>
            </div>
            <div className="mx-auto mt-12 max-w-4xl">
              <PredogledStrani p={p} />
            </div>
            {p.funkcija_opis && (
              <div className="mx-auto mt-8 flex max-w-4xl gap-3 rounded-2xl border border-accent/20 bg-accent/[0.05] p-5 text-sm leading-relaxed text-zinc-700">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <p>
                  <span className="font-semibold text-zinc-900">Kaj vam to prihrani: </span>
                  {p.funkcija_opis}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Zakaj se vam splača */}
        {p.zakaj && p.zakaj.length > 0 && (
          <section className="border-t border-zinc-200/70 bg-white px-4 py-16 sm:px-6 sm:py-24">
            <div className="mx-auto max-w-5xl">
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-sm font-medium text-accent">Zakaj se vam splača</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
                  Več strank, manj ročnega dela
                </h2>
              </div>
              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {p.zakaj.map((z) => (
                  <div key={z.naslov} className="rounded-2xl border border-zinc-200 bg-[#fbfbfd] p-6">
                    <p className="font-semibold text-zinc-900">{z.naslov}</p>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600">{z.besedilo}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Ponudba */}
        {p.cene && p.cene.length > 0 && (
          <section className="border-t border-zinc-200/70 px-4 py-16 sm:px-6 sm:py-24">
            <div className="mx-auto max-w-3xl">
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-sm font-medium text-accent">Cene</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
                  Izberite, kar vam ustreza
                </h2>
                <p className="mt-4 text-base leading-relaxed text-zinc-500">
                  Vsak paket prilagodimo vašim željam — po vsebini, izgledu ali obsegu.
                </p>
              </div>
              <div className="mt-10">
                <Cene cene={p.cene} mesecnina={p.mesecnina} garancija={p.garancija} pogoji={p.garancija_pogoji} />
              </div>
              {p.priloge?.includes("ponudba.pdf") && (
                <p className="mt-6 text-center">
                  <a
                    href={`/predlog/${p.koda}/priloga/ponudba.pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
                  >
                    <Download className="h-4 w-4" /> Prenesite ponudbo (PDF)
                  </a>
                </p>
              )}
            </div>
          </section>
        )}

        {/* Poziv */}
        <section className="bg-ink px-4 py-16 text-white sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">Katera možnost vam je najbližje?</h2>
            <p className="mt-5 text-lg leading-relaxed text-zinc-400">
              Odpišite mi ali pokličite, pa se na kratko slišimo. Stran pripravim po vaših željah.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={TELEFON_URI}
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200"
              >
                <Phone className="h-4 w-4" /> {TELEFON}
              </a>
              <a
                href={`mailto:${EPOSTA}?subject=${encodeURIComponent(`Predlog za ${p.kratko_ime}`)}`}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <Mail className="h-4 w-4" /> <Eposta naslov={EPOSTA} />
              </a>
            </div>
            <p className="mt-6 text-sm text-zinc-500">Luka Komplet · KodaTim · digitalne rešitve za podjetja</p>
          </div>
        </section>
      </main>

      <footer className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-2 text-center text-xs leading-relaxed text-zinc-400">
          <p>
            Predlog je pripravila ekipa KodaTim iz javno dostopnih podatkov na {p.domena} in v Poslovnem registru
            Slovenije. To ni uradna stran podjetja {p.podjetje.replace(/\.+$/, "")}.
          </p>
          <p>Če vas to ne zanima, mi samo odpišite in vam ne pišem več.</p>
          <p>KodaTim.si · KOMPLETKO d.o.o., Parmova ulica 4, 3212 Vojnik</p>
        </div>
      </footer>
    </>
  );
}

function Glava({ oznaka }: { oznaka: string }) {
  return (
    <header className="border-b border-zinc-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-xs font-bold text-white">
            K
          </span>
          <span className="font-semibold tracking-tight text-zinc-900">
            KodaTim<span className="text-accent">.si</span>
          </span>
        </Link>
        {oznaka && <p className="text-xs text-zinc-500">{oznaka}</p>}
      </div>
    </header>
  );
}

function Nedosegljiv() {
  return (
    <>
      <Glava oznaka="" />
      <main className="flex flex-1 items-center justify-center px-4 py-24 sm:px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Predlog se trenutno ne naloži</h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-500">
            Poskusite znova čez nekaj minut ali nas pokličite — predlog vam pokažemo tudi po telefonu.
          </p>
          <a
            href={TELEFON_URI}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white"
          >
            <Phone className="h-4 w-4" /> {TELEFON}
          </a>
        </div>
      </main>
    </>
  );
}
