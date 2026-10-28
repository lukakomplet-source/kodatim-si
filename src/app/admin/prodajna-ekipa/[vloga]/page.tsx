import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import {
  KLJUCI_DELAVCEV,
  VLOGE,
  preberiDelavca,
  preberiEkipo,
  preberiLijak,
  type KljucDelavca,
} from "@/lib/prodajna-ekipa";
import { Osvezevanje } from "../../nadzor/Osvezevanje";
import { MapaOdobritve } from "../MapaOdobritve";
import { OdobritevSeznam } from "../OdobritevSeznam";
import { OZNAKE_STEVILK, kdaj, stanjeZaPrikaz, stevilo, vrednostStevilke } from "../oblika";

/**
 * En delavec od blizu: kaj je njegova naloga, po katerih pravilih dela,
 * njegove številke in zadnje stvari, ki jih je naredil. Pri odobritvi so
 * tu osnutki z gumboma, da lahko Luka odloča tudi s telefona.
 */

export const dynamic = "force-dynamic";

export default async function DelavecPage({ params }: { params: Promise<{ vloga: string }> }) {
  await requireAdmin();
  const { vloga: surovo } = await params;
  if (!(KLJUCI_DELAVCEV as readonly string[]).includes(surovo)) notFound();
  const vloga = surovo as KljucDelavca;
  const opis = VLOGE[vloga];

  const [{ povzetek, napaka }, podrobnosti, lijak] = await Promise.all([
    preberiEkipo(),
    preberiDelavca(vloga),
    vloga === "prodaja" ? preberiLijak().catch(() => null) : Promise.resolve(null),
  ]);
  const delavec = povzetek?.delavci.find((d) => d.kljuc === vloga);
  const stanje = delavec ? stanjeZaPrikaz(delavec.kljuc, delavec.stanje) : null;
  const zdaj = povzetek?.ustvarjeno ?? new Date().toISOString();

  return (
    <div>
      {/* Pri odobritvi bi osveževanje motilo branje osnutka. */}
      {vloga !== "odobritev" ? <Osvezevanje vsakoS={15} /> : null}

      <Link href="/admin/prodajna-ekipa" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Prodajna ekipa
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold text-zinc-900">{opis.ime}</h1>
        {stanje ? (
          <span className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1 text-xs">
            <span className={`h-2 w-2 rounded-full ${stanje.pika}`} />
            <span className={stanje.besedilo}>{stanje.oznaka}</span>
          </span>
        ) : null}
        {delavec ? <span className="text-xs text-zinc-400">zadnjič: {kdaj(delavec.zadnjic, zdaj)}</span> : null}
      </div>
      <p className="mt-2 max-w-3xl text-base text-zinc-600">{opis.naloga}</p>

      {napaka ? (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">{napaka}</p>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div>
          {delavec ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
                <p className="text-xs text-zinc-500">{delavec.glavna.oznaka}</p>
                <p className="mt-0.5 text-2xl font-semibold text-zinc-900">{stevilo(delavec.glavna.vrednost)}</p>
              </div>
              {Object.entries(delavec.stevilke)
                .filter(([k]) => OZNAKE_STEVILK[k])
                .map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
                    <p className="text-xs text-zinc-500">{OZNAKE_STEVILK[k]}</p>
                    <p className="mt-0.5 break-words text-lg font-semibold text-zinc-900">{vrednostStevilke(k, v)}</p>
                  </div>
                ))}
            </div>
          ) : null}

          {delavec?.cilj ? (
            <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-zinc-200">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Cilj: {delavec.cilj.oznaka}</span>
                <span>
                  {stevilo(delavec.cilj.vrednost)} / {stevilo(delavec.cilj.cilj)}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-zinc-900"
                  style={{ width: `${Math.min(100, (100 * delavec.cilj.vrednost) / Math.max(1, delavec.cilj.cilj))}%` }}
                />
              </div>
            </div>
          ) : null}

          {podrobnosti?.razporeditev?.length ? (
            <div className="mt-5">
              <h2 className="text-sm font-semibold text-zinc-900">Katere pomanjkljivosti najde</h2>
              <div className="mt-2 space-y-1.5">
                {podrobnosti.razporeditev.map((r) => {
                  const najvec = Math.max(...podrobnosti.razporeditev!.map((x) => x.vrednost), 1);
                  return (
                    <div key={r.oznaka} className="flex items-center gap-3 text-sm">
                      <span className="w-56 shrink-0 text-zinc-700">{r.oznaka}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(100 * r.vrednost) / najvec}%` }} />
                      </div>
                      <span className="w-10 text-right tabular-nums text-zinc-500">{r.vrednost}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {podrobnosti?.poraba_po_delavcih?.length ? (
            <div className="mt-5">
              <h2 className="text-sm font-semibold text-zinc-900">Poraba Claude po delavcih</h2>
              <div className="mt-2 overflow-x-auto rounded-xl ring-1 ring-zinc-200">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Delavec</th>
                      <th className="px-3 py-2 text-right">Klicev</th>
                      <th className="px-3 py-2 text-right">Vhodnih žetonov</th>
                      <th className="px-3 py-2 text-right">Izhodnih žetonov</th>
                    </tr>
                  </thead>
                  <tbody>
                    {podrobnosti.poraba_po_delavcih.map((r) => (
                      <tr key={r.oznaka} className="border-t border-zinc-100">
                        <td className="px-3 py-2">{r.oznaka}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{stevilo(r.klicev)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{stevilo(r.vhodnih)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{stevilo(r.izhodnih)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {vloga === "prodaja" && lijak ? (
            <div className="mt-5 rounded-xl bg-white p-4 ring-1 ring-zinc-200">
              <h2 className="text-sm font-semibold text-zinc-900">Lijak v Promocijah</h2>
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                {lijak.faze.map((f) => (
                  <span key={f.kljuc} className="rounded-lg bg-zinc-100 px-2.5 py-1">
                    {f.oznaka} <b className="tabular-nums">{f.stevilo}</b>
                  </span>
                ))}
              </div>
              <p className="mt-2 text-sm text-zinc-600">
                Prodano: {lijak.prodano} · vrednost {stevilo(Math.round(lijak.vrednost))} €
              </p>
              {lijak.kampanjaId ? (
                <Link href={`/admin/promocije/${lijak.kampanjaId}`} className="mt-2 inline-block text-sm underline">
                  Odpri kampanjo »Harvey · KodaTim«
                </Link>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">
                  Kampanja nastane sama, ko prvo podjetje odgovori z zanimanjem.
                </p>
              )}
            </div>
          ) : null}

          <h2 className="mt-6 text-sm font-semibold text-zinc-900">
            {vloga === "odobritev" ? "Čaka na tvojo odločitev" : "Zadnje, kar je naredil"}
          </h2>
          <div className="mt-2">
            {vloga === "odobritev" ? (
              <div className="space-y-4">
                {(podrobnosti?.mape ?? []).map((m) => (
                  <MapaOdobritve
                    key={m.kljuc}
                    mapa={m}
                    postavke={(podrobnosti?.seznam ?? []).filter((p) => p.mapa === m.ime)}
                  />
                ))}
                <OdobritevSeznam
                  postavke={(podrobnosti?.seznam ?? []).filter(
                    (p) => !p.mapa || !(podrobnosti?.mape ?? []).some((m) => m.ime === p.mapa),
                  )}
                />
              </div>
            ) : podrobnosti?.seznam.length ? (
              <ul className="divide-y divide-zinc-100 rounded-xl bg-white ring-1 ring-zinc-200">
                {podrobnosti.seznam.map((p, i) => (
                  <li key={p.id ?? `${p.naslov}-${i}`} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-900">{p.naslov}</p>
                        {p.podnaslov ? <p className="truncate text-xs text-zinc-500">{p.podnaslov}</p> : null}
                        {p.zadeva ? <p className="mt-1 text-sm text-zinc-700">Zadeva: {p.zadeva}</p> : null}
                      </div>
                      <span className="shrink-0 text-xs text-zinc-400">{kdaj(p.cas, zdaj)}</span>
                    </div>
                    {p.oznake?.filter(Boolean).length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {p.oznake.filter(Boolean).map((o) => (
                          <span key={o} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                            {o}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {p.besedilo ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">{p.besedilo}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">Tu še ni ničesar.</p>
            )}
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
            <h2 className="text-sm font-semibold text-zinc-900">Pravila</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-zinc-600">
              {opis.pravila.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
            <h2 className="text-sm font-semibold text-zinc-900">Ekipa</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {KLJUCI_DELAVCEV.map((k) => (
                <li key={k}>
                  <Link
                    href={`/admin/prodajna-ekipa/${k}`}
                    className={k === vloga ? "font-semibold text-zinc-900" : "text-zinc-600 hover:text-zinc-900"}
                  >
                    {VLOGE[k].ime}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
