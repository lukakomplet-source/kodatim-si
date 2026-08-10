import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, Info, Terminal } from "lucide-react";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { createAdminClient } from "@/lib/supabase/admin";
import { eur, trajanje } from "@/lib/avtonet/analiza";
import { RaziskavaOrodja } from "./RaziskavaOrodja";

/**
 * One research, opened up: what it did, what it saw, and what it wrote.
 *
 * The listings come from the snapshots that carry this research's id, so the
 * page shows what this run actually touched rather than everything in the
 * database that happens to look recent.
 */

export const dynamic = "force-dynamic";

const STATUS_OZNAKE: Record<string, { oznaka: string; stil: string }> = {
  zahtevano: { oznaka: "Čaka", stil: "bg-blue-50 text-blue-600" },
  tece: { oznaka: "V teku", stil: "bg-amber-50 text-amber-700" },
  koncano: { oznaka: "Končano", stil: "bg-emerald-50 text-emerald-700" },
  napaka: { oznaka: "Napaka", stil: "bg-red-50 text-red-600" },
  preklicano: { oznaka: "Preklicano", stil: "bg-zinc-100 text-zinc-600" },
};

type Raziskava = {
  id: string;
  status: string;
  faza: number;
  zahtevano_ob: string;
  zacetek: string | null;
  konec: string | null;
  strani_pregledanih: number;
  oglasov_najdenih: number;
  novih: number;
  posodobljenih: number;
  spremembe_cen: number;
  izginulih: number;
  detajlov_obdelanih: number;
  detajlov_skupaj: number;
  napak: number;
  zadnja_stran: number;
  zadnja_napaka: string | null;
  pregled_popoln: boolean;
};

export default async function RaziskavaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa(`/avtonet/raziskava/${id}`));
  if (!dostop.jeAdmin) redirect("/avtonet");

  const db = createAdminClient();
  const { data, error } = await db.from("avtonet_raziskave").select("*").eq("id", id).maybeSingle();
  if (error?.code === "PGRST205" || !data) notFound();
  const r = data as unknown as Raziskava;

  // Which adverts this run touched, via the snapshots it wrote.
  const { data: posnetki } = await db
    .from("avtonet_posnetki")
    .select("oglas_id, cena_eur, zajeto")
    .eq("raziskava_id", id)
    .order("zajeto", { ascending: false })
    .limit(5000);

  const oglasIdji = [...new Set(((posnetki ?? []) as { oglas_id: string }[]).map((p) => p.oglas_id))];

  const { data: oglasi } = oglasIdji.length
    ? await db
        .from("avtonet_oglasi")
        .select("id, avtonet_id, naziv, letnik, km, km_moci, cena_eur, cena_prvotna_eur, status, url")
        .in("id", oglasIdji.slice(0, 500))
    : { data: [] };

  const { data: dogodki } = await db
    .from("avtonet_dogodki")
    .select("ob, vrsta, sporocilo")
    .eq("raziskava_id", id)
    .order("id", { ascending: false })
    .limit(200);

  const vrstice = (oglasi ?? []) as unknown as {
    id: string;
    avtonet_id: string;
    naziv: string | null;
    letnik: number | null;
    km: number | null;
    km_moci: number | null;
    cena_eur: number | null;
    cena_prvotna_eur: number | null;
    status: string;
    url: string;
  }[];

  const trajalo = trajanje(r.zacetek, r.konec);
  const oznaka = STATUS_OZNAKE[r.status] ?? { oznaka: r.status, stil: "bg-zinc-100 text-zinc-600" };

  return (
    <div>
      <Link
        href="/avtonet/pregled"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Research console
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold text-zinc-900 sm:text-3xl">
            Raziskava
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${oznaka.stil}`}>
              {oznaka.oznaka}
            </span>
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            Zahtevana{" "}
            {new Date(r.zahtevano_ob).toLocaleString("sl-SI", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · trajanje {trajalo} · <code className="text-xs">{r.id}</code>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {oglasIdji.length > 0 && (
            <a
              href={`/api/avtonet/izvoz?raziskava=${r.id}`}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
            >
              <Download className="h-4 w-4" />
              Izvozi v Excel (CSV)
            </a>
          )}
          <RaziskavaOrodja id={r.id} status={r.status} />
        </div>
      </header>

      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Strani" value={r.strani_pregledanih} />
        <Kpi label="Oglasov" value={r.oglasov_najdenih} />
        <Kpi label="Novih" value={r.novih} tone="emerald" />
        <Kpi label="Posodobljenih" value={r.posodobljenih} />
        <Kpi label="Sprememb cen" value={r.spremembe_cen} tone="amber" />
        <Kpi label="Napak" value={r.napak} tone={r.napak > 0 ? "red" : "zinc"} />
        <Kpi label="Podrobnosti" value={`${r.detajlov_obdelanih} / ${r.detajlov_skupaj}`} />
        <Kpi label="Izginulih" value={r.izginulih} />
        <Kpi label="Zadnja stran" value={r.zadnja_stran} />
        <Kpi label="Faza" value={r.faza} />
        <Kpi label="Pregled popoln" value={r.pregled_popoln ? "da" : "ne"} />
        <Kpi label="Oglasov v izvozu" value={oglasIdji.length} />
      </div>

      {!r.pregled_popoln && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Ta pregled ni dosegel konca seznama, zato se izginotja niso beležila. Odsotnost oglasa v tem
          pregledu ne pomeni, da ga ni več.
        </p>
      )}

      {r.zadnja_napaka && (
        <p className="mt-3 break-words rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {r.zadnja_napaka}
        </p>
      )}

      <section className="mt-9">
        <h2 className="text-lg font-semibold text-zinc-900">
          Oglasi, ki jih je zajela ({oglasIdji.length.toLocaleString("sl-SI")})
        </h2>
        {vrstice.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-zinc-200 bg-white px-5 py-8 text-sm text-zinc-500">
            Za to raziskavo ni povezanih oglasov. Posnetki so bili zajeti, preden je bila povezava med
            posnetkom in raziskavo dodana — novejše raziskave jih bodo imele.
          </p>
        ) : (
          <>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Vozilo</th>
                    <th className="px-4 py-3 font-semibold">Letnik</th>
                    <th className="px-4 py-3 font-semibold">Km</th>
                    <th className="px-4 py-3 font-semibold">Moč</th>
                    <th className="px-4 py-3 font-semibold">Cena</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {vrstice.map((o) => (
                    <tr key={o.id} className="transition hover:bg-zinc-50">
                      <td className="max-w-[26rem] px-4 py-3">
                        <a
                          href={o.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-start gap-1.5 font-medium text-zinc-900 hover:text-accent"
                        >
                          <span className="line-clamp-2">{o.naziv ?? o.avtonet_id}</span>
                          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-300" />
                        </a>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-zinc-600">{o.letnik ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums text-zinc-600">
                        {o.km === null ? "—" : o.km.toLocaleString("sl-SI")}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-zinc-600">
                        {o.km_moci === null ? "—" : `${o.km_moci} KM`}
                      </td>
                      <td className="px-4 py-3 font-semibold text-zinc-900">{eur(o.cena_eur)}</td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {oglasIdji.length > vrstice.length && (
              <p className="mt-2 text-xs text-zinc-400">
                Prikazanih prvih {vrstice.length} od {oglasIdji.length.toLocaleString("sl-SI")}. Celoten
                nabor je v izvozu.
              </p>
            )}
          </>
        )}
      </section>

      <section className="mt-9">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
          <Terminal className="h-5 w-5 text-accent" />
          Dnevnik (zadnjih {(dogodki ?? []).length})
        </h2>
        <div className="mt-3 max-h-96 overflow-y-auto rounded-2xl bg-zinc-950 px-4 py-3 font-mono text-[12px] leading-relaxed">
          {(dogodki ?? []).length === 0 ? (
            <p className="text-zinc-500">Dnevnik za to raziskavo je prazen ali že počiščen.</p>
          ) : (
            ((dogodki ?? []) as { ob: string; vrsta: string; sporocilo: string }[])
              .slice()
              .reverse()
              .map((d, i) => (
                <p key={`${d.ob}-${i}`} className="whitespace-pre-wrap break-words">
                  <span className="text-zinc-600">{new Date(d.ob).toLocaleTimeString("sl-SI")}</span>{" "}
                  <span className={d.vrsta === "napaka" ? "text-red-300" : "text-zinc-300"}>
                    {d.sporocilo}
                  </span>
                </p>
              ))
          )}
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone = "zinc",
}: {
  label: string;
  value: number | string;
  tone?: "zinc" | "emerald" | "amber" | "red";
}) {
  const color = {
    zinc: "text-zinc-900",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-600",
  }[tone];
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>
        {typeof value === "number" ? value.toLocaleString("sl-SI") : value}
      </p>
    </div>
  );
}
