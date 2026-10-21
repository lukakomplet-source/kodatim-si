import type { Razmisljanje } from "@/lib/prodajna-ekipa";

function Vir({ url, besedilo = "vir" }: { url: string; besedilo?: string }) {
  if (!/^https?:\/\//.test(url)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-zinc-500 underline underline-offset-2 hover:text-zinc-900"
    >
      {besedilo}
    </a>
  );
}

/**
 * Kako je prodajni agent prišel do osnutka: panoga in njena bolečina z virom,
 * znak pri tem podjetju, kaj je izpustil in zakaj, rešitev in paket, ocena
 * kritika. Luka se lahko odloči, ne da bi bral celo raziskavo.
 */
export function RazmisljanjeKartica({ r }: { r: Razmisljanje }) {
  return (
    <details open className="mt-3 rounded-lg bg-sky-50/60 px-3 py-2 text-xs leading-relaxed text-zinc-700 ring-1 ring-sky-200">
      <summary className="cursor-pointer font-medium text-sky-900">Kako je agent razmišljal</summary>
      <dl className="mt-2 space-y-2">
        {r.bolecina ? (
          <div>
            <dt className="text-zinc-500">Panoga {r.panoga} — glavna bolečina</dt>
            <dd className="font-medium text-zinc-900">{r.bolecina}</dd>
            {r.lastnikRece ? <dd className="italic text-zinc-600">»{r.lastnikRece}«</dd> : null}
            {r.viriPanoge.map((v, i) => (
              <dd key={i} className="text-zinc-600">
                Na spletu: »{v.citat}« <Vir url={v.url} />
                {v.tuj ? <span className="ml-1 text-amber-700">(tuj vir)</span> : null}
              </dd>
            ))}
          </div>
        ) : null}

        {r.znakiPriNjih.length > 0 || r.manjkaPriNjih.length > 0 ? (
          <div>
            <dt className="text-zinc-500">Zakaj misli, da to velja zanje</dt>
            {r.znakiPriNjih.map((z, i) => (
              <dd key={i}>
                Na njihovi strani piše »{z.znak}« <Vir url={z.url} besedilo="stran" />
              </dd>
            ))}
            {r.manjkaPriNjih.map((m) => (
              <dd key={m}>{m}</dd>
            ))}
          </div>
        ) : null}

        {r.problemi.length > 0 ? (
          <div>
            <dt className="text-zinc-500">Dokazano pri njih</dt>
            {r.problemi.map((p, i) => (
              <dd key={i}>
                {p.problem}
                {p.citat ? <span className="text-zinc-500"> — »{p.citat}«</span> : null}
              </dd>
            ))}
          </div>
        ) : null}

        {r.resitev ? (
          <div>
            <dt className="text-zinc-500">Rešitev{r.paket ? ` · paket ${r.paket}` : ""}</dt>
            <dd className="font-medium text-zinc-900">{r.resitev}</dd>
            {r.povzetekResitve ? <dd>{r.povzetekResitve}</dd> : null}
            {r.zakajPaket ? <dd className="text-zinc-600">{r.zakajPaket}</dd> : null}
          </div>
        ) : null}

        {r.raziskavaResitve ? (
          <div>
            <dt className="text-zinc-500">
              Kako to rešujejo drugi
              {r.raziskavaResitve.ponovno
                ? " · raziskava panoge, uporabljena znova"
                : ` · ${r.raziskavaResitve.krogi} ${r.raziskavaResitve.krogi === 1 ? "krog" : r.raziskavaResitve.krogi === 2 ? "kroga" : "krogi"}, ${r.raziskavaResitve.branj} prebranih strani, ${r.raziskavaResitve.minut.toLocaleString("sl-SI")} min`}
              {r.raziskavaResitve.izpadlo > 0 ? ` · ${r.raziskavaResitve.izpadlo} nepreverjenih izsekov izpadlo` : ""}
            </dt>
            {r.raziskavaResitve.pristopi.map((p, i) => (
              <dd key={i}>
                <span className="font-medium text-zinc-900">{p.pristop}</span>
                {p.opis ? <span> — {p.opis}</span> : null}
                {p.viri.map((v, j) => (
                  <span key={j} className="block text-zinc-600">
                    »{v.odlomek}« <Vir url={v.url} />
                    {v.tuj ? <span className="ml-1 text-amber-700">(tuj vir)</span> : null}
                  </span>
                ))}
              </dd>
            ))}
            {r.raziskavaResitve.priporocilo ? (
              <dd className="text-zinc-900">Za njih: {r.raziskavaResitve.priporocilo}</dd>
            ) : null}
            {r.raziskavaResitve.nasvet ? (
              <dd className="text-zinc-600">Brezplačen nasvet v mailu: {r.raziskavaResitve.nasvet}</dd>
            ) : null}
          </div>
        ) : null}

        {r.izpuscene.length > 0 || r.neKazeSe.length > 0 ? (
          <div>
            <dt className="text-zinc-500">Česa ni ponudil</dt>
            {r.izpuscene.map((x, i) => (
              <dd key={i}>
                {x.bolecina}
                {x.zakaj ? <span className="text-zinc-500"> — {x.zakaj}</span> : null}
              </dd>
            ))}
            {r.neKazeSe.length > 0 ? (
              <dd className="text-zinc-500">Pri njih se ne kaže: {r.neKazeSe.join(", ")}</dd>
            ) : null}
          </div>
        ) : null}

        {r.ocena !== null && r.ocena !== undefined ? (
          <div>
            <dt className="text-zinc-500">Kritik</dt>
            <dd>
              {r.ocena.toLocaleString("sl-SI")} / 5{r.kritik ? ` — ${r.kritik}` : ""}
            </dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}
