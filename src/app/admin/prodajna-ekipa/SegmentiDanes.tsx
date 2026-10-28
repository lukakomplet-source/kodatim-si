import Link from "next/link";
import type { SegmentiPovzetek } from "@/lib/prodajna-ekipa";

/**
 * Dnevni povzetek segmentov (Harvey: harvey/segmenti.py): lijak od registra
 * do poslanega maila za vsak »lov« in zakaj so ostali izpadli. Izbrani so v
 * Bazi leadov pod »Danes izbrani«.
 */
export function SegmentiDanes({ povzetek }: { povzetek: SegmentiPovzetek }) {
  const pavza = povzetek.cw_pavza_do && povzetek.cw_pavza_do > new Date().toISOString().replace("T", " ").slice(0, 19);
  return (
    <section className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-900">Segmenti danes</h2>
        <Link
          href="/admin/lead-intelligence/leads?izbrani=danes"
          className="text-sm text-zinc-900 underline underline-offset-2"
        >
          Danes izbrani v Bazi leadov
        </Link>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        {povzetek.v_harveyja
          ? "Izbrani gredo v pripravo (problem, stran, mail), vsak mail odobriš ti."
          : "Suhi tek: Harvey podjetja izbira in jih kaže v Bazi leadov, v pripravo mailov ne gre nič."}{" "}
        CompanyWall danes {povzetek.cw_danes} od {povzetek.cw_na_dan}
        {pavza ? `, počiva do ${povzetek.cw_pavza_do.slice(11, 16)} UTC (blokada, ne obhajamo)` : ""}.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {povzetek.segmenti.map((s) => (
          <div key={s.kljuc} className="rounded-xl bg-zinc-50 p-4">
            <p className="font-semibold text-zinc-900">
              {s.ime}{" "}
              <span className="text-sm font-normal text-zinc-500">
                · {s.posel === "kompletko" ? "Kompletko" : "KodaTim"}
                {s.aktiven ? "" : " · izklopljen"}
              </span>
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
              {[
                ["Izbranih danes", `${s.izbranih_danes} / ${s.na_dan}`],
                ["Čaka odobritev", s.caka_odobritev],
                ["Poslanih", s.poslanih],
                ["Ustreznih v zalogi", s.ustreznih],
                ["Še nepregledanih", s.v_zalogi],
                ["Odgovorov", s.odgovorov],
              ].map(([oznaka, vrednost]) => (
                <div key={oznaka as string}>
                  <dt className="text-zinc-500">{oznaka}</dt>
                  <dd className="text-lg font-semibold text-zinc-900">{vrednost}</dd>
                </div>
              ))}
            </dl>
            {s.zakaj_ne.length > 0 && (
              <p className="mt-3 text-xs text-zinc-500">
                Izpadli ({s.neustreznih + s.izkljucenih}):{" "}
                {s.zakaj_ne.map((z) => `${z.razlog} ${z.stevilo}`).join(" · ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
