import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { preberiNadzor } from "@/lib/nadzor";
import { Kartica } from "./Kartica";
import { Osvezevanje } from "./Osvezevanje";

/**
 * Vsi zbiralniki na enem zaslonu.
 *
 * Namen je ena sama poved: „ali kaj stoji“. Zato je vsaka vrstica ista — kaj
 * dela, koliko je narejenega, koliko časa še — in zato je opozorilo o procesu,
 * ki teče, a pri vsakem poskusu pade, enako vidno kot ustavljen proces. Prav
 * ta razlika se je 3. 9. skrivala tri dni. Klik na kartico odpre podrobnosti
 * z dnevnikom tistega delavca.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Nadzor zbiralnikov" };

/** Zmerno: en izris na pol minute, in nič, ko zavihek ni viden. */
const OSVEZI_VSAKIH_S = 30;

export default async function NadzorPage() {
  await requireAdmin();
  const nadzor = await preberiNadzor();

  const stoji = nadzor.skrejperji.filter((s) => s.tece === false || s.opozorilo);
  const sistem = nadzor.sistem;

  return (
    <div>
      <Osvezevanje vsakoS={OSVEZI_VSAKIH_S} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold text-zinc-900">Nadzor zbiralnikov</h1>
        <span className="text-xs text-zinc-400">
          osveženo {new Date(nadzor.ob).toLocaleTimeString("sl-SI")} · samodejno vsakih {OSVEZI_VSAKIH_S} s
        </span>
      </div>
      <p className="mt-2 max-w-3xl text-base text-zinc-500">
        Vsi zbiralniki na tem računalniku — vozila, nepremičnine in register podjetij — z
        napredkom, oceno preostalega časa in obremenitvijo stroja. Klik na kartico odpre
        podrobnosti in dnevnik tistega delavca.
      </p>

      {stoji.length > 0 ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Pozor pri {stoji.length} od {nadzor.skrejperji.length}:{" "}
          {stoji.map((s) => s.ime).join(", ")}.
        </p>
      ) : (
        <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          Vseh {nadzor.skrejperji.length} zbiralnikov dela.
        </p>
      )}

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {nadzor.skrejperji.map((s) => (
          <Link
            key={s.kljuc}
            href={`/admin/nadzor/${s.kljuc}`}
            className="block rounded-xl transition hover:ring-2 hover:ring-zinc-400"
          >
            <Kartica skrejper={s} />
          </Link>
        ))}
      </div>

      <h2 className="mt-8 text-sm font-semibold text-zinc-900">Obremenitev računalnika</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Procesor", sistem.cpuOdstotek !== null ? `${Math.round(sistem.cpuOdstotek)} %` : "—"],
          [
            "Pomnilnik",
            sistem.ramSkupajGb
              ? `${(sistem.ramUporabljenoGb ?? 0).toFixed(1)} / ${sistem.ramSkupajGb.toFixed(0)} GB`
              : "—",
          ],
          [
            "Grafična",
            sistem.gpuOdstotek !== null ? `${Math.round(sistem.gpuOdstotek)} %` : "—",
          ],
          [
            "VRAM",
            sistem.vramSkupajGb
              ? `${(sistem.vramUporabljenoGb ?? 0).toFixed(1)} / ${sistem.vramSkupajGb.toFixed(0)} GB`
              : "—",
          ],
        ].map(([oznaka, vrednost]) => (
          <div key={oznaka} className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
            <p className="text-xs text-zinc-500">{oznaka}</p>
            <p className="mt-0.5 text-xl font-semibold text-zinc-900">{vrednost}</p>
          </div>
        ))}
      </div>

      {sistem.gpuIme && <p className="mt-2 text-xs text-zinc-400">Grafična: {sistem.gpuIme}</p>}

      <h2 className="mt-8 text-sm font-semibold text-zinc-900">Prostor na diskih</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {nadzor.diski.map((d) => {
          const zasedeno = d.skupajGb > 0 ? ((d.skupajGb - d.prostoGb) / d.skupajGb) * 100 : 0;
          return (
            <div key={d.crka} className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
              <div className="flex items-baseline justify-between">
                <p className="text-xs text-zinc-500">Disk {d.crka}</p>
                <p className="text-xs text-zinc-400">{Math.round(zasedeno)} % zasedeno</p>
              </div>
              <p className="mt-0.5 text-xl font-semibold text-zinc-900">
                {d.prostoGb.toFixed(0)} GB prosto
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={`h-full rounded-full ${zasedeno > 90 ? "bg-red-500" : "bg-zinc-900"}`}
                  style={{ width: `${Math.min(100, zasedeno)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-zinc-400">od {d.skupajGb.toFixed(0)} GB</p>
            </div>
          );
        })}
        {nadzor.diski.length === 0 && (
          <p className="text-sm text-zinc-500">Podatkov o diskih ni bilo mogoče prebrati.</p>
        )}
      </div>
    </div>
  );
}
