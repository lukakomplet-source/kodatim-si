import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Building2, ExternalLink, TrendingDown } from "lucide-react";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { potrdiZdruzitevForm, zavrniZdruzitevForm } from "../../actions";
import { NepNav } from "../../NepNav";

/**
 * Detajl oglasa: VSE, kar o njem vemo — brez skrivanja. Graf cen iz nep_cene,
 * dnevnik sprememb iz nep_spremembe, kanonična nepremičnina s povezanimi
 * oglasi (ponovne objave, drugi viri) in čakalnica kandidatov za združitev.
 * Slike so pri viru (use=reference) — velik gumb na izvirnik.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Oglas — SBN Nepremičnine" };

type Oglas = {
  id: string;
  vir: string;
  url: string;
  naslov: string | null;
  tip: string | null;
  podtip: string | null;
  posel: string;
  regija: string | null;
  kraj: string | null;
  cena_eur: number | null;
  cena_prvotna_eur: number | null;
  cena_m2_eur: number | null;
  povrsina_m2: number | null;
  zemljisce_m2: number | null;
  leto_izgradnje: number | null;
  leto_adaptacije: number | null;
  nadstropje: string | null;
  vec_enot: boolean;
  st_enot: number | null;
  st_enot_ocena: number | null;
  locene_kuhinje: boolean | null;
  loceni_vhodi: boolean | null;
  za_obnovo: boolean;
  za_investicijo: boolean;
  opis: string | null;
  prodajalec: string | null;
  agencija: string | null;
  telefon: string | null;
  st_slik: number | null;
  slike_urls: string[] | null;
  detajl_zajet: string | null;
  st_sob: number | null;
  st_spalnic: number | null;
  st_kopalnic: number | null;
  energetski_razred: string | null;
  ogrevanje: string | null;
  stanje: string | null;
  opremljenost: string | null;
  lastnistvo: string | null;
  parkirno: string | null;
  balkon: boolean | null;
  terasa: boolean | null;
  vrt: boolean | null;
  klet: boolean | null;
  dvigalo: boolean | null;
  etaznost: string | null;
  sifra_oglasa: string | null;
  datum_objave: string | null;
  posrednik: string | null;
  detajl_raw: Record<string, string> | null;
  lat: number | null;
  lng: number | null;
  lokacija_natancnost: string | null;
  first_seen: string;
  last_seen: string;
  status: string;
  nepremicnina_id: string | null;
  data_quality: number | null;
  raw: Record<string, unknown> | null;
};

const eur = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${Math.round(Number(v)).toLocaleString("sl-SI")} €`;
const datum = (v: string) => new Date(v).toLocaleDateString("sl-SI");

/** Zunaj komponente, ker je render čist; strežniška funkcija sme brati uro. */
function odcitekUre(): number {
  return Date.now();
}

type Nepremicnina = {
  id: string;
  prva_videna: string;
  st_oglasov: number;
  st_virov: number;
  ponovno_objavljena: boolean;
  aktivna: boolean;
  najnizja_cena_eur: number | null;
  najvisja_cena_eur: number | null;
};

function GrafCen({ tocke }: { tocke: { ob: string; cena: number }[] }) {
  if (tocke.length < 2) {
    return <p className="text-xs text-zinc-400">Cena se od prvega ogleda ni spremenila — graf pride z drugo točko.</p>;
  }
  const S = 36;
  const W = 640;
  const H = 150;
  const casi = tocke.map((t) => new Date(t.ob).getTime());
  const cene = tocke.map((t) => t.cena);
  const minC = Math.min(...casi);
  const maxC = Math.max(...casi);
  const minV = Math.min(...cene);
  const maxV = Math.max(...cene);
  const x = (c: number) => (maxC === minC ? W / 2 : S + ((c - minC) / (maxC - minC)) * (W - 2 * S));
  const y = (v: number) => (maxV === minV ? H / 2 : H - S - ((v - minV) / (maxV - minV)) * (H - 2 * S));
  const pot = tocke.map((t, i) => `${i === 0 ? "M" : "L"}${x(new Date(t.ob).getTime()).toFixed(1)},${y(t.cena).toFixed(1)}`).join(" ");
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[420px]">
        <path d={pot} fill="none" strokeWidth={2} className="stroke-accent" />
        {tocke.map((t, i) => {
          const px = x(new Date(t.ob).getTime());
          const py = y(t.cena);
          return (
            <g key={i}>
              <circle cx={px} cy={py} r={3.5} className="fill-accent" />
              <text x={px} y={py - 8} textAnchor="middle" className="fill-zinc-500 text-[10px]">
                {Math.round(t.cena / 1000)}k
              </text>
              <text x={px} y={H - 10} textAnchor="middle" className="fill-zinc-400 text-[9px]">
                {datum(t.ob)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Kartica({ naslov, children }: { naslov: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-zinc-900">{naslov}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Mreza({ vnosi }: { vnosi: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
      {vnosi.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <dt className="text-zinc-400">{k}</dt>
          <dd className="text-right font-medium text-zinc-800">{v ?? "ni podatka"}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function OglasPage({ params }: { params: Promise<{ id: string }> }) {
  const dostop = await preberiDostop();
  const { id } = await params;
  // id gre tudi v PostgREST .or() niz — vse, kar ni uuid, odleti takoj.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  if (!dostop.jeUporabnik) redirect(prijavaZa(`/nepremicnine/oglas/${id}`));

  const db = createAvtonetClient();
  const { data } = await db.from("nep_oglasi").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const o = data as unknown as Oglas;

  const [{ data: cene }, { data: spremembe }] = await Promise.all([
    db.from("nep_cene").select("cena_eur, ob").eq("oglas_id", id).order("ob"),
    db.from("nep_spremembe").select("id, ob, tip, staro, novo").eq("oglas_id", id).order("ob", { ascending: false }).limit(60),
  ]);

  let nepremicnina: Nepremicnina | null = null;
  let sorodni: { id: string; vir: string; url: string; naslov: string | null; cena_eur: number | null; status: string; first_seen: string; last_seen: string }[] = [];
  let kandidati: { id: number; confidence: number; signali: { razlogi?: string[] } | null; oglas_id: string; drugi: { id: string; naslov: string | null; kraj: string | null; cena_eur: number | null; url: string } | null }[] = [];

  if (o.nepremicnina_id) {
    const [{ data: n }, { data: s }, { data: k }] = await Promise.all([
      db.from("nep_nepremicnine").select("id, prva_videna, st_oglasov, st_virov, ponovno_objavljena, aktivna, najnizja_cena_eur, najvisja_cena_eur").eq("id", o.nepremicnina_id).maybeSingle(),
      db.from("nep_oglasi").select("id, vir, url, naslov, cena_eur, status, first_seen, last_seen").eq("nepremicnina_id", o.nepremicnina_id).neq("id", id).order("first_seen"),
      db.from("nep_zdruzitve").select("id, confidence, signali, oglas_id, nepremicnina_id").eq("nacin", "kandidat").or(`oglas_id.eq.${id},nepremicnina_id.eq.${o.nepremicnina_id}`),
    ]);
    nepremicnina = (n as Nepremicnina | null) ?? null;
    sorodni = (s ?? []) as typeof sorodni;

    const kandidatVrstice = (k ?? []) as { id: number; confidence: number; signali: { razlogi?: string[]; star_oglas?: string } | null; oglas_id: string }[];
    kandidati = await Promise.all(
      kandidatVrstice.map(async (kv) => {
        const drugiId = kv.oglas_id === id ? (kv.signali?.star_oglas ?? null) : kv.oglas_id;
        const { data: drugi } = drugiId
          ? await db.from("nep_oglasi").select("id, naslov, kraj, cena_eur, url").eq("id", drugiId).maybeSingle()
          : { data: null };
        return { ...kv, drugi: (drugi as { id: string; naslov: string | null; kraj: string | null; cena_eur: number | null; url: string } | null) ?? null };
      })
    );
  }

  const znizana = o.cena_prvotna_eur !== null && o.cena_eur !== null && Number(o.cena_eur) < Number(o.cena_prvotna_eur);
  const dni = Math.max(0, Math.floor((odcitekUre() - new Date(nepremicnina?.prva_videna ?? o.first_seen).getTime()) / 86_400_000));
  const tockeGrafa = (cene ?? []).map((c) => ({ ob: c.ob as string, cena: Number(c.cena_eur) }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/nepremicnine" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-accent">
        <ArrowLeft className="h-4 w-4" />
        Nazaj na iskanje
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-zinc-900">
            <Building2 className="h-7 w-7 shrink-0 text-accent" />
            <span className="min-w-0">{o.naslov ?? o.kraj ?? "Oglas"}</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {[o.kraj, o.regija, o.vir].filter(Boolean).join(" · ")} ·{" "}
            <span className={o.status === "aktiven" ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>
              {o.status === "aktiven" ? "aktiven" : "izginil"}
            </span>{" "}
            · na trgu {dni} dni
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-zinc-900">{eur(o.cena_eur)}</p>
          {znizana && (
            <p className="flex items-center justify-end gap-1 text-sm font-semibold text-emerald-600">
              <TrendingDown className="h-4 w-4" />
              <span className="text-zinc-400 line-through">{eur(o.cena_prvotna_eur)}</span>
            </p>
          )}
          {o.cena_m2_eur !== null && <p className="text-xs text-zinc-400">{eur(o.cena_m2_eur)}/m²</p>}
        </div>
      </div>

      <NepNav aktiven="/nepremicnine" jeAdmin={dostop.jeAdmin} />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Kartica naslov="Osnovni podatki">
            <Mreza
              vnosi={[
                ["Tip", o.tip ? `${o.tip}${o.podtip ? ` · ${o.podtip}` : ""}` : null],
                ["Posel", o.posel],
                ["Površina", o.povrsina_m2 !== null ? `${o.povrsina_m2} m²` : null],
                ["Zemljišče", o.zemljisce_m2 !== null ? `${o.zemljisce_m2} m²` : null],
                ["Zgrajeno", o.leto_izgradnje],
                ["Adaptirano", o.leto_adaptacije],
                ["Etažnost", o.nadstropje],
                ["Enot potrjeno", o.st_enot],
                ["Enot (možnost)", o.st_enot_ocena !== null ? `~${o.st_enot_ocena}` : null],
                ["Ločene kuhinje", o.locene_kuhinje === null ? null : o.locene_kuhinje ? "da" : "ne"],
                ["Ločeni vhodi", o.loceni_vhodi === null ? null : o.loceni_vhodi ? "da" : "ne"],
                ["Za obnovo", o.za_obnovo ? "da" : "ne"],
                ["Investicijska značka", o.za_investicijo ? "da" : "ne"],
                ["Št. slik pri viru", o.st_slik],
                ["Kakovost podatkov", o.data_quality !== null ? `${o.data_quality}/100` : null],
                ["Lokacija", o.lat !== null ? `${o.lat?.toFixed(4)}, ${o.lng?.toFixed(4)} (${o.lokacija_natancnost === "naslov" ? "naslov" : "približno — centroid kraja"})` : null],
              ]}
            />
          </Kartica>

          {/* Kar je samo na oglasni strani in ne na kartici seznama. Kartica se
              pokaže šele, ko je 2. faza ta oglas res obiskala — prazna tabela
              polj bi izgledala kot okvara, ne kot "še ni na vrsti". */}
          {o.detajl_zajet && (
            <Kartica naslov="Podrobnosti z oglasne strani">
              <Mreza
                vnosi={[
                  ["Sob", o.st_sob],
                  ["Spalnic", o.st_spalnic],
                  ["Kopalnic", o.st_kopalnic],
                  ["Energetska izkaznica", o.energetski_razred],
                  ["Ogrevanje", o.ogrevanje],
                  ["Stanje", o.stanje],
                  ["Opremljenost", o.opremljenost],
                  ["Lastništvo", o.lastnistvo],
                  ["Parkirno", o.parkirno],
                  ["Etažnost", o.etaznost],
                  ["Balkon", o.balkon === null ? null : o.balkon ? "da" : "ne"],
                  ["Terasa", o.terasa === null ? null : o.terasa ? "da" : "ne"],
                  ["Vrt / atrij", o.vrt === null ? null : o.vrt ? "da" : "ne"],
                  ["Klet / shramba", o.klet === null ? null : o.klet ? "da" : "ne"],
                  ["Dvigalo", o.dvigalo === null ? null : o.dvigalo ? "da" : "ne"],
                  ["Šifra oglasa", o.sifra_oglasa],
                  ["Objavljen", o.datum_objave ? new Date(o.datum_objave).toLocaleDateString("sl-SI") : null],
                  ["Posrednik", o.posrednik],
                ]}
              />
              <p className="mt-3 text-[11px] text-zinc-400">
                Zajeto {new Date(o.detajl_zajet).toLocaleString("sl-SI")}. Prazno polje pomeni, da ga vir ne navaja —
                ničesar ne ugibamo iz opisa.
              </p>
              {o.detajl_raw && Object.keys(o.detajl_raw).length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-800">
                    Vse lastnosti, kot jih navaja vir ({Object.keys(o.detajl_raw).length})
                  </summary>
                  <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                    {Object.entries(o.detajl_raw).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3">
                        <dt className="text-zinc-400">{k}</dt>
                        <dd className="text-right text-zinc-700">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </Kartica>
          )}

          {/* Galerija: slike ostajajo PRI VIRU (prikaz s sklicem, ne kopija) —
              zato ni ne prostora ne vprašanja avtorskih pravic. Če vir sliko
              umakne, se ne prikaže; klik odpre izvirni oglas. */}
          {Array.isArray(o.slike_urls) && o.slike_urls.length > 0 && (
            <Kartica naslov={`Slike (${o.slike_urls.length})`}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {o.slike_urls.map((src, i) => (
                  <a
                    key={src}
                    href={o.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`${o.naslov ?? o.kraj ?? "Oglas"} — slika ${i + 1}`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="aspect-[4/3] w-full object-cover transition group-hover:brightness-105"
                    />
                  </a>
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-400">
                Slike so pri viru in se od tam tudi naložijo — kopij ne hranimo. Klik odpre izvirni oglas.
              </p>
            </Kartica>
          )}

          <Kartica naslov="Gibanje cene">
            <GrafCen tocke={tockeGrafa} />
            {tockeGrafa.length >= 2 && (
              <p className="mt-2 text-xs text-zinc-500">
                Prva zabeležena: {eur(tockeGrafa[0].cena)} ({datum(tockeGrafa[0].ob)}) · zadnja: {eur(tockeGrafa[tockeGrafa.length - 1].cena)} (
                {datum(tockeGrafa[tockeGrafa.length - 1].ob)})
              </p>
            )}
          </Kartica>

          <Kartica naslov="Dnevnik sprememb">
            {(spremembe ?? []).length === 0 ? (
              <p className="text-xs text-zinc-400">Ni zabeleženih sprememb — oglas je tak, kot je bil ob prvem ogledu.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {(spremembe ?? []).map((s) => {
                  const st = s.staro as Record<string, unknown> | null;
                  const nv = s.novo as Record<string, unknown> | null;
                  const opis =
                    s.tip === "cena"
                      ? `cena ${eur(st?.cena_eur as number)} → ${eur(nv?.cena_eur as number)}`
                      : s.tip === "status"
                        ? `status: ${String(st?.status ?? st?.opomba ?? "?")} → ${String(nv?.status ?? "povezan")}${nv?.opomba ? ` (${nv.opomba})` : ""}`
                        : s.tip === "opis"
                          ? "spremenjen opis oglasa"
                          : s.tip === "povrsina"
                            ? `površina ${String(st?.povrsina_m2)} → ${String(nv?.povrsina_m2)} m²`
                            : s.tip === "zemljisce"
                              ? `zemljišče ${String(st?.zemljisce_m2)} → ${String(nv?.zemljisce_m2)} m²`
                              : s.tip;
                  return (
                    <li key={s.id} className="flex items-baseline justify-between gap-3">
                      <span className="text-zinc-700">{opis}</span>
                      <span className="shrink-0 text-xs text-zinc-400">{datum(s.ob as string)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Kartica>

          {o.opis && (
            <Kartica naslov="Opis pri viru">
              <p className="whitespace-pre-wrap text-sm text-zinc-600">{o.opis}</p>
            </Kartica>
          )}

          <details className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm">
            <summary className="cursor-pointer font-semibold text-zinc-900">Surova kartica z oglasa</summary>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600">{JSON.stringify(o.raw, null, 2)}</pre>
          </details>
        </div>

        <div className="space-y-5">
          <div className="flex flex-col gap-2">
            <a
              href={o.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
            >
              <ExternalLink className="h-4 w-4" />
              ODPRI OGLAS S SLIKAMI
            </a>
            <Link
              href={{ pathname: "/nepremicnine/kalkulator", query: { oglas: o.id } }}
              className="inline-flex items-center justify-center rounded-xl border-2 border-accent/40 px-4 py-3 text-sm font-bold text-accent transition hover:bg-accent/5"
            >
              ANALIZIRAJ V KALKULATORJU
            </Link>
          </div>

          <Kartica naslov="Prodajalec">
            <Mreza
              vnosi={[
                ["Vrsta", o.prodajalec],
                ["Agencija", o.agencija],
                ["Telefon", o.telefon ? <a key="t" href={`tel:${o.telefon.replace(/[^\d+]/g, "")}`} className="text-accent">{o.telefon}</a> : null],
              ]}
            />
          </Kartica>

          <Kartica naslov="Nepremičnina (kanonično)">
            {!nepremicnina ? (
              <p className="text-xs text-zinc-400">Oglas še ni povezan — povezovanje teče ob naslednjem pregledu.</p>
            ) : (
              <>
                <Mreza
                  vnosi={[
                    ["Prvič videna", datum(nepremicnina.prva_videna)],
                    ["Oglasov", nepremicnina.st_oglasov],
                    ["Virov", nepremicnina.st_virov],
                    ["Ponovno objavljena", nepremicnina.ponovno_objavljena ? "da" : "ne"],
                    ["Najnižja opažena cena", eur(nepremicnina.najnizja_cena_eur)],
                    ["Najvišja opažena cena", eur(nepremicnina.najvisja_cena_eur)],
                  ]}
                />
                {sorodni.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-zinc-100 pt-3 text-sm">
                    {sorodni.map((s) => (
                      <li key={s.id} className="flex items-baseline justify-between gap-2">
                        <Link href={`/nepremicnine/oglas/${s.id}`} className="min-w-0 truncate text-accent hover:underline">
                          {s.naslov ?? s.vir} ({s.status})
                        </Link>
                        <span className="shrink-0 text-xs text-zinc-400">{eur(s.cena_eur)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Kartica>

          {kandidati.length > 0 && (
            <Kartica naslov="Morda ista nepremičnina (čakalnica)">
              <ul className="space-y-3 text-sm">
                {kandidati.map((k) => (
                  <li key={k.id} className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
                    <p className="font-medium text-zinc-800">
                      {k.drugi ? (
                        <Link href={`/nepremicnine/oglas/${k.drugi.id}`} className="text-accent hover:underline">
                          {k.drugi.naslov ?? k.drugi.kraj ?? "oglas"}
                        </Link>
                      ) : (
                        "oglas"
                      )}{" "}
                      · ujemanje {Math.round(Number(k.confidence))}/100
                    </p>
                    {k.signali?.razlogi && <p className="mt-1 text-xs text-zinc-500">{k.signali.razlogi.join(" · ")}</p>}
                    {dostop.jeAdmin && (
                      <div className="mt-2 flex gap-2">
                        <form action={potrdiZdruzitevForm.bind(null, k.id)}>
                          <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110">
                            Potrdi — ista
                          </button>
                        </form>
                        <form action={zavrniZdruzitevForm.bind(null, k.id)}>
                          <button className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
                            Zavrni
                          </button>
                        </form>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Kartica>
          )}
        </div>
      </div>
    </div>
  );
}
