import Link from "next/link";
import { redirect } from "next/navigation";
import { Database, Download, ExternalLink, Search, TrendingDown } from "lucide-react";
import { requireAdmin } from "@/lib/require-admin";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { eur } from "@/lib/avtonet/analiza";
import {
  filtriIzParams,
  steviloFiltrov,
  uporabiFiltre,
  type FiltrirljivaPoizvedba,
} from "@/lib/avtonet/filtriVozil";
import { preberiStatistike } from "@/lib/avtonet/statistikaBranje";
import { razvrstitevIzParam, stolpecZa } from "@/lib/avtonet/razvrscanje";
import { FiltriVozilForm, type ZnamkaZModeli } from "../FiltriVozilForm";
import { RazvrstiIzbira } from "../RazvrstiIzbira";
import { KakoDeluje } from "../KakoDeluje";

/**
 * The whole collected database, one row per advert, with a link to each.
 *
 * This is the "show me what we actually have" screen: not a statistic, not a
 * summary, but the rows themselves — so a number on the analysis page can always
 * be traced back to the adverts it came from. Every row links out to the source,
 * because the ultimate check on any of this is the advert itself.
 *
 * Server-side filtering and paging rather than loading everything: the table
 * grows to tens of thousands of rows, and the established pattern in this
 * codebase for paginated server data is URL search params plus a GET form.
 */

export const dynamic = "force-dynamic";

const NA_STRAN = 50;

type Vrstica = {
  id: string;
  avtonet_id: string;
  naziv: string | null;
  znamka: string | null;
  letnik: number | null;
  km: number | null;
  km_moci: number | null;
  gorivo: string | null;
  menjalnik: string | null;
  cena_eur: number | null;
  cena_prvotna_eur: number | null;
  status: string;
  first_seen: string;
  last_seen: string;
  lokacija: string | null;
  prodajalec_naziv: string | null;
  je_dealer: boolean | null;
  detajl_zajet: string | null;
  url: string;
};

const STATUSI = [
  { kljuc: "", oznaka: "Vsi" },
  { kljuc: "aktiven", oznaka: "Aktivni" },
  { kljuc: "izginil", oznaka: "Izginuli" },
  { kljuc: "prodano", oznaka: "Označeni prodano" },
];

export default async function BazaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await requireAdmin();
  } catch {
    redirect("/prijava?redirect=/avtonet/baza");
  }

  const sp = await searchParams;
  const stran = Math.max(1, Number(sp.stran ?? 1) || 1);
  const od = (stran - 1) * NA_STRAN;
  const status = typeof sp.status === "string" ? sp.status : "";
  const filtri = filtriIzParams(sp);
  const razvrstitev = razvrstitevIzParam(sp.razvrsti);
  const aktivnihFiltrov = steviloFiltrov(filtri);

  const db = createAvtonetClient();

  // A shallow structural view of the builder: chaining on the full Supabase
  // generic re-instantiates its row types at every step and trips TS2589.
  type Poizvedba = FiltrirljivaPoizvedba & {
    order(c: string, o: { ascending: boolean; nullsFirst?: boolean }): Poizvedba;
    range(a: number, b: number): PromiseLike<{
      data: unknown[] | null;
      count: number | null;
      error: { message: string } | null;
    }>;
  };

  let q = db
    .from("avtonet_oglasi")
    .select(
      "id, avtonet_id, naziv, znamka, letnik, km, km_moci, gorivo, menjalnik, cena_eur, cena_prvotna_eur, status, first_seen, last_seen, lokacija, prodajalec_naziv, je_dealer, detajl_zajet, url",
      { count: "exact" }
    ) as unknown as Poizvedba;

  q = uporabiFiltre(q, filtri);
  if (status) q = q.eq("status", status) as Poizvedba;

  const ureditev = stolpecZa(razvrstitev);
  const { data, count, error } = await q
    .order(ureditev.stolpec, { ascending: ureditev.ascending, nullsFirst: ureditev.nullsFirst })
    // A stable tiebreaker: without it two adverts of the same year (or price, or
    // mileage) can swap places between pages and appear twice or not at all.
    .order("id", { ascending: true })
    .range(od, od + NA_STRAN - 1);

  // The brand→models catalogue, precomputed by the worker's statistics step.
  const st = await preberiStatistike(["modeli_seznam"]);
  const znamkeModeli =
    ((st.modeli_seznam as { znamke: ZnamkaZModeli[] } | null)?.znamke ?? []) as ZnamkaZModeli[];

  const vrstice = (data ?? []) as unknown as Vrstica[];
  const skupaj = count ?? 0;
  const zadnjaStran = Math.max(1, Math.ceil(skupaj / NA_STRAN));

  // Pagination keeps EVERY filter param, whatever it is.
  const povezava = (nastran: number) => {
    const query: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(sp)) {
      if (v !== undefined && k !== "stran") query[k] = v;
    }
    query.stran = String(nastran);
    return { pathname: "/avtonet/baza", query };
  };

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-zinc-900 sm:text-3xl">
            <Database className="h-6 w-6 text-accent" />
            Baza oglasov
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] text-zinc-500">
            Vsi zbrani oglasi, kakršni so v bazi. Klik na vozilo odpre izvirni oglas na Avto.netu — tako
            je vsako številko iz analize mogoče preveriti pri viru.
          </p>
        </div>
        <a
          href="/api/avtonet/izvoz"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
        >
          <Download className="h-4 w-4" />
          Izvozi vse (CSV)
        </a>
      </header>

      <KakoDeluje
        naslov="Kaj je v tej tabeli"
        uvod={
          <>
            Ena vrstica = en oglas na Avto.netu, v stanju, kot smo ga videli ob zadnjem pregledu.
            Ključ je ID oglasa pri viru, zato isti avto nikoli ne nastopa dvakrat, tudi če ga pregled
            sreča v več rezinah trga.
          </>
        }
        koraki={[
          {
            naslov: "Od kod so podatki v stolpcih",
            besedilo: (
              <>
                Vozilo, letnik, kilometri, moč, gorivo, menjalnik in cena so s <strong>strani z
                rezultati</strong> — te dobimo pri vsakem pregledu. Prodajalec, kraj, oprema,
                karoserija in barva pa so s <strong>strani posameznega oglasa</strong>, ki jo odpremo
                samo enkrat, ko oglas prvič srečamo.
              </>
            ),
          },
          {
            naslov: "„Podrobnosti še ne zajete“",
            besedilo: (
              <>
                Pomeni, da smo oglas videli na seznamu, njegove strani pa še nismo odprli. Osnovni
                podatki so točni; oprema in prodajalec pridejo, ko na vrsto pride 2. faza pregleda.
              </>
            ),
          },
          {
            naslov: "Prečrtana cena",
            besedilo: (
              <>
                Pomeni, da je trenutna cena nižja od prve, ki smo jo videli. Prva videna cena se
                nikoli ne prepiše, zato je padec razviden tudi čez več mesecev.
              </>
            ),
          },
          {
            naslov: "Statusi",
            besedilo: (
              <>
                <strong>Aktiven</strong> — bil je na oglasniku ob zadnjem pregledu.{" "}
                <strong>Izginil</strong> — ob zadnjem popolnem pregledu ga ni bilo več.{" "}
                <strong>Prodano</strong> — samo če je vir sam tako označil.
              </>
            ),
          },
          {
            naslov: "Kam gre naprej",
            besedilo: (
              <>
                Klik na vozilo odpre izvirni oglas pri viru — tako je vsako številko iz Analize trga
                mogoče preveriti. „Izvozi vse (CSV)“ da isto tabelo za Excel.
              </>
            ),
          },
        ]}
        omejitve={[
          <>
            <strong>Znamka se bere iz prve besede naslova.</strong> Zato sta „Land Rover“ in „Alfa
            Romeo“ v tabeli kot <code>Land</code> in <code>Alfa</code>.
          </>,
          <>
            <strong>Prazno polje pomeni, da podatka ni bilo</strong>, ne da je vrednost nič. Ničesar
            ne ugibamo — če prodajalec česa ni objavil, ostane prazno.
          </>,
          <>
            Tabela kaže <strong>zadnje znano stanje</strong>. Zgodovina cen je shranjena ločeno kot
            posnetki ob vsakem pregledu in se vidi v Analizi trga.
          </>,
        ]}
      />

      <form className="mt-6">
        <FiltriVozilForm znamkeModeli={znamkeModeli} privzeto={filtri} />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Status</span>
            <select
              name="status"
              defaultValue={status}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              {STATUSI.map((s) => (
                <option key={s.kljuc} value={s.kljuc}>
                  {s.oznaka}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            <Search className="h-4 w-4" />
            Iskanje vozil
          </button>
          {(aktivnihFiltrov > 0 || status) && (
            <Link
              href="/avtonet/baza"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
            >
              Počisti {aktivnihFiltrov > 0 ? `(${aktivnihFiltrov})` : ""}
            </Link>
          )}
        </div>
      </form>

      {error ? (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          Baze ni bilo mogoče prebrati: {error.message}
        </p>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-500">
              {skupaj.toLocaleString("sl-SI")} oglasov
              {(aktivnihFiltrov > 0 || status) && " po izbranih pogojih"} · stran {stran} od{" "}
              {zadnjaStran}
            </p>
            <RazvrstiIzbira />
          </div>

          <div className="mt-3 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Vozilo</th>
                  <th className="px-4 py-3 font-semibold">Letnik</th>
                  <th className="px-4 py-3 font-semibold">Km</th>
                  <th className="px-4 py-3 font-semibold">Moč</th>
                  <th className="px-4 py-3 font-semibold">Cena</th>
                  <th className="px-4 py-3 font-semibold">Prodajalec</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Prvič viden</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {vrstice.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-zinc-500">
                      Ni oglasov po teh pogojih.
                    </td>
                  </tr>
                ) : (
                  vrstice.map((o) => {
                    const znizano =
                      o.cena_prvotna_eur !== null &&
                      o.cena_eur !== null &&
                      Number(o.cena_eur) < Number(o.cena_prvotna_eur);
                    return (
                      <tr key={o.id} className="align-top transition hover:bg-zinc-50">
                        <td className="max-w-[24rem] px-4 py-3">
                          {/* Our own page first: it shows everything collected,
                              which the source's page cannot (price history,
                              time on the board). The original is one click on. */}
                          <Link
                            href={`/avtonet/oglas/${o.avtonet_id}`}
                            className="font-medium text-zinc-900 hover:text-accent"
                          >
                            <span className="line-clamp-2">{o.naziv ?? o.avtonet_id}</span>
                          </Link>
                          <p className="mt-0.5 text-[11px] text-zinc-400">
                            {[o.gorivo, o.menjalnik, o.lokacija].filter(Boolean).join(" · ") || "—"}
                            {o.detajl_zajet === null && " · podrobnosti še ne zajete"}
                            {" · "}
                            <a
                              href={o.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-zinc-400 hover:text-zinc-700"
                            >
                              original <ExternalLink className="h-3 w-3" />
                            </a>
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-zinc-600">
                          {o.letnik ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-zinc-600">
                          {o.km === null ? "—" : o.km.toLocaleString("sl-SI")}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-zinc-600">
                          {o.km_moci === null ? "—" : `${o.km_moci} KM`}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="font-semibold text-zinc-900">{eur(o.cena_eur)}</span>
                          {znizano && (
                            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-600">
                              <TrendingDown className="h-3 w-3" />
                              <span className="line-through">{eur(o.cena_prvotna_eur)}</span>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-500">
                          {o.je_dealer === true
                            ? (o.prodajalec_naziv ?? "avtohiša")
                            : o.je_dealer === false
                              ? (o.prodajalec_naziv ?? "fizična oseba")
                              : "ni znan"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              o.status === "aktiven"
                                ? "bg-emerald-50 text-emerald-600"
                                : o.status === "prodano"
                                  ? "bg-blue-50 text-blue-600"
                                  : "bg-zinc-100 text-zinc-600"
                            }`}
                          >
                            {o.status === "aktiven"
                              ? "Aktiven"
                              : o.status === "prodano"
                                ? "Prodano"
                                : "Izginil"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                          {new Date(o.first_seen).toLocaleString("sl-SI", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {zadnjaStran > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              {stran > 1 ? (
                <Link
                  href={povezava(stran - 1)}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  ← Prejšnja
                </Link>
              ) : (
                <span />
              )}
              <span className="text-xs text-zinc-400">
                {stran} / {zadnjaStran}
              </span>
              {stran < zadnjaStran ? (
                <Link
                  href={povezava(stran + 1)}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  Naslednja →
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}

          <p className="mt-5 text-xs text-zinc-400">
            „Izginil&ldquo; pomeni, da oglasa ob zadnjem popolnem pregledu ni bilo več — ne pomeni, da
            je bil prodan. Kot prodano šteje samo tisto, kar vir izrecno označi.
          </p>
        </>
      )}
    </div>
  );
}
