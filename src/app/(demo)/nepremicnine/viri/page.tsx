import { redirect } from "next/navigation";
import { Database } from "lucide-react";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { NepNav } from "../NepNav";
import { pozeniPregledForm, preklopiVirForm } from "./actions";

/**
 * Upravljanje virov: zdravje, zadnji pregledi, napake, ročni zagon.
 * Viri se obdelujejo zaporedno — en aktiven pregled naenkrat.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Viri — SBN Nepremičnine" };

const datumUra = (v: string | null) => (v ? new Date(v).toLocaleString("sl-SI") : "—");

/** Zunaj komponente, ker je render čist; strežniška funkcija sme brati uro. */
function odcitekUre(): number {
  return Date.now();
}

export default async function NepViriPage() {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa("/nepremicnine/viri"));
  if (!dostop.jeAdmin) redirect("/nepremicnine");

  const db = createAvtonetClient();
  const vceraj = new Date(odcitekUre() - 86_400_000).toISOString();
  const [{ data: viri }, { data: pregledi }, { count: napak24h }, { count: kandidatov }] = await Promise.all([
    db.from("nep_viri").select("*").order("vir"),
    db.from("nep_pregledi").select("*").order("zahtevano_ob", { ascending: false }).limit(10),
    db.from("nep_napake").select("id", { count: "exact", head: true }).gte("ob", vceraj),
    db.from("nep_zdruzitve").select("id", { count: "exact", head: true }).eq("nacin", "kandidat"),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-zinc-900 sm:text-3xl">
        <Database className="h-7 w-7 text-accent" />
        Viri podatkov
      </h1>
      <p className="mt-1.5 text-sm text-zinc-500">
        Vsak vir je svoj adapter z lastnimi omejitvami; obdelujejo se zaporedno, en pokvarjen vir ne
        ustavi drugih. Napak v zadnjih 24 h: {napak24h ?? 0}. Kandidatov za združitev v čakalnici:{" "}
        {kandidatov ?? 0} (potrjujejo se na strani posameznega oglasa).
      </p>

      <NepNav aktiven="/nepremicnine/viri" jeAdmin />

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {(viri ?? []).map((v) => (
          <section key={v.vir as string} className="rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-zinc-900">{v.vir as string}</h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
                  !v.omogocen
                    ? "bg-zinc-100 text-zinc-500"
                    : v.zdravje === "healthy"
                      ? "bg-emerald-50 text-emerald-700"
                      : v.zdravje === "degraded"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-zinc-100 text-zinc-500"
                }`}
              >
                {!v.omogocen ? "izklopljen" : (v.zdravje as string)}
              </span>
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-zinc-400">Zadnji pregled</dt><dd className="font-medium">{datumUra(v.zadnji_pregled as string | null)}</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-400">Zadnjič najdenih</dt><dd className="font-medium">{(v.zadnjic_najdenih as number | null)?.toLocaleString("sl-SI") ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-400">Pričakovani razpon</dt><dd className="font-medium">{(v.pricakovano_min as number).toLocaleString("sl-SI")}–{(v.pricakovano_max as number).toLocaleString("sl-SI")}</dd></div>
              {typeof v.opomba === "string" && v.opomba && <div className="text-xs text-amber-700">{v.opomba}</div>}
            </dl>
            <div className="mt-4 flex gap-2">
              <form action={pozeniPregledForm.bind(null, v.vir as string)}>
                <button className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:brightness-110">
                  Poženi zdaj
                </button>
              </form>
              <form action={preklopiVirForm.bind(null, v.vir as string, !v.omogocen)}>
                <button className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50">
                  {v.omogocen ? "Izklopi" : "Vklopi"}
                </button>
              </form>
            </div>
          </section>
        ))}
      </div>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Zadnji pregledi</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-zinc-400">
              <tr>
                <th className="py-1.5 pr-3">Vir</th>
                <th className="py-1.5 pr-3">Status</th>
                <th className="py-1.5 pr-3">Začetek</th>
                <th className="py-1.5 pr-3">Najdenih</th>
                <th className="py-1.5 pr-3">Novih</th>
                <th className="py-1.5 pr-3">Cen</th>
                <th className="py-1.5 pr-3">Izginulih</th>
                <th className="py-1.5">Zadnja rezina / napaka</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-700">
              {(pregledi ?? []).map((p) => (
                <tr key={p.id as string}>
                  <td className="py-1.5 pr-3 font-medium">{(p.vir as string | null) ?? "nepremicnine.net"}</td>
                  <td className="py-1.5 pr-3">
                    <span className={p.status === "koncano" ? "text-emerald-600" : p.status === "napaka" ? "text-red-600" : "font-semibold text-accent"}>
                      {p.status as string}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">{datumUra((p.zacetek as string | null) ?? (p.zahtevano_ob as string))}</td>
                  <td className="py-1.5 pr-3">{(p.najdenih as number).toLocaleString("sl-SI")}</td>
                  <td className="py-1.5 pr-3">{p.novih as number}</td>
                  <td className="py-1.5 pr-3">{p.sprememb_cen as number}</td>
                  <td className="py-1.5 pr-3">{p.izginulih as number}</td>
                  <td className="max-w-[240px] truncate py-1.5 text-xs text-zinc-500" title={(p.zadnja_napaka as string | null) ?? (p.zadnja_rezina as string | null) ?? ""}>
                    {(p.zadnja_napaka as string | null) ?? (p.zadnja_rezina as string | null) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
