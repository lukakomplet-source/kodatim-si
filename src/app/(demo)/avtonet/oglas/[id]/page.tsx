import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { oznakaZnacilke } from "@/lib/avtonet/cenilnik/vozilo";

/**
 * One advert, in full.
 *
 * The point of the detail pass is that we hold far more about a car than a
 * price and a model, and until now none of it was visible anywhere. This shows
 * everything we actually collected — grouped the way the source groups it — plus
 * the one thing the source cannot show: what happened to this advert over time.
 *
 * Raw JSON is deliberately not the main view. It sits at the bottom, folded
 * away, for when somebody needs to check a value against the source.
 */

export const dynamic = "force-dynamic";

const KATEGORIJE: { kljuc: string; oznaka: string }[] = [
  { kljuc: "varnost", oznaka: "Varnost in asistenca" },
  { kljuc: "udobje", oznaka: "Udobje" },
  { kljuc: "multimedia", oznaka: "Multimedia" },
  { kljuc: "notranjost", oznaka: "Notranjost" },
  { kljuc: "uporabnost", oznaka: "Uporabnost in parkiranje" },
  { kljuc: "podvozje", oznaka: "Podvozje in pogon" },
  { kljuc: "stanje", oznaka: "Stanje in zgodovina" },
  { kljuc: "ostalo", oznaka: "Ostalo" },
];

const eur = (v: unknown) =>
  v === null || v === undefined ? "—" : `${Math.round(Number(v)).toLocaleString("sl-SI")} €`;

const dat = (v: unknown) =>
  !v ? "—" : new Date(String(v)).toLocaleDateString("sl-SI", { day: "numeric", month: "long", year: "numeric" });

export default async function OglasPage({ params }: { params: Promise<{ id: string }> }) {
  const dostop = await preberiDostop();
  const { id } = await params;
  if (!dostop.jeUporabnik) redirect(prijavaZa(`/avtonet/oglas/${id}`));

  const db = createAvtonetClient();
  const { data, error } = await db.from("avtonet_oglasi").select("*").eq("avtonet_id", id).maybeSingle();

  if (error && error.code !== "PGRST116") {
    return (
      <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
        Napaka pri branju oglasa: {error.message}
      </p>
    );
  }
  if (!data) notFound();

  const o = data as unknown as Record<string, unknown>;

  const { data: posnetkiRaw } = await db
    .from("avtonet_posnetki")
    .select("zajeto, cena_eur, km, status, razlog")
    .eq("oglas_id", o.id as string)
    .order("zajeto", { ascending: true })
    .limit(200);
  const posnetki = (posnetkiRaw ?? []) as unknown as Record<string, unknown>[];

  const kategorije = (o.oprema_kategorije ?? null) as Record<string, string[]> | null;
  const znacilke = (o.oprema_znacilke ?? []) as string[];
  const dodatni = (o.dodatni_podatki ?? null) as Record<string, string> | null;

  const dniNaTrgu =
    o.status_spremenjen && o.first_seen
      ? Math.round(
          (new Date(String(o.status_spremenjen)).getTime() - new Date(String(o.first_seen)).getTime()) /
            86_400_000
        )
      : null;

  return (
    <div>
      <Link
        href="/avtonet/baza"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Nazaj na bazo
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {[o.znamka, o.model].filter(Boolean).join(" ") || String(o.avtonet_id)}
          </h1>
          <p className="mt-0.5 text-sm text-zinc-600">{(o.verzija as string) ?? (o.naziv as string) ?? ""}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
            {o.cena_na_poziv ? "Cena na poziv" : eur(o.cena_eur)}
          </p>
          {o.cena_prvotna_eur !== null &&
            o.cena_eur !== null &&
            Number(o.cena_prvotna_eur) !== Number(o.cena_eur) && (
              <p className="mt-0.5 text-sm text-zinc-500">
                Prvotna cena: {eur(o.cena_prvotna_eur)} — spremenjena za{" "}
                {eur(Number(o.cena_eur) - Number(o.cena_prvotna_eur))}
              </p>
            )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <Status status={String(o.status)} dni={dniNaTrgu} />
          <a
            href={String(o.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3.5 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Odpri originalni oglas <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      {/* Galerija: slike ostajajo PRI VIRU (prikaz s sklicem, ne kopija) —
          zato ni ne prostora ne vprašanja avtorskih pravic. Če vir sliko
          umakne, se ne prikaže; povezava na izvirnik je tik ob njej. */}
      {Array.isArray(o.slike_urls) && o.slike_urls.length > 0 && (
        <section className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-900">Slike ({o.slike_urls.length})</h2>
            <p className="text-xs text-zinc-400">Slike so pri viru; klik odpre izvirnik v novem oknu.</p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {(o.slike_urls as string[]).map((src, i) => (
              <a
                key={src}
                href={typeof o.url === "string" && o.url ? o.url : src}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`${o.znamka ?? ""} ${o.model ?? ""} — slika ${i + 1}`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="aspect-[4/3] w-full object-cover transition group-hover:brightness-105"
                />
              </a>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Kartica naslov="Osnovni podatki">
            <Mreza
              vnosi={[
                ["Znamka", o.znamka],
                ["Model", o.model],
                ["Verzija", o.verzija],
                ["Letnik", o.letnik],
                ["Leto proizvodnje", o.leto_proizvodnje],
                ["Prva registracija", o.registracija_mesec ? `${o.letnik} / ${o.registracija_mesec}` : o.letnik],
                ["Kilometri", o.km === null ? null : `${Number(o.km).toLocaleString("sl-SI")} km`],
                ["Lastnikov", o.lastnikov],
                ["Starost", o.starost],
              ]}
            />
          </Kartica>

          <Kartica naslov="Motor in pogon">
            <Mreza
              vnosi={[
                ["Gorivo", o.gorivo],
                ["Pogonski sklop", o.pogonski_sklop],
                ["Moč", o.kw === null ? null : `${o.kw} kW${o.km_moci ? ` / ${o.km_moci} KM` : ""}`],
                ["Prostornina", o.ccm === null ? null : `${Number(o.ccm).toLocaleString("sl-SI")} ccm`],
                ["Menjalnik", o.menjalnik],
                ["Pogon", o.pogon],
                ["Poraba", o.poraba_l_100km === null ? null : `${o.poraba_l_100km} l / 100 km`],
                ["Emisijski razred", o.emisijski_razred],
                ["CO₂", o.co2_g_km === null ? null : `${o.co2_g_km} g / km`],
              ]}
            />
          </Kartica>

          <Kartica naslov="Karoserija in notranjost">
            <Mreza
              vnosi={[
                ["Oblika", o.karoserija],
                ["Barva", o.barva],
                ["Notranjost", o.notranjost],
                ["Število vrat", o.stevilo_vrat],
                ["Število sedežev", o.stevilo_sedezev],
              ]}
            />
          </Kartica>

          {/* Equipment, grouped as avto.net groups it. */}
          {kategorije && Object.keys(kategorije).length > 0 ? (
            <Kartica naslov="Oprema">
              <div className="space-y-4">
                {KATEGORIJE.filter((k) => (kategorije[k.kljuc] ?? []).length > 0).map((k) => (
                  <div key={k.kljuc}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{k.oznaka}</p>
                    <ul className="mt-1.5 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                      {(kategorije[k.kljuc] ?? []).map((v, i) => (
                        <li key={i} className="text-sm text-zinc-700">
                          {v}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Kartica>
          ) : o.oprema ? (
            <Kartica naslov="Oprema">
              <p className="text-sm leading-relaxed text-zinc-700">{String(o.oprema)}</p>
              <p className="mt-2 text-xs text-zinc-500">
                Ta oglas je bil zajet s starejšim razčlenjevalnikom, zato oprema še ni razvrščena po
                kategorijah. Ob naslednjem krogu raziskave se dopolni samodejno.
              </p>
            </Kartica>
          ) : null}

          {o.opis ? (
            <Kartica naslov="Opis prodajalca">
              <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-700">{String(o.opis)}</p>
            </Kartica>
          ) : null}
        </div>

        <div className="space-y-6">
          <Kartica naslov="Prodajalec">
            <Mreza
              vnosi={[
                ["Naziv", o.prodajalec_naziv],
                ["Vrsta", o.je_dealer === null ? null : o.je_dealer ? "Trgovec" : "Fizična oseba"],
                ["Lokacija", o.lokacija],
                ["Naslov", o.prodajalec_naslov],
                ["Registriran od", o.prodajalec_registriran_od],
              ]}
              enaKolona
            />
          </Kartica>

          <Kartica naslov="Zgodovina oglasa">
            <Mreza
              vnosi={[
                ["Prvič opažen", dat(o.first_seen)],
                ["Zadnjič opažen", dat(o.last_seen)],
                ["Status", o.status],
                ["Status spremenjen", o.status_spremenjen ? dat(o.status_spremenjen) : null],
                ["Dni na oglasniku", dniNaTrgu],
                ["Podrobnosti zajete", o.detajl_zajet ? dat(o.detajl_zajet) : null],
              ]}
              enaKolona
            />

            {posnetki.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Spremembe</p>
                <ul className="mt-2 space-y-1.5">
                  {posnetki.map((p, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-zinc-500">{dat(p.zajeto)}</span>
                      <span className="text-right">
                        <span className="font-medium tabular-nums text-zinc-900">{eur(p.cena_eur)}</span>
                        {p.razlog ? (
                          <span className="ml-2 text-xs text-zinc-400">{String(p.razlog)}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-zinc-500">
                  Posnetek nastane ob spremembi cene, kilometrov ali statusa — ne ob vsakem pregledu.
                </p>
              </div>
            )}
          </Kartica>

          {znacilke.length > 0 && (
            <Kartica naslov={`Značke opreme (${znacilke.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {znacilke.map((z) => (
                  <span key={z} className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-700">
                    {oznakaZnacilke(z)}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Po teh značkah primerjalnik išče podobna vozila.
              </p>
            </Kartica>
          )}

          {dodatni && Object.keys(dodatni).length > 0 && (
            <details className="rounded-2xl border border-zinc-200 bg-white shadow-sm [&_summary::-webkit-details-marker]:hidden">
              <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-zinc-900">
                Surovi podatki z oglasa
              </summary>
              <div className="border-t border-zinc-100 px-5 py-4">
                <Mreza vnosi={Object.entries(dodatni).map(([k, v]) => [k, v])} enaKolona />
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

function Status({ status, dni }: { status: string; dni: number | null }) {
  const barva =
    status === "aktiven"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "prodano"
        ? "bg-blue-50 text-blue-700 ring-blue-200"
        : "bg-zinc-100 text-zinc-600 ring-zinc-200";
  const besedilo =
    status === "aktiven"
      ? "Aktiven"
      : status === "prodano"
        ? "Vir ga je označil kot prodanega"
        : `Ni več na oglasniku${dni !== null ? ` — po ${dni} dneh` : ""}`;
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${barva}`}>{besedilo}</span>;
}

function Kartica({ naslov, children }: { naslov: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">{naslov}</h2>
      {children}
    </section>
  );
}

function Mreza({ vnosi, enaKolona = false }: { vnosi: [string, unknown][]; enaKolona?: boolean }) {
  // Empty fields are shown, not hidden. "ni podatka" is information — it says
  // the source did not publish it, which is different from us not having looked.
  return (
    <dl className={`grid gap-x-6 gap-y-1 text-sm ${enaKolona ? "" : "sm:grid-cols-2"}`}>
      {vnosi.map(([oznaka, vrednost]) => (
        <div key={oznaka} className="flex justify-between gap-3 border-b border-zinc-100 py-1 last:border-0">
          <dt className="shrink-0 text-zinc-500">{oznaka}</dt>
          <dd
            className={`text-right ${
              vrednost === null || vrednost === undefined || vrednost === ""
                ? "text-zinc-400"
                : "font-medium text-zinc-900"
            }`}
          >
            {vrednost === null || vrednost === undefined || vrednost === ""
              ? "ni podatka"
              : String(vrednost)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
