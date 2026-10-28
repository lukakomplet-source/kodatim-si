"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, Folder, Mail } from "lucide-react";
import type { MapaOdobritve as Mapa, Postavka } from "@/lib/prodajna-ekipa";
import { oznaciVMapiAkcija } from "./actions";
import { OdobritevSeznam } from "./OdobritevSeznam";

/**
 * Mapa v Odobritvi (Luka, 28. 10. 2026: »dodaj jih v neko mapo … dodaj tut analitiko, kolkim si poslal,
 * kolko jih je odpisal, kolko si jim poslal followup prek maila ali klica, s kolkimi smo začel delat«).
 * Zgoraj lijak, spodaj osnutki, ki čakajo, in podjetja, ki jim je šel prvi mail. Klic in »začeli delati«
 * označi Luka, ostalo šteje Harvey sam.
 */

type Stopnja = "poslano" | "odgovoril" | "follow_up" | "klic" | "posel";

/** Kako je Harvey razumel odgovor (intent iz handlerja). */
const NAMENI: Record<string, string> = {
  interested: "zanima jih",
  not_interested: "ne zanima jih",
  objection: "pomislek",
  question: "vprašanje",
  meeting_request: "želijo sestanek",
  out_of_office: "odsotni",
  unsubscribe: "odjava",
  referral: "napotili na drugega",
};

function odstotek(del: number, vse: number): string {
  return vse ? ` · ${Math.round((100 * del) / vse)} %` : "";
}

export function MapaOdobritve({ mapa, postavke }: { mapa: Mapa; postavke: Postavka[] }) {
  const [odprta, setOdprta] = useState(true);
  const [izbrana, setIzbrana] = useState<Stopnja | null>(null);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [cakam, zacni] = useTransition();
  const kompletko = mapa.lastnik === "kompletko";
  // Hoteli (KodaTim): Luka maile pošlje sam iz Outlooka (Harvey harvey/outlook.py), kot pri panik gumbu.
  const sam = kompletko || Boolean(mapa.outlook);
  const [odpiram, setOdpiram] = useState<string | null>(null);
  const [odprti, setOdprti] = useState<Set<string>>(new Set());
  const prvi = postavke.filter((p) => !p.vrsta || p.vrsta === "prvi");
  const nadaljnji = postavke.filter((p) => p.vrsta === "follow_up" || p.vrsta === "odgovor");

  const lijak: { kljuc: Stopnja; ime: string; n: number; opis: string }[] = [
    { kljuc: "poslano", ime: "Poslano", n: mapa.poslano, opis: "prvi mail" },
    { kljuc: "odgovoril", ime: "Odpisali", n: mapa.odgovoril, opis: `odgovor${odstotek(mapa.odgovoril, mapa.poslano)}` },
    { kljuc: "follow_up", ime: "Follow-up po mailu", n: mapa.follow_up, opis: "drugi mail v niti" },
    { kljuc: "klic", ime: "Klic", n: mapa.klic, opis: "označiš ti" },
    { kljuc: "posel", ime: "Začeli delati", n: mapa.posel, opis: `konverzija${odstotek(mapa.posel, mapa.poslano)}` },
  ];
  const izbranaStopnja = lijak.find((k) => k.kljuc === izbrana);
  // Luka 28. 10.: kdor je odpisal, je samo pod »Odpisali«; številka na ploščici ostane osnova za odstotke.
  const vStopnji = mapa.podjetja.filter((p) => (izbrana === "poslano" ? !p.odgovoril : izbrana ? p[izbrana] : false));

  async function odpriVOutlooku(id: string) {
    setNapaka(null);
    setOdpiram(id);
    try {
      const r = await fetch(`/api/admin/prodajna-ekipa/outlook/${encodeURIComponent(id)}`, { method: "POST" });
      const data = (await r.json().catch(() => ({}))) as { ok?: boolean; napaka?: string };
      if (!r.ok || !data.ok) setNapaka(data.napaka ?? "Outlook mail ni odprl.");
      else setOdprti((prej) => new Set(prej).add(id));
    } catch {
      setNapaka("Outlook mail ni odprl.");
    } finally {
      setOdpiram(null);
    }
  }

  function oznaci(id: string, kaj: "klic" | "posel", da: boolean) {
    setNapaka(null);
    zacni(async () => {
      const r = await oznaciVMapiAkcija(id, kaj, da);
      if (!r.ok) setNapaka(r.napaka ?? "Napaka.");
    });
  }

  return (
    <section className="rounded-2xl bg-white ring-1 ring-zinc-200">
      <button
        type="button"
        onClick={() => setOdprta(!odprta)}
        aria-expanded={odprta}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Folder className="h-5 w-5 shrink-0 text-amber-500" aria-hidden />
          <span className="truncate text-base font-semibold text-zinc-900">{mapa.ime}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-sm text-zinc-500">
          {(mapa.outlook ? 0 : postavke.length) + (mapa.osnutki?.length ?? 0)} čaka
          <ChevronDown className={`h-4 w-4 transition-transform ${odprta ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </button>

      {odprta ? (
        <div className="border-t border-zinc-100 px-4 pb-4 pt-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {lijak.map((k) => {
              const je = izbrana === k.kljuc;
              return (
                <button
                  key={k.kljuc}
                  type="button"
                  onClick={() => setIzbrana(je ? null : k.kljuc)}
                  aria-expanded={je}
                  className={`group cursor-pointer rounded-xl px-3 py-2.5 text-left ring-1 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                    je ? "bg-sky-50 ring-2 ring-sky-500" : "bg-zinc-50 ring-zinc-200 hover:bg-white hover:ring-sky-400"
                  }`}
                >
                  <span className="flex items-center justify-between text-xs font-medium text-zinc-500">
                    {k.ime}
                    <span className={`text-sky-600 ${je ? "" : "opacity-0 group-hover:opacity-100"}`}>
                      {je ? "Skrij" : "Pokaži ›"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-2xl font-semibold text-zinc-900">{k.n}</span>
                  <span className="block text-[11px] text-zinc-400">{k.opis}</span>
                </button>
              );
            })}
          </div>
          {mapa.odjava > 0 ? <p className="mt-2 text-xs text-zinc-500">Odjavljenih: {mapa.odjava}</p> : null}

          {izbranaStopnja ? (
            <div className="mt-3 rounded-xl bg-sky-50/50 p-3 ring-1 ring-sky-200">
              <p className="mb-2 text-sm font-semibold text-zinc-900">
                {izbrana === "poslano" ? "Poslano, brez odgovora" : izbranaStopnja.ime} ({vStopnji.length})
              </p>
              {kompletko ? (
                <p className="mb-2 text-xs text-zinc-500">
                  Stanje (klic, sestanek, kupil) urediš na{" "}
                  <Link href="/admin/prodajna-ekipa/kompletko" className="underline underline-offset-2">
                    Kompletko: prevozniki
                  </Link>
                  .
                </p>
              ) : null}
              {vStopnji.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  {izbrana === "klic" || izbrana === "posel"
                    ? kompletko
                      ? "Še nobeno podjetje."
                      : "Še nobeno podjetje. Označiš ga pri »Poslano«."
                    : "Še nobeno podjetje."}
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100 rounded-xl bg-white ring-1 ring-zinc-200">
                  {vStopnji.map((p) => (
                    <li key={p.id} className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-900">{p.podjetje}</p>
                          <p className="truncate text-xs text-zinc-500">
                            {p.email} · poslano {new Date(p.poslano).toLocaleDateString("sl-SI")}
                            {p.odgovoril ? " · odpisal" : ""}
                            {p.odjava ? " · odjava" : ""}
                            {p.follow_up ? " · follow-up poslan" : ""}
                          </p>
                        </div>
                        {kompletko ? (
                          <span className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">
                            varianta {p.varianta || "?"}
                            {p.namen ? ` · ${p.namen}` : ""}
                            <Link
                              href={`/admin/prodajna-ekipa/poslano/${encodeURIComponent(p.id)}`}
                              className="rounded-full px-3 py-1 font-medium text-zinc-700 ring-1 ring-zinc-300 hover:ring-zinc-500"
                            >
                              Poglej mail
                            </Link>
                          </span>
                        ) : (
                        <div className="flex shrink-0 gap-1.5">
                          <Link
                            href={`/admin/prodajna-ekipa/poslano-kodatim/${encodeURIComponent(p.id)}`}
                            className="rounded-full px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-300 hover:ring-zinc-500"
                          >
                            Poglej mail
                          </Link>
                          {p.predlog ? (
                            <a
                              href={`/predlog/${p.predlog}?interno`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-full px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-300 hover:ring-zinc-500"
                            >
                              Predlog
                            </a>
                          ) : null}
                          <Preklop vkljucen={p.klic} onemogoceno={cakam} onClick={() => oznaci(p.id, "klic", !p.klic)}>
                            Klic
                          </Preklop>
                          <Preklop vkljucen={p.posel} onemogoceno={cakam} onClick={() => oznaci(p.id, "posel", !p.posel)}>
                            Začeli delati
                          </Preklop>
                        </div>
                        )}
                      </div>
                      {p.odgovor ? (
                        <div className="mt-2 rounded-lg border-l-2 border-emerald-400 bg-emerald-50/60 px-3 py-2">
                          <p className="text-[11px] font-medium text-emerald-800">
                            Njihov odgovor{p.namen ? ` · ${NAMENI[p.namen] ?? p.namen}` : ""}
                          </p>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-zinc-800">{p.odgovor}</p>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {napaka ? <p className="mt-2 text-sm text-red-700">{napaka}</p> : null}
            </div>
          ) : null}

          {sam ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-zinc-900">Pripravljeni maili ({mapa.osnutki?.length ?? 0})</h3>
              <p className="mb-2 text-xs text-zinc-500">
                »Odpri v Outlooku« odpre mail s prilogami iz {kompletko ? "luka@kompletko.com" : "luka@kodatim.si"}.
                Preglej, popravi in pošlji sam; ko je poslan, izgine od tu.
              </p>
              {mapa.osnutki?.length ? (
                <ul className="divide-y divide-zinc-100 rounded-xl bg-white ring-1 ring-zinc-200">
                  {mapa.osnutki.map((o) => (
                    <li key={o.ime ?? o.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        {o.vrsta === "follow_up" ? (
                          <span className="mb-1 inline-block rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-900">
                            Follow-up
                          </span>
                        ) : null}
                        <p className="truncate text-sm font-semibold text-zinc-900">{o.za}</p>
                        <p className="truncate text-sm text-zinc-700">Zadeva: {o.zadeva}</p>
                        {o.id && (o.odprt || odprti.has(o.id)) ? (
                          <p className="mt-0.5 text-xs font-medium text-emerald-700">
                            V Outlooku med Osnutki – pošlji ga od tam; ko ga pošlješ, izgine od tu.
                          </p>
                        ) : null}
                      </div>
                      {mapa.outlook && o.id ? (
                        <button
                          type="button"
                          disabled={odpiram !== null}
                          onClick={() => odpriVOutlooku(o.id as string)}
                          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#0F6CBD] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#115EA3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:opacity-60"
                        >
                          <Mail className="h-4 w-4" aria-hidden />
                          {odpiram === o.id ? "Odpiram …" : "Odpri v Outlooku"}
                        </button>
                      ) : (
                        <a
                          href={`/api/admin/prodajna-ekipa/eml/${encodeURIComponent(o.ime ?? "")}`}
                          download={o.ime}
                          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#0F6CBD] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#115EA3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                        >
                          <Mail className="h-4 w-4" aria-hidden />
                          Odpri v Outlooku
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">Trenutno ni pripravljenega maila.</p>
              )}
              {napaka && !izbranaStopnja ? <p className="mt-2 text-sm text-red-700">{napaka}</p> : null}
            </div>
          ) : postavke.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">V tej mapi nič ne čaka na odobritev.</p>
          ) : null}
          {!mapa.outlook && prvi.length > 0 ? (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-zinc-900">Prvi maili ({prvi.length})</h3>
              <OdobritevSeznam postavke={prvi} />
            </div>
          ) : null}
          {!mapa.outlook && nadaljnji.length > 0 ? (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-zinc-900">Follow-upi in odgovori ({nadaljnji.length})</h3>
              <p className="mb-2 text-xs text-zinc-500">
                Follow-up se pokaže, ko odobriš prvi mail; gre ven nekaj dni za njim, v isti niti.
              </p>
              <OdobritevSeznam postavke={nadaljnji} />
            </div>
          ) : null}

        </div>
      ) : null}
    </section>
  );
}

function Preklop({
  vkljucen,
  onemogoceno,
  onClick,
  children,
}: {
  vkljucen: boolean;
  onemogoceno: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={onemogoceno}
      aria-pressed={vkljucen}
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 disabled:opacity-50 ${
        vkljucen ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-zinc-700 ring-zinc-300 hover:ring-zinc-500"
      }`}
    >
      {vkljucen ? "✓ " : ""}
      {children}
    </button>
  );
}
