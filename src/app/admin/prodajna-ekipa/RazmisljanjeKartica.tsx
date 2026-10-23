import type { Razmisljanje, TrznaCena } from "@/lib/prodajna-ekipa";

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
    <>
    {r.opozorila && r.opozorila.length > 0 ? (
      <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-300">
        <p className="font-medium">Preveri pred odobritvijo — kritik tega ni našel v njihovih virih:</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {r.opozorila.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>
        <p className="mt-1 text-amber-800">Popravi z »Uredi besedilo« ali osnutek zavrni.</p>
      </div>
    ) : null}
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
            {r.raziskavaResitve.bistvo ? (
              <dd className="font-medium text-zinc-900">Bistvo: {r.raziskavaResitve.bistvo}</dd>
            ) : null}
            {(r.raziskavaResitve.glasovi ?? []).map((g, i) => (
              <dd key={`g${i}`} className="italic text-zinc-600">
                »{g.odlomek}« <Vir url={g.url} />
                {g.tuj ? <span className="ml-1 not-italic text-amber-700">(tuj vir)</span> : null}
              </dd>
            ))}
            {r.raziskavaResitve.enaFunkcija ? (
              <dd className="text-zinc-900">Ena glavna funkcija: {r.raziskavaResitve.enaFunkcija}</dd>
            ) : null}
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
              <dd className="text-zinc-600">Brezplačen nasvet: {r.raziskavaResitve.nasvet}</dd>
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

        {r.cena ? <CenaTrga c={r.cena} /> : null}

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
    </>
  );
}

const SKUPINE: Record<string, string> = { slo_agencija: "SLO agencija", saas: "naročnina", tuja: "tuja ponudba" };

/** Cena paketa iz preverjenih tržnih cen: pravilo in viri, da Luka vidi, od kod je številka. */
function CenaTrga({ c }: { c: TrznaCena }) {
  return (
    <div>
      <dt className="text-zinc-500">
        Cena{c.tip ? ` · ${c.tip}` : ""}
        {c.brezPrimerjave ? " · brez tržne primerjave (premalo preverjenih cen), ostane cenik" : ""}
      </dt>
      {c.cena ? (
        <dd className="font-medium text-zinc-900">
          {c.cena.toLocaleString("sl-SI")} € + DDV
          {c.pravilo ? <span className="font-normal text-zinc-500"> — {c.pravilo}</span> : null}
        </dd>
      ) : null}
      {c.primerjava ? <dd className="text-zinc-600">V mailu: {c.primerjava}</dd> : null}
      {c.viri.length > 0 ? (
        <dd>
          <table className="mt-1 w-full text-left">
            <tbody>
              {c.viri.map((v, i) => (
                <tr key={i} className="border-t border-sky-100 align-top">
                  <td className="py-1 pr-2 text-zinc-500">{SKUPINE[v.skupina] ?? v.skupina}</td>
                  <td className="py-1 pr-2">{v.ponudnik}</td>
                  <td className="py-1 pr-2 whitespace-nowrap font-medium">
                    {v.eur !== null ? `${v.eur.toLocaleString("sl-SI")} €` : ""}
                    {v.obdobje === "mesecno" || v.obdobje === "letno" ? "/mes" : ""}
                  </td>
                  <td className="py-1 italic text-zinc-600">
                    »{v.odlomek}« <Vir url={v.url} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </dd>
      ) : null}
    </div>
  );
}
