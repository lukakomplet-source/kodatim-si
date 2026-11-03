"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, FlaskConical, Lock, Send } from "lucide-react";
import type { OsnutekPanik, PoselPanik, PostavkaPosla, StanjePanik, VnosDnevnika } from "@/lib/komunikacija";
import {
  napredekPoslaAkcija,
  posljiPanikAkcija,
  posljiTestAkcija,
  potrdiTestAkcija,
  type VrstaPreverjanja,
} from "./actions";

/**
 * Kompletko panik osnutki v Pregledu (faza 5). Osnutki so razvrščeni po obliki (enaka zadeva, priloge in animacija):
 * 1) nova oblika: »Pošlji TEST« (en mail samo na Lukov Gmail), 2) »Test je v redu«, 3) izbereš osnutke in »Pošlji N
 * mailov« s potrditvijo, kjer so našteti vsi prejemniki. Paket teče na Harveyju Kompletko, 20 s med maili; tu se vidi
 * napredek. Kdor ni administrator, vidi samo seznam (brez gumbov).
 */

const STANJE_POSTAVKE: Record<PostavkaPosla["stanje"], { ime: string; barva: string }> = {
  caka: { ime: "čaka na vrsto", barva: "text-zinc-500" },
  poslano: { ime: "poslano", barva: "text-emerald-700" },
  preskoceno: { ime: "preskočeno", barva: "text-amber-700" },
  napaka: { ime: "napaka", barva: "text-red-700" },
  ustavljeno: { ime: "ustavljeno", barva: "text-red-700" },
};

const VRSTA_DNEVNIKA: Record<string, string> = {
  test: "TEST poslan",
  potrditev: "test potrjen",
  zavrnitev: "test zavrnjen",
  poslano: "poslano",
  preskoceno: "preskočeno",
  napaka: "napaka",
  posiljam: "pošiljam (pred SMTP)",
  "test-posiljam": "TEST: pošiljam",
  "napaka-pred-smtp": "ni šel (SMTP zavrnil)",
};

/** Slovenska množina: 1 mail, 2 maila, 3–4 maile, 5+ mailov. */
function mnozina(n: number, oblike: [string, string, string, string]): string {
  const o = n % 100;
  return o === 1 ? oblike[0] : o === 2 ? oblike[1] : o === 3 || o === 4 ? oblike[2] : oblike[3];
}
const MAIL: [string, string, string, string] = ["mail", "maila", "maile", "mailov"];
const OSNUTEK: [string, string, string, string] = ["osnutek", "osnutka", "osnutki", "osnutkov"];

function kdaj(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Zakaj osnutka zdaj ne moreš poslati (prazno = lahko, ko je oblika odklenjena). */
function zadrzki(o: OsnutekPanik): string[] {
  const z: string[] = [];
  if (o.ovire) z.push(...o.ovire);
  else {
    // Harvey Kompletko not restarted yet: only the two reasons the old list knew.
    if (o.najprejKlic) z.push("najprej klic (mail samo, če ne dvigne)");
    if (o.zadrzan) z.push("dogovorjen klic, pred njim ni maila");
  }
  if (o.vsebina.length) z.push(...o.vsebina);
  return z;
}

type Skupina = { kljuc: string; oblika: string; otisk: string; test: OsnutekPanik["test"]; osnutki: OsnutekPanik[] };

/** Kaj preveriti v testnem mailu: prvi mail ima animacijo in priloge, follow-up samo besedilo. */
function kajPreveriti(s: Skupina): string {
  return s.osnutki[0]?.vrsta === "prvi"
    ? "zadevo, besedilo, animacijo in priloge, če jih ima"
    : "zadevo in besedilo";
}

export function PosiljanjePanik({ stanje, jeAdmin }: { stanje: StanjePanik; jeAdmin: boolean }) {
  const [posel, setPosel] = useState<PoselPanik | null>(stanje.tece ? stanje.posel : null);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [sporocilo, setSporocilo] = useState<string | null>(null);
  const [izbrani, setIzbrani] = useState<Set<string>>(new Set());
  const [potrditev, setPotrditev] = useState<OsnutekPanik[] | null>(null);
  const [preskoceni, setPreskoceni] = useState<VrstaPreverjanja[]>([]);
  const [cakam, zacni] = useTransition();
  const tece = posel?.stanje === "tece";
  const poselId = posel?.id;

  const skupine = useMemo(() => {
    const m = new Map<string, Skupina>();
    for (const o of stanje.osnutki) {
      const k = `${o.oblika}|${o.otisk}`;
      const s = m.get(k) ?? { kljuc: k, oblika: o.oblika, otisk: o.otisk, test: o.test, osnutki: [] };
      s.osnutki.push(o);
      m.set(k, s);
    }
    // Sendable formats first, then those that wait for a test, then the rest.
    const red = { potrjen: 0, poslan: 1, ni: 2, zavrnjen: 3 } as const;
    return [...m.values()].sort((a, b) => red[a.test] - red[b.test] || b.osnutki.length - a.osnutki.length);
  }, [stanje.osnutki]);

  // Poll the running batch every 4 s until it ends; stop after 3 failed reads in a row and say so.
  useEffect(() => {
    if (!tece || !poselId) return;
    let neuspehi = 0;
    const t = setInterval(async () => {
      const r = await napredekPoslaAkcija(poselId).catch(() => ({ ok: false as const, posel: undefined }));
      if (r.ok && r.posel) {
        neuspehi = 0;
        setPosel(r.posel);
        return;
      }
      neuspehi += 1;
      if (neuspehi >= 3) {
        clearInterval(t);
        setNapaka("Napredka pošiljanja ni mogoče prebrati (Harvey Kompletko ne odgovarja). Osveži stran čez minuto.");
      }
    }, 4_000);
    return () => clearInterval(t);
  }, [tece, poselId]);

  function izberi(ime: string, da: boolean) {
    setIzbrani((prej) => {
      const nov = new Set(prej);
      if (da) {
        if (nov.size >= stanje.najvec) return prej;
        nov.add(ime);
      } else nov.delete(ime);
      return nov;
    });
  }

  function test(o: OsnutekPanik) {
    const ok = window.confirm(
      `Poslal bom EN testni mail z zadevo »TEST: …« SAMO na ${stanje.testNaslov}.\n\n` +
        `Osnutek: ${o.ime}\nStrankam ne gre nič. Za to obliko se test pošlje samo enkrat.\n\nNadaljujem?`,
    );
    if (!ok) return;
    setNapaka(null);
    setSporocilo(null);
    zacni(async () => {
      const r = await posljiTestAkcija(o.ime);
      if (!r.ok) setNapaka([r.napaka, ...(r.razlogi ?? [])].filter(Boolean).join(" · "));
      else
        setSporocilo(
          `TEST je poslan na ${stanje.testNaslov}. Odpri Gmail in preglej zadevo, besedilo ter animacijo in priloge, če jih ima.`,
        );
    });
  }

  function potrdi(s: Skupina, vRedu: boolean) {
    let razlog = "";
    if (vRedu) {
      if (!window.confirm(`Si v Gmailu pregledal testni mail (${kajPreveriti(s)}) in je v redu?`)) return;
    } else {
      razlog = window.prompt("Kaj ni v redu? (oblika ostane zaklenjena; popravljen osnutek je nova oblika)") ?? "";
      if (!razlog.trim()) return;
    }
    setNapaka(null);
    setSporocilo(null);
    zacni(async () => {
      const r = await potrdiTestAkcija(s.oblika, s.otisk, vRedu, razlog);
      if (!r.ok) setNapaka(r.napaka ?? "Napaka.");
      else setSporocilo(vRedu ? "Oblika je odklenjena. Izberi maile in klikni Pošlji." : "Oblika je zaklenjena.");
    });
  }

  function poslji() {
    if (!potrditev) return;
    const imena = potrditev.map((o) => o.ime);
    setPotrditev(null);
    setNapaka(null);
    setSporocilo(null);
    setPreskoceni([]);
    zacni(async () => {
      const r = await posljiPanikAkcija(imena, true);
      setPreskoceni((r.vrsta ?? []).filter((v) => !v.ok));
      if (!r.ok || !r.posel) {
        setNapaka(r.napaka ?? "Pošiljanje se ni začelo.");
        return;
      }
      setIzbrani(new Set());
      const n = await napredekPoslaAkcija(r.posel);
      if (n.ok && n.posel) setPosel(n.posel);
      setSporocilo("Pošiljanje teče. Med maili je 20 s premora; lahko zapreš stran, Harvey pošilja naprej.");
    });
  }

  const izbraniOsnutki = stanje.osnutki.filter((o) => izbrani.has(o.ime));

  return (
    <div className="space-y-4">
      {posel ? <Paket posel={posel} presledekS={stanje.presledekS} /> : null}

      {napaka ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">{napaka}</p> : null}
      {sporocilo ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">{sporocilo}</p>
      ) : null}
      {preskoceni.length ? (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-medium">Ti ne gredo ven:</p>
          <ul className="mt-1 list-disc pl-5">
            {preskoceni.map((v) => (
              <li key={v.ime}>
                {v.za || v.ime}: {v.razlogi.join("; ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!skupine.length ? <p className="text-sm text-zinc-500">Ni osnutkov panik gumba.</p> : null}

      {skupine.map((s) => {
        const prvi = s.osnutki.find((o) => !o.vsebina.length);
        const pripravljeni = s.osnutki.filter((o) => !zadrzki(o).length);
        return (
          <section key={s.kljuc} className="rounded-2xl bg-white ring-1 ring-zinc-200">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900">
                  {s.osnutki[0].vrsta === "prvi" ? "Prvi mail" : "Follow-up"} · {s.osnutki.length}{" "}
                  {mnozina(s.osnutki.length, OSNUTEK)}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  Zadeva: {s.osnutki[0].zadeva} · oblika {s.oblika}
                </p>
              </div>
              <ZnackaTesta test={s.test} />
            </div>

            {jeAdmin ? (
              <div className="border-b border-zinc-100 bg-zinc-50/60 px-4 py-3 text-sm">
                {s.test === "ni" ? (
                  prvi ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="max-w-xl text-zinc-700">
                        <b>1. korak: test.</b> Ta oblika še ni šla ven. Najprej gre EN testni mail samo na{" "}
                        {stanje.testNaslov}. Strankam ne gre nič, dokler testa ne potrdiš.
                      </p>
                      <button
                        type="button"
                        disabled={cakam || tece}
                        onClick={() => test(prvi)}
                        className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
                      >
                        <FlaskConical className="h-4 w-4" aria-hidden />
                        {cakam ? "Pošiljam test …" : "Pošlji TEST meni"}
                      </button>
                    </div>
                  ) : (
                    <p className="text-red-700">Noben osnutek te oblike ne izpolnjuje pravil vsebine, zato testa ni.</p>
                  )
                ) : s.test === "poslan" ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="max-w-xl text-zinc-700">
                      <b>2. korak: preglej test.</b> TEST je v Gmailu ({stanje.testNaslov}). Preveri {kajPreveriti(s)}. Do
                      potrditve je paket zaklenjen.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={cakam}
                        onClick={() => potrdi(s, true)}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                        Test je v redu
                      </button>
                      <button
                        type="button"
                        disabled={cakam}
                        onClick={() => potrdi(s, false)}
                        className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 ring-1 ring-zinc-300 hover:ring-zinc-500 disabled:opacity-50"
                      >
                        Test ni v redu
                      </button>
                    </div>
                  </div>
                ) : s.test === "zavrnjen" ? (
                  <p className="flex items-center gap-2 text-red-700">
                    <Lock className="h-4 w-4" aria-hidden />
                    Test te oblike je bil zavrnjen. Popravi osnutek (nova oblika dobi nov test).
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="max-w-xl text-zinc-700">
                      <b>3. korak: pošlji.</b> Oblika je potrjena. Izberi maile (največ {stanje.najvec}) in klikni Pošlji;
                      pred pošiljanjem dobiš seznam prejemnikov v potrditev.
                    </p>
                    {pripravljeni.length ? (
                      <button
                        type="button"
                        onClick={() =>
                          setIzbrani(new Set(pripravljeni.slice(0, stanje.najvec).map((o) => o.ime)))
                        }
                        className="text-xs font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900"
                      >
                        Izberi pripravljene ({Math.min(pripravljeni.length, stanje.najvec)})
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            <ul className="divide-y divide-zinc-100">
              {s.osnutki.map((o) => {
                const z = zadrzki(o);
                const lahko = jeAdmin && s.test === "potrjen" && !z.length && !tece;
                return (
                  <li key={o.ime} className="flex flex-wrap items-start justify-between gap-3 px-4 py-2.5">
                    <label className="flex min-w-0 flex-1 items-start gap-3">
                      {jeAdmin && s.test === "potrjen" ? (
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4"
                          disabled={!lahko}
                          checked={izbrani.has(o.ime)}
                          onChange={(e) => izberi(o.ime, e.target.checked)}
                        />
                      ) : null}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-zinc-900">
                          {o.podjetje || o.domena} <span className="font-normal text-zinc-500">· {o.za}</span>
                        </span>
                        {z.length ? (
                          <span className="block text-xs text-amber-700">{z.join(" · ")}</span>
                        ) : null}
                      </span>
                    </label>
                    <Link
                      href={`/admin/komunikacija/osnutek/${encodeURIComponent(o.ime)}`}
                      className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-300 hover:ring-zinc-500"
                    >
                      Poglej mail
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {jeAdmin && izbraniOsnutki.length ? (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zinc-900 px-4 py-3 text-white shadow-lg">
          <span className="text-sm">
            Izbranih: {izbraniOsnutki.length} (največ {stanje.najvec})
          </span>
          <button
            type="button"
            disabled={cakam || tece}
            onClick={() => setPotrditev(izbraniOsnutki)}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 disabled:opacity-50"
          >
            <Send className="h-4 w-4" aria-hidden />
            Pošlji {izbraniOsnutki.length} {mnozina(izbraniOsnutki.length, MAIL)}
          </button>
        </div>
      ) : null}

      {potrditev ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="potrdi-naslov"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h2 id="potrdi-naslov" className="text-lg font-semibold text-zinc-900">
              Pošljem {potrditev.length} {mnozina(potrditev.length, MAIL)} iz luka@kompletko.com?
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Med maili je {stanje.presledekS} s premora (skupaj približno{" "}
              {Math.max(1, Math.ceil((potrditev.length * stanje.presledekS) / 60))} min). Harvey vsak mail tik pred
              pošiljanjem še enkrat preveri; kdor je medtem dobil mail, je preskočen.
            </p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-zinc-800">
              {potrditev.map((o) => (
                <li key={o.ime}>
                  <b>{o.podjetje || o.domena}</b> · {o.za}
                  <span className="block truncate text-xs text-zinc-500">{o.zadeva}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPotrditev(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-zinc-300 hover:ring-zinc-500"
              >
                Prekliči
              </button>
              <button
                type="button"
                onClick={poslji}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
              >
                <Send className="h-4 w-4" aria-hidden />
                Da, pošlji {potrditev.length} {mnozina(potrditev.length, MAIL)}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {stanje.dnevnik.length ? <Dnevnik vnosi={stanje.dnevnik} /> : null}
    </div>
  );
}

function ZnackaTesta({ test }: { test: OsnutekPanik["test"] }) {
  const v = {
    ni: { t: "Najprej TEST", c: "bg-amber-100 text-amber-900" },
    poslan: { t: "TEST poslan, čaka potrditev", c: "bg-sky-100 text-sky-900" },
    potrjen: { t: "Test potrjen", c: "bg-emerald-100 text-emerald-900" },
    zavrnjen: { t: "Test zavrnjen", c: "bg-red-100 text-red-900" },
  }[test];
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${v.c}`}>{v.t}</span>;
}

function Paket({ posel, presledekS }: { posel: PoselPanik; presledekS: number }) {
  const poslano = posel.postavke.filter((p) => p.stanje === "poslano").length;
  const caka = posel.postavke.filter((p) => p.stanje === "caka").length;
  const naslov =
    posel.stanje === "tece"
      ? `Pošiljanje teče: ${poslano} poslanih, ${caka} na vrsti (vsakih ${presledekS} s)`
      : posel.stanje === "koncano"
        ? `Paket končan: ${poslano} poslanih`
        : posel.stanje === "prekinjeno"
          ? `Paket prekinjen (Harvey se je ponovno zagnal): ${poslano} poslanih, ostali so ostali osnutki`
          : `Paket ustavljen po napaki: ${poslano} poslanih, ostali so ostali osnutki`;
  return (
    <section
      className={`rounded-2xl p-4 ring-1 ${posel.stanje === "tece" ? "bg-sky-50 ring-sky-200" : posel.stanje === "koncano" ? "bg-emerald-50 ring-emerald-200" : "bg-red-50 ring-red-200"}`}
      aria-live="polite"
    >
      <p className="text-sm font-semibold text-zinc-900">{naslov}</p>
      <p className="text-xs text-zinc-500">
        Začel {posel.kdo} · {kdaj(posel.ustvarjen)}
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {posel.postavke.map((p) => (
          <li key={p.ime} className="flex flex-wrap justify-between gap-2">
            <span className="min-w-0 truncate text-zinc-800">{p.za || p.domena}</span>
            <span className={`text-xs font-medium ${STANJE_POSTAVKE[p.stanje]?.barva ?? "text-zinc-500"}`}>
              {STANJE_POSTAVKE[p.stanje]?.ime ?? p.stanje}
              {p.cas ? ` · ${kdaj(p.cas)}` : ""}
              {p.stanje === "poslano" && p.v_poslano === false ? " · kopija v Poslano ni uspela" : ""}
              {p.stanje === "poslano" && p.opozorila?.length ? ` · ${p.opozorila.join("; ")}` : ""}
              {p.razlog && p.stanje !== "poslano" ? ` · ${p.razlog}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Dnevnik({ vnosi }: { vnosi: VnosDnevnika[] }) {
  return (
    <details className="rounded-2xl bg-white px-4 py-3 ring-1 ring-zinc-200">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-900">Dnevnik pošiljanja ({vnosi.length})</summary>
      <ul className="mt-2 divide-y divide-zinc-100 text-sm">
        {vnosi.map((v) => (
          <li key={v.id} className="py-1.5">
            <span className="text-zinc-500">{kdaj(v.cas)}</span> · <b>{VRSTA_DNEVNIKA[v.vrsta] ?? v.vrsta}</b>
            {v.komu ? ` · ${v.komu}` : ""} · {v.kdo}
            {v.razlog ? <span className="block text-xs text-zinc-500">{v.razlog}</span> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
