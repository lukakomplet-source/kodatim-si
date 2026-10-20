import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { preberiRaziskave } from "@/lib/priloznosti";
import { OZNAKE_FAZ } from "@/lib/priloznostiFaze";
import { Osvezevanje } from "../nadzor/Osvezevanje";
import { NovaRaziskava } from "./NovaRaziskava";
import { IZID, STANJE, cas, dolarji, minute } from "./oblika";

/**
 * Priložnosti: raziskovalec, ki najprej ugotovi, ali problem sploh obstaja in
 * ali bi zanj kdo plačal — šele potem pride prodaja. Vsaka raziskava pokaže,
 * kaj je agent res naredil (iskanja, prebrane strani), katere dokaze je koda
 * preverila in kaj ostaja neznano.
 */

export const dynamic = "force-dynamic";

export default async function PriloznostiPage() {
  await requireAdmin();
  const raziskave = await preberiRaziskave();
  const tece = raziskave?.some((r) => r.stanje === "v_teku" || r.stanje === "caka");

  return (
    <div>
      {tece ? <Osvezevanje vsakoS={20} /> : null}
      <h1 className="text-3xl font-semibold text-zinc-900">Priložnosti</h1>
      <p className="mt-2 max-w-3xl text-base text-zinc-600">
        Raziskovalec najprej ugotovi, ali problem obstaja, kdo ga ima, kako ga rešujejo danes in ali bi za rešitev
        plačali. Sme reči tudi »ne«. Pisati podjetjem začnemo šele, ko je povpraševanje potrjeno z resničnim signalom.
      </p>

      <div className="mt-5 max-w-3xl">
        <NovaRaziskava />
      </div>

      <h2 className="mt-8 text-sm font-semibold text-zinc-900">Raziskave</h2>
      {raziskave === null ? (
        <p className="mt-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          Harvey ne odgovarja na 127.0.0.1:5555 — plošča KodaTim ne teče.
        </p>
      ) : raziskave.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">Še ni nobene raziskave. Zgoraj postavi prvo vprašanje.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {raziskave.map((r) => {
            const stanje = STANJE[r.stanje] ?? STANJE.caka;
            return (
              <li key={r.id}>
                <Link
                  href={`/admin/priloznosti/${r.id}`}
                  className="block rounded-xl bg-white p-4 ring-1 ring-zinc-200 hover:ring-zinc-400"
                >
                  <p className="font-medium text-zinc-900">{r.vprasanje}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                    <span className={`rounded-full px-2 py-0.5 ${stanje.razred}`}>{stanje.oznaka}</span>
                    {r.izid ? (
                      <span className={`rounded-full px-2 py-0.5 ${IZID[r.izid].razred}`}>{IZID[r.izid].oznaka}</span>
                    ) : null}
                    <span>{OZNAKE_FAZ[r.faza] ?? r.faza}</span>
                    <span>
                      krog {r.krogov}/{r.najvec_krogov}
                    </span>
                    <span>
                      {r.preverjenih} preverjenih dokazov iz {r.domen} spletišč
                    </span>
                    <span>{r.orodij} dejanskih korakov</span>
                    <span>{minute(r.trajanje_s)}</span>
                    <span>{dolarji(r.stroski_usd)}</span>
                    <span className="text-zinc-400">{cas(r.posodobljeno)}</span>
                  </div>
                  {r.napaka ? <p className="mt-2 text-xs text-amber-800">{r.napaka}</p> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
