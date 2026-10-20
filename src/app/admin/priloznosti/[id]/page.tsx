import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/require-admin";
import { preberiRaziskavo, type Dokaz, type Korak } from "@/lib/priloznosti";
import { OZNAKE_FAZ } from "@/lib/priloznostiFaze";
import { Osvezevanje } from "../../nadzor/Osvezevanje";
import { IZID, STANJE, cas, dolarji, minute } from "../oblika";
import { FazaObrazec, UstaviGumb } from "./Upravljanje";

/**
 * Ena raziskava od blizu: kaj je vprašanje in zakaj, kaj je agent res naredil
 * (vsako iskanje in vsaka prebrana stran, kot jo je zapisala koda), dokazi z
 * oznako, ali jih je koda našla na strani, hipoteze za in proti, konkurenti,
 * premišljene in zavrnjene rešitve, ekonomika s predpostavkami, pot do kupcev,
 * priporočilo z gotovostjo in neznankami ter življenjski cikel priložnosti.
 */

export const dynamic = "force-dynamic";

const PREVERBA: Record<number, { znak: string; oznaka: string; razred: string }> = {
  1: { znak: "✔", oznaka: "odlomek najden na strani", razred: "text-emerald-700" },
  0: { znak: "✘", oznaka: "odlomka ni na strani", razred: "text-red-700" },
  [-1]: { znak: "?", oznaka: "strani ni bilo mogoče prebrati", razred: "text-amber-700" },
};

function Razdelek({ naslov, opis, children }: { naslov: string; opis?: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold text-zinc-900">{naslov}</h2>
      {opis ? <p className="mt-0.5 text-sm text-zinc-500">{opis}</p> : null}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Seznam({ elementi, prazno = "—" }: { elementi?: string[]; prazno?: string }) {
  if (!elementi?.length) return <p className="text-sm text-zinc-400">{prazno}</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
      {elementi.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

function Povezava({ url, children }: { url: string; children?: ReactNode }) {
  if (!/^https?:\/\//.test(url)) return <span>{children ?? url}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2 hover:text-zinc-900">
      {children ?? url}
    </a>
  );
}

function KrogDela({ krog, koraki }: { krog: number; koraki: Korak[] }) {
  const iskanja = koraki.filter((k) => k.vrsta === "iskanje");
  const branja = koraki.filter((k) => k.vrsta === "branje");
  const povzetek = koraki.find((k) => k.vrsta === "krog");
  const ocena = koraki.find((k) => k.vrsta === "ocenjevalec");
  return (
    <details className="rounded-xl bg-white p-3 ring-1 ring-zinc-200" open={!povzetek}>
      <summary className="cursor-pointer text-sm font-medium text-zinc-900">
        Krog {krog}: {iskanja.length} iskanj, {branja.length} prebranih strani
        {povzetek ? ` · ${povzetek.izid}` : " · teče"}
        {ocena ? ` · ocenjevalec ${ocena.izid}` : ""}
      </summary>
      {povzetek?.vsebina ? <p className="mt-2 text-sm text-zinc-700">{povzetek.vsebina}</p> : null}
      <ol className="mt-2 space-y-1 text-xs text-zinc-600">
        {koraki
          .filter((k) => k.vrsta === "iskanje" || k.vrsta === "branje")
          .map((k) => (
            <li key={k.id} className="flex gap-2">
              <span className="w-12 shrink-0 tabular-nums text-zinc-400">{cas(k.cas).split(" ").pop()}</span>
              {k.vrsta === "iskanje" ? (
                <span>
                  Iskanje »{k.vsebina}« — {k.izid}
                </span>
              ) : (
                <span>
                  Prebral <Povezava url={k.vsebina} /> — {k.izid}
                </span>
              )}
            </li>
          ))}
      </ol>
      {ocena ? <p className="mt-2 text-xs text-zinc-600">Ocenjevalec: {ocena.vsebina}</p> : null}
    </details>
  );
}

function DokazVrstica({ d }: { d: Dokaz }) {
  const p = PREVERBA[d.preverjeno] ?? PREVERBA[-1];
  return (
    <li className="rounded-lg bg-white p-3 text-sm ring-1 ring-zinc-200">
      <p className="text-zinc-900">{d.trditev || "—"}</p>
      <p className="mt-1 italic text-zinc-600">»{d.odlomek}«</p>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
        <span className={p.razred} title={p.oznaka}>
          {p.znak} {p.oznaka}
        </span>
        {!d.videno ? <span className="text-red-700">orodja tega URL-ja niso videla</span> : null}
        <span>{d.vrsta_dokaza}</span>
        <span>{d.vrsta_vira}</span>
        <span>
          {d.hipoteza || "brez hipoteze"} · {d.smer}
        </span>
        <span>krog {d.krog}</span>
        <Povezava url={d.url}>{d.domena}</Povezava>
      </p>
    </li>
  );
}

export default async function RaziskavaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const r = await preberiRaziskavo(id);
  if (r === "ni") notFound();

  if (r === null) {
    return (
      <div>
        <Link href="/admin/priloznosti" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Priložnosti
        </Link>
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          Harvey ne odgovarja na 127.0.0.1:5555 — plošča KodaTim ne teče.
        </p>
      </div>
    );
  }

  const s = r.sinteza;
  const pr = s.priporocilo;
  const stanje = STANJE[r.stanje] ?? STANJE.caka;
  const tece = r.stanje === "v_teku" || r.stanje === "caka";
  const krogi = Array.from(new Set(r.koraki.map((k) => k.krog))).sort((a, b) => a - b);
  const preverjeni = r.dokazi.filter((d) => d.preverjeno === 1);
  const domen = new Set(preverjeni.map((d) => d.domena)).size;
  const iskanj = r.koraki.filter((k) => k.vrsta === "iskanje").length;
  const branj = r.koraki.filter((k) => k.vrsta === "branje").length;
  const ocena = r.ocena;

  return (
    <div className="max-w-5xl">
      {tece ? <Osvezevanje vsakoS={20} /> : null}
      <Link href="/admin/priloznosti" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Priložnosti
      </Link>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{r.vprasanje}</h1>
      <p className="mt-1 text-sm text-zinc-600">Zakaj: {r.zakaj}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
        <span className={`rounded-full px-2.5 py-0.5 ${stanje.razred}`}>{stanje.oznaka}</span>
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5">{OZNAKE_FAZ[r.faza] ?? r.faza}</span>
        <span>
          krog {r.krogov}/{r.najvec_krogov}
        </span>
        <span>
          {iskanj} iskanj, {branj} prebranih strani
        </span>
        <span>
          {preverjeni.length}/{r.dokazi.length} dokazov preverjenih, {domen} spletišč
        </span>
        <span>
          {minute(r.trajanje_s)} od {r.najvec_minut} min
        </span>
        <span>{dolarji(r.stroski_usd)} (naročnina)</span>
        {r.zacetek ? <span>začeto {cas(r.zacetek)}</span> : null}
        {r.konec ? <span>končano {cas(r.konec)}</span> : null}
        {r.stanje === "v_teku" && r.zaklep_do ? <span>krog {r.krogov + 1} teče od {cas(r.krog_od)}</span> : null}
        {tece || r.stanje === "prekinjeno" ? <UstaviGumb id={r.id} /> : null}
      </div>
      {r.napaka ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{r.napaka}</p>
      ) : null}

      <Razdelek
        naslov="Priporočilo"
        opis={r.stanje === "koncano" ? "Končni izid raziskave." : "Stanje po zadnjem krogu; raziskava še ni zaključena."}
      >
        {pr ? (
          <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
            <div className="flex flex-wrap items-center gap-2">
              {pr.izid ? (
                <span className={`rounded-full px-2.5 py-0.5 text-xs ${IZID[pr.izid].razred}`}>{IZID[pr.izid].oznaka}</span>
              ) : null}
              <span className="text-xs text-zinc-500">gotovost: {pr.gotovost}</span>
            </div>
            <p className="mt-2 text-sm text-zinc-800">{pr.zakaj}</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div>
                <h3 className="text-xs font-medium text-zinc-500">Dokazano</h3>
                <Seznam elementi={pr.dokazano} />
              </div>
              <div>
                <h3 className="text-xs font-medium text-zinc-500">Predpostavke</h3>
                <Seznam elementi={pr.predpostavke} />
              </div>
              <div>
                <h3 className="text-xs font-medium text-zinc-500">Še neznano</h3>
                <Seznam elementi={pr.neznano} />
              </div>
            </div>
            {s.validacija?.test ? (
              <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950 ring-1 ring-emerald-200">
                <p>
                  <span className="font-medium">Najcenejši test:</span> {s.validacija.test}
                </p>
                <p className="mt-1">
                  <span className="font-medium">Uspeh, če:</span> {s.validacija.kriterij_uspeha}
                </p>
                <p className="mt-1 text-xs text-emerald-800">
                  {[s.validacija.strosek && `strošek: ${s.validacija.strosek}`, s.validacija.trajanje && `trajanje: ${s.validacija.trajanje}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            ) : null}
            {r.stanje !== "koncano" && r.naloga ? (
              <p className="mt-3 text-xs text-zinc-500">Naslednji krog: {r.naloga}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Prvi krog še teče.</p>
        )}
      </Razdelek>

      <Razdelek naslov="Ali je raziskava dovolj dobra" opis="Pogoje preveri koda; ocenjevalec je ločen klic brez orodij, ki išče, kje rezultat ne drži.">
        <div className="grid gap-3 md:grid-cols-2">
          <ul className="space-y-1 rounded-xl bg-white p-4 text-sm ring-1 ring-zinc-200">
            {r.merila.length ? (
              r.merila.map((m) => (
                <li key={m.pogoj} className={m.izpolnjen ? "text-emerald-800" : "text-red-800"}>
                  {m.izpolnjen ? "✔" : "✘"} {m.pogoj}
                </li>
              ))
            ) : (
              <li className="text-zinc-400">Po prvem krogu.</li>
            )}
          </ul>
          <div className="rounded-xl bg-white p-4 text-sm ring-1 ring-zinc-200">
            {ocena?.ocene ? (
              <>
                <p className="font-medium text-zinc-900">
                  Ocenjevalec: {ocena.povprecje?.toLocaleString("sl-SI")} / 5 · {ocena.odlocitev === "zakljuci" ? "dovolj za odločitev" : "raziskuj naprej"}
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  {Object.entries(ocena.ocene)
                    .map(([k, v]) => `${k.replace("_", " ")} ${v}`)
                    .join(" · ")}
                </p>
                {ocena.povzetek ? <p className="mt-2 text-zinc-700">{ocena.povzetek}</p> : null}
                {ocena.nepodprto?.length ? (
                  <div className="mt-2">
                    <h3 className="text-xs font-medium text-zinc-500">Nepodprto</h3>
                    <Seznam elementi={ocena.nepodprto} />
                  </div>
                ) : null}
                {ocena.pretiravanje?.length ? (
                  <div className="mt-2">
                    <h3 className="text-xs font-medium text-zinc-500">Pretirano</h3>
                    <Seznam elementi={ocena.pretiravanje} />
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-zinc-400">Po prvem krogu.</p>
            )}
          </div>
        </div>
      </Razdelek>

      <Razdelek naslov="Hipoteze" opis="Tekmujoče razlage; raziskovalec mora iskati tudi dokaze proti.">
        {s.hipoteze?.length ? (
          <ul className="space-y-2">
            {s.hipoteze.map((h) => {
              const za = preverjeni.filter((d) => d.hipoteza === h.id && d.smer === "za").length;
              const proti = preverjeni.filter((d) => d.hipoteza === h.id && d.smer === "proti").length;
              return (
                <li key={h.id} className="rounded-xl bg-white p-3 text-sm ring-1 ring-zinc-200">
                  <p className="font-medium text-zinc-900">
                    {h.id}: {h.trditev} <span className="text-xs font-normal text-zinc-500">({h.stanje})</span>
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    preverjenih dokazov: {za} za, {proti} proti
                  </p>
                  {h.za ? <p className="mt-1 text-zinc-700">Za: {h.za}</p> : null}
                  {h.proti ? <p className="mt-1 text-zinc-700">Proti: {h.proti}</p> : null}
                  {h.kaj_bi_jo_ovrglo ? <p className="mt-1 text-xs text-zinc-500">Ovrglo bi jo: {h.kaj_bi_jo_ovrglo}</p> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-zinc-400">Še ni hipotez.</p>
        )}
      </Razdelek>

      <Razdelek
        naslov={`Dokazi (${r.dokazi.length})`}
        opis="Koda je vsako stran prebrala sama in odlomek poiskala dobesedno. Nepreverjeni dokazi se ne štejejo."
      >
        {r.dokazi.length ? (
          <ul className="space-y-2">
            {r.dokazi.map((d) => (
              <DokazVrstica key={d.id} d={d} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-400">Še ni dokazov.</p>
        )}
      </Razdelek>

      <Razdelek naslov="Konkurenti in obstoječe rešitve">
        {s.konkurenti?.length ? (
          <div className="overflow-x-auto rounded-xl ring-1 ring-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Rešitev</th>
                  <th className="px-3 py-2">Kaj reši</th>
                  <th className="px-3 py-2">Cena</th>
                  <th className="px-3 py-2">Slabosti</th>
                </tr>
              </thead>
              <tbody>
                {s.konkurenti.map((k) => (
                  <tr key={k.ime + k.url} className="border-t border-zinc-100 align-top">
                    <td className="px-3 py-2">
                      <Povezava url={k.url}>{k.ime}</Povezava>
                    </td>
                    <td className="px-3 py-2">{k.kaj_resi}</td>
                    <td className="px-3 py-2">{k.cena || "—"}</td>
                    <td className="px-3 py-2">{k.slabosti}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Še niso raziskani.</p>
        )}
      </Razdelek>

      <Razdelek naslov="Premišljene rešitve" opis="Tudi zavrnjene, z razlogom.">
        {s.resitve?.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {s.resitve.map((x) => (
              <li
                key={x.ime}
                className={`rounded-xl p-4 text-sm ring-1 ${x.stanje === "zavrnjena" ? "bg-zinc-50 text-zinc-500 ring-zinc-200" : "bg-white ring-zinc-300"}`}
              >
                <p className="font-medium text-zinc-900">
                  {x.ime} <span className="text-xs font-normal text-zinc-500">({x.vrsta}, {x.stanje})</span>
                </p>
                {x.stanje === "zavrnjena" && x.zakaj_zavrnjena ? <p className="mt-1">Zavrnjena: {x.zakaj_zavrnjena}</p> : null}
                <dl className="mt-2 space-y-1 text-xs">
                  {(
                    [
                      ["Kupec", x.kupec],
                      ["Problem", x.problem],
                      ["Danes", x.danes],
                      ["Zakaj boljše", x.zakaj_boljse],
                      ["Kaj dobi", x.kaj_dobi],
                      ["Do vrednosti", x.cas_do_vrednosti],
                      ["Cena (hipoteza)", x.cena_hipoteza],
                      ["Strošek izvedbe", x.strosek_izvedbe],
                      ["Zakaj ostane", x.zakaj_ostane],
                      ["Prvih 10", x.prvih_10],
                      ["Prvih 100", x.prvih_100],
                      ["Tveganja", x.tveganja],
                    ] as const
                  )
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt className="inline text-zinc-500">{k}: </dt>
                        <dd className="inline text-zinc-700">{v}</dd>
                      </div>
                    ))}
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-400">Še ni rešitev.</p>
        )}
      </Razdelek>

      <Razdelek naslov="Ekonomika" opis="Vsaka številka ima vir ali je označena kot predpostavka.">
        {s.ekonomika?.length ? (
          <div className="overflow-x-auto rounded-xl ring-1 ring-zinc-200">
            <table className="w-full text-sm">
              <tbody>
                {s.ekonomika.map((e) => (
                  <tr key={e.postavka} className="border-t border-zinc-100 first:border-t-0">
                    <td className="px-3 py-2 text-zinc-700">{e.postavka}</td>
                    <td className="px-3 py-2 font-medium text-zinc-900">{e.vrednost}</td>
                    <td className="px-3 py-2 text-xs text-zinc-500">
                      {e.osnova.startsWith("http") ? <Povezava url={e.osnova}>vir</Povezava> : e.osnova}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Še ni izračuna.</p>
        )}
        {Object.keys(r.stetje).length ? (
          <div className="mt-3 rounded-xl bg-white p-4 text-sm ring-1 ring-zinc-200">
            <h3 className="text-xs font-medium text-zinc-500">Naš register AJPES (preštela koda)</h3>
            <ul className="mt-1 space-y-1 text-zinc-700">
              {Object.values(r.stetje).map((x) => (
                <li key={x.skd}>
                  {x.napaka
                    ? `SKD ${x.skd}: ${x.napaka}`
                    : `SKD ${x.skd} ${x.naziv ?? ""}: ${x.aktivnih} aktivnih, od tega ${x.druzb} družb (${x.druzb_z_eposto} z objavljeno e-pošto), ${x.ne_druzb} ostalih (večinoma s.p.)`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Razdelek>

      <Razdelek naslov="Pot do prvih kupcev">
        {s.pot_do_kupcev?.idealna_stranka || s.pot_do_kupcev?.kanali?.length ? (
          <div className="rounded-xl bg-white p-4 text-sm ring-1 ring-zinc-200">
            <p>
              <span className="text-zinc-500">Idealna stranka:</span> {s.pot_do_kupcev.idealna_stranka}
            </p>
            <ul className="mt-2 space-y-1">
              {s.pot_do_kupcev.kanali.map((k) => (
                <li key={k.kanal}>
                  <span
                    className={`mr-2 rounded-full px-2 py-0.5 text-xs ${k.zakonito === "da" ? "bg-emerald-100 text-emerald-900" : k.zakonito === "ne" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}
                  >
                    {k.zakonito === "da" ? "zakonito" : k.zakonito === "ne" ? "ni dovoljeno" : "preveriti"}
                  </span>
                  {k.kanal} — <span className="text-zinc-600">{k.zakaj}</span>
                </li>
              ))}
            </ul>
            {s.pot_do_kupcev.prvi_stik ? (
              <p className="mt-2">
                <span className="text-zinc-500">Prvi stik:</span> {s.pot_do_kupcev.prvi_stik}
              </p>
            ) : null}
            {s.pot_do_kupcev.vprasanja_za_pogovor?.length ? (
              <div className="mt-2">
                <h3 className="text-xs font-medium text-zinc-500">Vprašanja za pogovor</h3>
                <Seznam elementi={s.pot_do_kupcev.vprasanja_za_pogovor} />
              </div>
            ) : null}
            {s.pot_do_kupcev.ugovori?.length ? (
              <div className="mt-2">
                <h3 className="text-xs font-medium text-zinc-500">Pričakovani ugovori</h3>
                <Seznam elementi={s.pot_do_kupcev.ugovori} />
              </div>
            ) : null}
            {s.pot_do_kupcev.kdaj_opustimo ? (
              <p className="mt-2 text-xs text-zinc-600">Opustimo, če: {s.pot_do_kupcev.kdaj_opustimo}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Še ni načrta.</p>
        )}
      </Razdelek>

      <Razdelek naslov="Kaj je agent res naredil" opis="Vsak korak je zapisala koda iz poteka orodij, ne iz agentovega poročila.">
        {krogi.length ? (
          <div className="space-y-2">
            {krogi.map((k) => (
              <KrogDela key={k} krog={k} koraki={r.koraki.filter((x) => x.krog === k)} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Še nič.</p>
        )}
      </Razdelek>

      <Razdelek naslov="Življenjski cikel" opis="Od validacije naprej samo z zapisanim resničnim signalom; besedilo modela ni dokaz povpraševanja.">
        <ol className="space-y-1 text-sm text-zinc-700">
          {r.faze.map((f, i) => (
            <li key={i}>
              <span className="text-xs text-zinc-400">{cas(f.cas)}</span> {OZNAKE_FAZ[f.faza] ?? f.faza}
              {f.opomba ? <span className="text-zinc-500"> — {f.opomba}</span> : null}
            </li>
          ))}
        </ol>
        <FazaObrazec id={r.id} trenutna={r.faza} />
      </Razdelek>
    </div>
  );
}
