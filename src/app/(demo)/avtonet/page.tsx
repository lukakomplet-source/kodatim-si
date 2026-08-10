import { createAdminClient } from "@/lib/supabase/admin";
import { Activity, Car, Clock, TrendingDown } from "lucide-react";
import { RelativeTime, WorkerHealth } from "./Freshness";

/**
 * SBN Auto — the client-facing dashboard for the avto.net market tracker.
 *
 * Reads the same tables the worker writes, so what is shown here is exactly
 * what has been collected — never a mock. Before the first collection run the
 * numbers are honestly zero and the page says why, rather than showing
 * invented figures that would have to be explained away later.
 */

export const metadata = { title: "SBN Auto — spremljanje trga vozil" };
export const revalidate = 60;

type Oglas = {
  id: string;
  naziv: string | null;
  znamka: string | null;
  letnik: number | null;
  km: number | null;
  cena_eur: number | null;
  cena_prvotna_eur: number | null;
  url: string;
  status: string;
  first_seen: string;
};

type Zdravje = {
  zadnji_zagon: string | null;
  zadnji_uspeh: string | null;
  zadnja_napaka: string | null;
  najdenih_zadnjic: number | null;
  novih_zadnjic: number | null;
};

function eur(value: number | null): string {
  return value === null ? "—" : `${Math.round(value).toLocaleString("sl-SI")} €`;
}

export default async function AvtonetPage() {
  const db = createAdminClient();

  const [oglasiRes, zdravjeRes] = await Promise.all([
    db.from("avtonet_oglasi").select("*").order("first_seen", { ascending: false }).limit(40),
    db.from("avtonet_zdravje").select("*").eq("id", "worker").maybeSingle(),
  ]);

  // PGRST205 = table missing. Say so, rather than render an empty dashboard
  // that reads as "the market has no cars in it".
  if (oglasiRes.error?.code === "PGRST205") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-3xl font-semibold text-zinc-900">SBN Auto</h1>
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Baza še ni pripravljena. V Supabase SQL Editorju poženite{" "}
          <code>supabase/migration_avtonet.sql</code>, nato osvežite to stran.
        </p>
      </main>
    );
  }

  const oglasi = (oglasiRes.data ?? []) as unknown as Oglas[];
  const zdravje = (zdravjeRes.data ?? null) as Zdravje | null;

  const aktivni = oglasi.filter((o) => o.status === "aktiven");
  const izginili = oglasi.filter((o) => o.status === "izginil");
  const prodani = oglasi.filter((o) => o.status === "prodano");
  const znizani = oglasi.filter(
    (o) => o.cena_prvotna_eur !== null && o.cena_eur !== null && o.cena_eur < o.cena_prvotna_eur
  );

  // "Never collected" and "collected, found nothing" are different situations
  // and the page must not blur them. Staleness itself is judged in the browser
  // (see Freshness.tsx) — it depends on "now", which a cached page cannot know.
  const nikoliZbrano = !zdravje?.zadnji_uspeh;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Demo · KodaTim</p>
          <h1 className="mt-1 flex items-center gap-2.5 text-3xl font-semibold text-zinc-900">
            <Car className="h-7 w-7 text-accent" />
            SBN Auto
          </h1>
          <p className="mt-2 max-w-2xl text-base text-zinc-500">
            Spremljanje oglasov na Avto.net: obvestila o novih vozilih po vaših filtrih in zgodovina
            trga, iz katere se vidi, kaj se prodaja hitro in po kakšni ceni.
          </p>
        </div>

        <WorkerHealth
          zadnjiUspeh={zdravje?.zadnji_uspeh ?? null}
          napaka={zdravje?.zadnja_napaka ?? null}
        />
      </header>

      {nikoliZbrano && (
        <p className="mt-6 rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
          Zbiralnik še ni opravil prvega kroga, zato so številke spodaj prazne. Statistika o hitrosti
          prodaje postane zanesljiva po nekaj tednih zbiranja — prej je vzorec premajhen, da bi iz
          njega karkoli sklepali.
        </p>
      )}

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile icon={<Car className="h-4 w-4" />} label="Aktivnih oglasov" value={aktivni.length} tone="accent" />
        <Tile icon={<Clock className="h-4 w-4" />} label="Izginilo z oglasnika" value={izginili.length} tone="zinc" />
        <Tile icon={<Activity className="h-4 w-4" />} label="Označeno kot prodano" value={prodani.length} tone="emerald" />
        <Tile icon={<TrendingDown className="h-4 w-4" />} label="Znižana cena" value={znizani.length} tone="amber" />
      </div>

      <p className="mt-3 text-xs text-zinc-500">
        <strong>Pomembno:</strong> „izginilo z oglasnika&ldquo; ni isto kot „prodano&ldquo;. Oglas je
        lahko umaknjen. Kot prodano šteje samo tisto, kar vir izrecno označi — zato sta številki
        ločeni.
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-zinc-900">Zadnji najdeni oglasi</h2>
        {oglasi.length === 0 ? (
          <p className="mt-3 rounded-xl border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-500">
            Še ni zbranih oglasov.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Vozilo</th>
                  <th className="px-4 py-2.5 font-medium">Letnik</th>
                  <th className="px-4 py-2.5 font-medium">Prevoženih</th>
                  <th className="px-4 py-2.5 font-medium">Cena</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Najden</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {oglasi.map((o) => (
                  <tr key={o.id}>
                    <td className="max-w-[22rem] truncate px-4 py-2.5">
                      <a href={o.url} target="_blank" rel="noreferrer" className="text-zinc-900 hover:text-accent">
                        {o.naziv ?? "—"}
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">{o.letnik ?? "—"}</td>
                    <td className="px-4 py-2.5 text-zinc-600">
                      {o.km === null ? "—" : `${o.km.toLocaleString("sl-SI")} km`}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-zinc-900">{eur(o.cena_eur)}</span>
                      {o.cena_prvotna_eur !== null && o.cena_eur !== null && o.cena_eur < o.cena_prvotna_eur && (
                        <span className="ml-1.5 text-xs text-amber-700 line-through">{eur(o.cena_prvotna_eur)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          o.status === "aktiven"
                            ? "bg-emerald-50 text-emerald-600"
                            : o.status === "prodano"
                              ? "bg-blue-50 text-blue-600"
                              : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {o.status === "aktiven" ? "Aktiven" : o.status === "prodano" ? "Prodano" : "Izginil"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500">
                      <RelativeTime iso={o.first_seen} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="mt-12 border-t border-zinc-200 pt-6 text-xs text-zinc-400">
        Podatki so zbrani z Avto.net ob upoštevanju njihovega <code>robots.txt</code> (10 s med
        zahtevki). Demo pripravil KodaTim.si.
      </footer>
    </main>
  );
}

function Tile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "accent" | "zinc" | "emerald" | "amber";
}) {
  const color = {
    accent: "text-accent",
    zinc: "text-zinc-900",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
  }[tone];
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-zinc-500">
        {icon}
        {label}
      </p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${color}`}>{value.toLocaleString("sl-SI")}</p>
    </div>
  );
}
