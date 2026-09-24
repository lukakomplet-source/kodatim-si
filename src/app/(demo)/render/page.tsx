import Drsnik from "@/components/render/Drsnik";
import { objavljeneNaloge } from "@/lib/render";
import { RENDER_VRSTA_OZNAKE, renderDatotekaUrl, type RenderNaloga } from "@/lib/renderOznake";

/**
 * Javni ogled izdelkov renderja (kodatim.si/render).
 *
 * Pokaže SAMO naloge, ki jih je admin objavil — objava pa je v bazi mogoča
 * samo z vpisanim virom, ustanovo in licenco (check constraint). Stare
 * fotografije so last ustanov; vir je zato pri vsakem izdelku, ne v nogi.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Nekoč in danes" };

export default async function RenderJavnoPage() {
  let naloge: RenderNaloga[] = [];
  try {
    naloge = await objavljeneNaloge();
  } catch {
    // Brez baze stran pokaže prazno stanje, ne napake.
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-12 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-semibold sm:text-4xl">Nekoč in danes</h1>
        <p className="mt-3 max-w-2xl text-zinc-400">
          Stare fotografije, obnovljene in postavljene ob današnji pogled na isti kraj. Kjer je pri delu sodelovala umetna
          inteligenca, je to pri izdelku označeno.
        </p>

        {naloge.length === 0 ? (
          <p className="mt-12 rounded-2xl bg-zinc-900 px-6 py-8 text-zinc-400">
            Izdelki bodo objavljeni, ko bodo urejene pravice za uporabo fotografij.
          </p>
        ) : (
          <div className="mt-10 space-y-14">
            {naloge.map((n) => {
              const r = n.rezultat;
              const glavna = r?.datoteke?.find((d) => d.glavna);
              const ai = [...new Set((r?.datoteke ?? []).map((d) => d.ai).filter(Boolean))];
              return (
                <section key={n.id}>
                  <h2 className="text-xl font-semibold">{n.naziv ?? RENDER_VRSTA_OZNAKE[n.vrsta]}</h2>
                  <div className="mt-4">
                    {r?.primerjava ? (
                      <Drsnik
                        levo={renderDatotekaUrl(r.primerjava.levo)}
                        desno={renderDatotekaUrl(r.primerjava.desno)}
                        levoOznaka={r.primerjava.levoOznaka}
                        desnoOznaka={r.primerjava.desnoOznaka}
                        alt={n.naziv ?? RENDER_VRSTA_OZNAKE[n.vrsta]}
                      />
                    ) : glavna?.vrsta === "video" ? (
                      <video
                        src={renderDatotekaUrl(glavna.pot)}
                        controls
                        loop
                        muted
                        playsInline
                        className="w-full rounded-xl bg-black"
                      />
                    ) : glavna ? (
                      // eslint-disable-next-line @next/next/no-img-element -- slika z D: prek naše poti
                      <img src={renderDatotekaUrl(glavna.pot)} alt={n.naziv ?? ""} className="w-full rounded-xl" />
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm text-zinc-400">
                    Vir:{" "}
                    {n.vir_url ? (
                      <a href={n.vir_url} target="_blank" rel="noreferrer" className="underline hover:text-zinc-200">
                        {n.vir}
                      </a>
                    ) : (
                      n.vir
                    )}
                    , {n.ustanova}. {n.licenca}
                  </p>
                  {ai.length > 0 && (
                    <p className="mt-1 text-xs text-amber-300/80">Obdelava z umetno inteligenco: {ai.join(", ")}.</p>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
