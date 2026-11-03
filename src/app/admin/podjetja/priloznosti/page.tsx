import Link from "next/link";
import { hrefPodjetja } from "@/lib/podjetja/kljuc";
import { preberiPodjetja, zaPosel, type Podjetje } from "@/lib/podjetja/podatki";
import { ALL_PIPELINE_STAGES, PIPELINE_STAGE_LABELS } from "@/lib/promocije/types";
import { kontekstPodjetij } from "../kontekst";
import { Manjka, STANJE_KOMPLETKO, kdaj } from "../skupno";

/**
 * Priložnosti (faza 6): faze KodaTim iz Promocij (cilji kampanj) in faze Kompletko iz pošiljanj v enem pogledu.
 * Podatki ostanejo v izvornih sistemih; fazo spremeniš v Promocijah oziroma pri klicu.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Priložnosti" };

const KOMPLETKO_RED = ["sestanek", "odgovoril", "klic", "poslan", "kupil", "nedostavljeno", "ne_zanima", "zakljucen"];

const NAJVEC = 12;

type Kartica = { kljuc: string; ime: string; pod: string; href?: string };

function Stolpec({ ime, kartice }: { ime: string; kartice: Kartica[] }) {
  return (
    <section className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
      <h3 className="px-1 text-sm font-semibold text-zinc-900">
        {ime} <span className="font-normal text-zinc-500">{kartice.length}</span>
      </h3>
      <ul className="mt-2 space-y-2">
        {kartice.slice(0, NAJVEC).map((k) => (
          <li key={k.kljuc + k.pod}>
            <Link href={k.href ?? hrefPodjetja(k.kljuc)} className="block rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200 hover:ring-zinc-400">
              <span className="block truncate text-sm font-medium text-zinc-900">{k.ime}</span>
              {k.pod ? <span className="block truncate text-xs text-zinc-500">{k.pod}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
      {kartice.length > NAJVEC ? (
        <p className="mt-2 px-1 text-xs text-zinc-500">in še {kartice.length - NAJVEC} (vsa v Vseh podjetjih)</p>
      ) : null}
    </section>
  );
}

export default async function PriloznostiPage({ searchParams }: { searchParams: Promise<{ posel?: string }> }) {
  const sp = await searchParams;
  const k = await kontekstPodjetij(sp.posel);
  const indeks = await preberiPodjetja();
  const vidna = indeks.podjetja.map((p) => zaPosel(p, k.kodatim, k.kompletko)).filter((p): p is Podjetje => !!p);

  const kodatim = new Map<string, Kartica[]>();
  if (k.kodatim) {
    for (const p of vidna) {
      for (const f of p.kodatim?.faze ?? []) {
        const seznam = kodatim.get(f.faza) ?? [];
        seznam.push({
          kljuc: p.kljuc,
          ime: p.ime || p.kljuc,
          pod: [f.kampanja, f.naslednjiKlic ? `klic ${kdaj(f.naslednjiKlic, false)}` : ""].filter(Boolean).join(", "),
        });
        kodatim.set(f.faza, seznam);
      }
    }
  }

  const kompletko = new Map<string, Kartica[]>();
  if (k.kompletko) {
    for (const p of vidna) {
      const s = p.kompletko?.stanje;
      if (!s || s === "kandidat") continue;
      const seznam = kompletko.get(s) ?? [];
      seznam.push({
        kljuc: p.kljuc,
        ime: p.ime || p.kljuc,
        pod: p.kompletko?.dogovor
          ? `dogovorjen klic ${kdaj(p.kompletko.dogovor, false)}`
          : p.kompletko?.sestanek
            ? `sestanek ${p.kompletko.sestanek.kdaj}`
            : p.dogodki[0]
              ? `${p.dogodki[0].opis.slice(0, 60)}, ${kdaj(p.dogodki[0].cas, false)}`
              : "",
      });
      kompletko.set(s, seznam);
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">Priložnosti</h1>
      <p className="mt-2 max-w-3xl text-base text-zinc-500">
        Kje je katero podjetje v prodaji. KodaTim fazo spremeniš v kampanji, Kompletko pri klicu ali na Panik gumbu.
      </p>
      <div className="mt-4">
        <Manjka manjka={indeks.manjka} />
      </div>

      {k.kompletko ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-900">Kompletko</h2>
          {kompletko.size === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Še nobenega podjetja v prodaji.</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[...KOMPLETKO_RED, ...[...kompletko.keys()].filter((s) => !KOMPLETKO_RED.includes(s))]
                .filter((s) => kompletko.has(s))
                .map((s) => (
                  <Stolpec key={s} ime={STANJE_KOMPLETKO[s] ?? s} kartice={kompletko.get(s)!} />
                ))}
            </div>
          )}
        </section>
      ) : null}

      {k.kodatim ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-900">KodaTim</h2>
          {kodatim.size === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">V kampanjah ni podjetij.</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {ALL_PIPELINE_STAGES.filter((s) => kodatim.has(s)).map((s) => (
                <Stolpec key={s} ime={PIPELINE_STAGE_LABELS[s]} kartice={kodatim.get(s)!} />
              ))}
            </div>
          )}
          <p className="mt-3 text-sm text-zinc-500">
            Kampanje in celoten pipeline: <Link href="/admin/promocije" className="underline underline-offset-2 hover:text-zinc-900">Kampanje</Link>.
          </p>
        </section>
      ) : null}
    </div>
  );
}
