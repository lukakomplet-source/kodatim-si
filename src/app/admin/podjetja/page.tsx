import Link from "next/link";
import { RefreshCw, Search } from "lucide-react";
import { hrefPodjetja } from "@/lib/podjetja/kljuc";
import { preberiPodjetja, ujemaSe, zaPosel, type Podjetje } from "@/lib/podjetja/podatki";
import { kontekstPodjetij } from "./kontekst";
import { Manjka, ZnackePoslov, kdaj } from "./skupno";

/**
 * Vsa podjetja (faza 6): en zapis za vsako podjetje z obema posloma, povezan po davčni, nato po domeni.
 * Podatki ostanejo v Strankah, Promocijah in obeh Harveyjih; ta stran jih samo bere (spomin 10 minut).
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Vsa podjetja" };

const NA_STRAN = 50;

const FILTRI = [
  { kljuc: "vse", ime: "Vsa", velja: () => true },
  { kljuc: "stik", ime: "V stiku", velja: (p: Podjetje) => p.dogodki.length > 0 },
  {
    kljuc: "odgovor",
    ime: "Odgovorili",
    velja: (p: Podjetje) => p.dogodki.some((d) => d.vrsta === "odgovor") || p.kompletko?.stanje === "sestanek",
  },
  { kljuc: "brez", ime: "Brez stika", velja: (p: Podjetje) => p.dogodki.length === 0 },
  { kljuc: "odjava", ime: "Odjava", velja: (p: Podjetje) => p.odjava },
] as const;

export default async function PodjetjaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; f?: string; s?: string; posel?: string; osvezi?: string }>;
}) {
  const sp = await searchParams;
  const k = await kontekstPodjetij(sp.posel);
  const indeks = await preberiPodjetja(sp.osvezi === "1");
  const q = (sp.q ?? "").trim().slice(0, 100);

  const vidna = indeks.podjetja
    .map((p) => zaPosel(p, k.kodatim, k.kompletko))
    .filter((p): p is Podjetje => !!p && ujemaSe(p, q));
  const filter = FILTRI.find((f) => f.kljuc === sp.f) ?? FILTRI[0];
  const seznam = vidna
    .filter(filter.velja)
    .sort((a, b) => b.zadnji.localeCompare(a.zadnji) || a.ime.localeCompare(b.ime, "sl"));
  const strani = Math.max(1, Math.ceil(seznam.length / NA_STRAN));
  const stran = Math.min(strani, Math.max(1, Number(sp.s) || 1));
  const prikaz = seznam.slice((stran - 1) * NA_STRAN, stran * NA_STRAN);

  const url = (polja: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const v = { q, f: filter.kljuc === "vse" ? undefined : filter.kljuc, ...polja };
    for (const [kljuc, vrednost] of Object.entries(v)) if (vrednost) p.set(kljuc, String(vrednost));
    const s = p.toString();
    return s ? `/admin/podjetja?${s}` : "/admin/podjetja";
  };

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">Vsa podjetja</h1>
      <p className="mt-2 max-w-3xl text-base text-zinc-500">
        Vsako podjetje enkrat, z obema posloma. Povezano po davčni, nato po domeni. Klik odpre kartico s časovnico.
        {!k.kodatim ? " Vidiš samo Kompletko." : !k.kompletko ? " Vidiš samo KodaTim." : ""}
      </p>

      <form action="/admin/podjetja" className="mt-5 flex max-w-2xl gap-2">
        {filter.kljuc !== "vse" ? <input type="hidden" name="f" value={filter.kljuc} /> : null}
        <label className="relative flex-1">
          <span className="sr-only">Išči podjetje</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
          <input
            name="q"
            defaultValue={q}
            placeholder="Ime, davčna, domena, e-naslov ali telefon"
            className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </label>
        <button className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700">Išči</button>
      </form>

      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Filter">
        {FILTRI.map((f) => {
          const st = vidna.filter(f.velja).length;
          const izbran = f.kljuc === filter.kljuc;
          return (
            <Link
              key={f.kljuc}
              href={url({ f: f.kljuc === "vse" ? undefined : f.kljuc })}
              className={`rounded-full px-3 py-1 text-sm ring-1 ${
                izbran ? "bg-zinc-900 text-white ring-zinc-900" : "text-zinc-700 ring-zinc-300 hover:ring-zinc-500"
              }`}
            >
              {f.ime} <span className={izbran ? "text-zinc-300" : "text-zinc-400"}>{st}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 space-y-3">
        <Manjka manjka={indeks.manjka} />
      </div>

      {prikaz.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">
          {q ? `Za »${q}« ni podjetja. Preveri ga v zavihku Dodaj in uvozi, kjer iščem tudi v registru.` : "Ni podjetij."}
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-zinc-200 rounded-2xl bg-white ring-1 ring-zinc-200">
          {prikaz.map((p) => (
            <li key={p.kljuc}>
              <Link href={hrefPodjetja(p.kljuc)} className="flex flex-col gap-1 px-4 py-3 hover:bg-zinc-50 sm:flex-row sm:items-center sm:gap-4">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-zinc-900">{p.ime || p.domene[0] || p.kljuc}</span>
                  <span className="block truncate text-xs text-zinc-500">
                    {[p.davcna ? `davčna ${p.davcna}` : "brez davčne", p.domene[0] ?? p.kompletko?.domena, p.kraj]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </span>
                <ZnackePoslov p={p} />
                <span className="w-full shrink-0 text-xs text-zinc-500 sm:w-56 sm:text-right">
                  {p.dogodki[0] ? (
                    <>
                      <span className="block truncate">{p.dogodki[0].opis}</span>
                      <span className="text-zinc-400">{kdaj(p.dogodki[0].cas)}</span>
                    </>
                  ) : (
                    "še brez stika"
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
        <span>
          {seznam.length} podjetij{strani > 1 ? `, stran ${stran} od ${strani}` : ""}. Prebrano {kdaj(indeks.ustvarjeno)}.{" "}
          <Link href={url({ osvezi: "1", s: stran > 1 ? stran : undefined })} className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-zinc-900">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Osveži
          </Link>
        </span>
        {strani > 1 ? (
          <span className="flex gap-2">
            {stran > 1 ? (
              <Link href={url({ s: stran - 1 })} className="rounded-full px-3 py-1 ring-1 ring-zinc-300 hover:ring-zinc-500">
                Nazaj
              </Link>
            ) : null}
            {stran < strani ? (
              <Link href={url({ s: stran + 1 })} className="rounded-full px-3 py-1 ring-1 ring-zinc-300 hover:ring-zinc-500">
                Naprej
              </Link>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}
