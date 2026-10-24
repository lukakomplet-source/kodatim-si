"use client";

import { useState, useTransition } from "react";
import type { Postavka } from "@/lib/prodajna-ekipa";
import { RAZLOGI_ZAVRNITVE, type RazlogZavrnitve, type Zavrnitev } from "@/lib/razlogiZavrnitve";
import { odlociOsnutekAkcija, popraviOsnutekAkcija } from "./actions";
import { RazmisljanjeKartica } from "./RazmisljanjeKartica";

/**
 * Osnutki, ki čakajo na odobritev, s celim besedilom in gumboma. Odločen
 * osnutek takoj izgine s seznama; ob napaki ostane in pokaže zakaj.
 * Besedilo lahko Luka pred odobritvijo uredi — doda svojo človeško opombo.
 * Ob zavrnitvi izbere razlog (shrani se za učenje) in po želji »Napiši znova«:
 * Harvey naredi novo različico in upošteva njegovo opombo.
 */
export function OdobritevSeznam({ postavke }: { postavke: Postavka[] }) {
  const [odloceni, setOdloceni] = useState<Record<string, "odobreno" | "zavrnjeno">>({});
  const [napake, setNapake] = useState<Record<string, string>>({});
  const [urejeno, setUrejeno] = useState<Record<string, string>>({});
  const [cakam, zacni] = useTransition();
  const [odprt, setOdprt] = useState<string | null>(postavke[0]?.id ?? null);
  const [zavracam, setZavracam] = useState<string | null>(null);
  const [razlog, setRazlog] = useState<RazlogZavrnitve | "">("");
  const [opomba, setOpomba] = useState("");
  const [popravljam, setPopravljam] = useState<string | null>(null);
  const [popravek, setPopravek] = useState("");
  const [poslanPopravek, setPoslanPopravek] = useState<Record<string, boolean>>({});

  function popravi(id: string) {
    zacni(async () => {
      const r = await popraviOsnutekAkcija(id, popravek);
      if (r.ok) {
        setPoslanPopravek((o) => ({ ...o, [id]: true }));
        setPopravljam(null);
        setPopravek("");
      } else {
        setNapake((n) => ({ ...n, [id]: r.napaka ?? "Napaka." }));
      }
    });
  }

  const ostali = postavke.filter((p) => p.id && !odloceni[p.id]);

  function odloci(id: string, odobri: boolean, izvirnik?: string, zavrnitev?: Zavrnitev) {
    const novo = urejeno[id];
    const besedilo = odobri && novo !== undefined && novo !== izvirnik ? novo : undefined;
    zacni(async () => {
      const r = await odlociOsnutekAkcija(id, odobri, besedilo, zavrnitev);
      if (r.ok) {
        setOdloceni((o) => ({ ...o, [id]: odobri ? "odobreno" : "zavrnjeno" }));
        setNapake((n) => {
          const kopija = { ...n };
          delete kopija[id];
          return kopija;
        });
        setZavracam(null);
        setRazlog("");
        setOpomba("");
      } else {
        setNapake((n) => ({ ...n, [id]: r.napaka ?? "Napaka." }));
      }
    });
  }

  const steviloOdlocenih = Object.keys(odloceni).length;

  if (ostali.length === 0) {
    return (
      <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
        {steviloOdlocenih > 0
          ? `Odločil si o ${steviloOdlocenih} osnutkih. Nič več ne čaka.`
          : "Nič ne čaka na odobritev."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {steviloOdlocenih > 0 ? (
        <p className="text-xs text-zinc-500">Odločeno: {steviloOdlocenih}</p>
      ) : null}
      {ostali.map((p) => {
        const id = p.id as string;
        const jeOdprt = odprt === id;
        return (
          <div key={id} className="rounded-xl bg-white ring-1 ring-zinc-200">
            <button
              type="button"
              onClick={() => setOdprt(jeOdprt ? null : id)}
              className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900">{p.naslov}</p>
                <p className="truncate text-xs text-zinc-500">{p.podnaslov}</p>
                <p className="mt-1 truncate text-sm text-zinc-700">Zadeva: {p.zadeva}</p>
              </div>
              <span className="shrink-0 text-xs text-zinc-400">{jeOdprt ? "skrij" : "preberi"}</span>
            </button>
            {jeOdprt ? (
              <div className="border-t border-zinc-100 px-4 py-3">
                {urejeno[id] !== undefined ? (
                  <textarea
                    value={urejeno[id]}
                    onChange={(e) => setUrejeno((u) => ({ ...u, [id]: e.target.value }))}
                    rows={18}
                    className="w-full rounded-lg border border-zinc-300 p-3 font-sans text-sm leading-relaxed text-zinc-800 focus:border-zinc-500 focus:outline-none"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-800">
                    {p.besedilo}
                  </pre>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setUrejeno((u) => {
                      const kopija = { ...u };
                      if (kopija[id] === undefined) kopija[id] = p.besedilo ?? "";
                      else delete kopija[id];
                      return kopija;
                    })
                  }
                  className="mt-2 text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
                >
                  {urejeno[id] !== undefined ? "Prekliči urejanje" : "Uredi besedilo (dodaj svojo opombo)"}
                </button>
                {p.razmisljanje ? <RazmisljanjeKartica r={p.razmisljanje} /> : null}
                {p.dokazi && p.dokazi.length > 0 ? (
                  <div className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200">
                    <p className="text-xs font-medium text-zinc-600">Na čem stoji predlog</p>
                    <ul className="mt-1 space-y-1 text-xs leading-relaxed text-zinc-700">
                      {p.dokazi.map((d, i) => (
                        <li key={i}>
                          {d.besedilo}{" "}
                          {/^https?:\/\//.test(d.vir) ? (
                            <a
                              href={d.vir}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-zinc-500 underline underline-offset-2 hover:text-zinc-900"
                            >
                              vir
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {p.oznake && p.oznake.length > 0 ? (
                  <p className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-xs leading-relaxed text-violet-900 ring-1 ring-violet-200">
                    {p.oznake.join(" · ")}
                  </p>
                ) : null}
                {p.predlog ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    <span className="self-center text-xs text-zinc-500">Priloženo in povezano:</span>
                    <a
                      href={`/predlog/${p.predlog}?interno`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-zinc-100 px-3 py-1.5 font-medium text-zinc-800 hover:bg-zinc-200"
                    >
                      Odpri predlog
                    </a>
                    <a
                      href={`/predlog/${p.predlog}/priloga/ponudba.pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-zinc-100 px-3 py-1.5 font-medium text-zinc-800 hover:bg-zinc-200"
                    >
                      Odpri PDF
                    </a>
                    <a
                      href={`/predlog/${p.predlog}/priloga/predogled-racunalnik.jpg`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-zinc-100 px-3 py-1.5 font-medium text-zinc-800 hover:bg-zinc-200"
                    >
                      Slika: računalnik
                    </a>
                    <a
                      href={`/predlog/${p.predlog}/priloga/predogled-telefon.jpg`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-zinc-100 px-3 py-1.5 font-medium text-zinc-800 hover:bg-zinc-200"
                    >
                      Slika: telefon
                    </a>
                  </div>
                ) : null}
                {napake[id] ? <p className="mt-2 text-sm text-red-700">{napake[id]}</p> : null}
                {poslanPopravek[id] ? (
                  <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 ring-1 ring-sky-200">
                    Popravljam po tvoji opombi … Ko bo nared, dobiš Telegram in osnutek bo tu posodobljen.
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={cakam}
                    onClick={() => odloci(id, true, p.besedilo)}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Odobri
                  </button>
                  <button
                    type="button"
                    disabled={cakam}
                    onClick={() => {
                      setZavracam(zavracam === id ? null : id);
                      setRazlog("");
                      setOpomba("");
                    }}
                    className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-zinc-300 disabled:opacity-50"
                  >
                    {zavracam === id ? "Prekliči" : "Zavrni …"}
                  </button>
                  <button
                    type="button"
                    disabled={cakam}
                    onClick={() => {
                      setPopravljam(popravljam === id ? null : id);
                      setPopravek("");
                      setZavracam(null);
                    }}
                    className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-sky-800 ring-1 ring-sky-300 disabled:opacity-50"
                  >
                    {popravljam === id ? "Prekliči popravek" : "Popravi …"}
                  </button>
                </div>
                {popravljam === id ? (
                  <div className="mt-3 rounded-lg bg-sky-50 p-3 ring-1 ring-sky-200">
                    <p className="text-xs font-medium text-sky-900">Kaj naj popravi? Osnutek ostane, opomba velja tudi za vse naslednje.</p>
                    <textarea
                      value={popravek}
                      onChange={(e) => setPopravek(e.target.value)}
                      maxLength={1200}
                      rows={3}
                      placeholder="npr. »odstrani ceno, dodaj nadgradnjo z AI klici, prva alineja bolj konkretno«"
                      className="mt-2 w-full rounded-lg border border-sky-300 bg-white p-2 text-sm text-zinc-800 focus:border-sky-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={cakam || popravek.trim().length < 3}
                      onClick={() => popravi(id)}
                      className="mt-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Popravi
                    </button>
                  </div>
                ) : null}
                {zavracam === id ? (
                  <div className="mt-3 rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
                    <p className="text-xs font-medium text-zinc-600">Zakaj ne?</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(Object.keys(RAZLOGI_ZAVRNITVE) as RazlogZavrnitve[]).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setRazlog(razlog === k ? "" : k)}
                          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                            razlog === k
                              ? "bg-zinc-900 text-white ring-zinc-900"
                              : "bg-white text-zinc-700 ring-zinc-300 hover:ring-zinc-500"
                          }`}
                        >
                          {RAZLOGI_ZAVRNITVE[k]}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={opomba}
                      onChange={(e) => setOpomba(e.target.value)}
                      maxLength={600}
                      rows={2}
                      placeholder="Kaj naj popravi (neobvezno), npr. »raje B2B portal, več o njihovih izdelkih«"
                      className="mt-2 w-full rounded-lg border border-zinc-300 p-2 text-sm text-zinc-800 focus:border-zinc-500 focus:outline-none"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={cakam || (!razlog && !opomba.trim())}
                        onClick={() =>
                          odloci(id, false, undefined, { razlog: razlog || undefined, opomba: opomba.trim(), znova: true })
                        }
                        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        Napiši znova
                      </button>
                      <button
                        type="button"
                        disabled={cakam}
                        onClick={() =>
                          odloci(id, false, undefined, { razlog: razlog || undefined, opomba: opomba.trim() })
                        }
                        className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-red-700 ring-1 ring-red-200 disabled:opacity-50"
                      >
                        Zavrni dokončno
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      »Napiši znova« naredi novo različico z novo raziskavo in tvojo opombo, pri naslednjem krogu pisca.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
