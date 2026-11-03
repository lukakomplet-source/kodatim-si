"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { ZadetekIskanja } from "@/app/api/admin/podjetja/iskanje/route";

/**
 * Iskanje podjetij na vsaki strani admina (faza 6): Ctrl+K (ali gumb v meniju) odpre okno, Enter odpre kartico.
 * Ob zadetku opozori na »danes že kontaktiran« in »odjava«, da istega podjetja ne kontaktiramo dvakrat.
 */
export function IskanjePodjetij() {
  const router = useRouter();
  const [odprto, setOdprto] = useState(false);
  const [q, setQ] = useState("");
  const [zadetki, setZadetki] = useState<ZadetekIskanja[]>([]);
  const [manjka, setManjka] = useState<string[]>([]);
  const [izbran, setIzbran] = useState(0);
  const [stanje, setStanje] = useState<"" | "isce" | "napaka">("");
  const vnos = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const tipka = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOdprto((o) => !o);
      } else if (e.key === "Escape") {
        setOdprto(false);
      }
    };
    window.addEventListener("keydown", tipka);
    return () => window.removeEventListener("keydown", tipka);
  }, []);

  useEffect(() => {
    if (odprto) vnos.current?.focus();
  }, [odprto]);

  useEffect(() => {
    const iskano = q.trim();
    if (!odprto || iskano.length < 2) return;
    const nadzor = new AbortController();
    const cas = setTimeout(async () => {
      setStanje("isce");
      try {
        const r = await fetch(`/api/admin/podjetja/iskanje?q=${encodeURIComponent(iskano)}`, { signal: nadzor.signal });
        const d = (await r.json()) as { zadetki?: ZadetekIskanja[]; manjka?: string[] };
        setZadetki(d.zadetki ?? []);
        setManjka(d.manjka ?? []);
        setIzbran(0);
        setStanje(r.ok ? "" : "napaka");
      } catch (err) {
        if ((err as Error).name !== "AbortError") setStanje("napaka");
      }
    }, 200);
    return () => {
      clearTimeout(cas);
      nadzor.abort();
    };
  }, [q, odprto]);

  const odpri = (z: ZadetekIskanja | undefined) => {
    if (!z) return;
    setOdprto(false);
    setQ("");
    setZadetki([]);
    router.push(`/admin/podjetja/${encodeURIComponent(z.kljuc)}`);
  };

  const prikaz = q.trim().length >= 2 ? zadetki : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOdprto(true)}
        className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-500 ring-1 ring-zinc-200 transition hover:text-zinc-800 hover:ring-zinc-400"
      >
        <Search className="h-4 w-4" aria-hidden />
        <span className="flex-1 text-left">Išči podjetje</span>
        <kbd className="hidden rounded bg-zinc-100 px-1.5 text-[11px] text-zinc-500 sm:inline">Ctrl K</kbd>
      </button>

      {odprto ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Išči podjetje"
          onClick={() => setOdprto(false)}
          className="fixed inset-0 z-[100] flex items-start justify-center bg-zinc-950/40 p-4 pt-[12vh] backdrop-blur-sm"
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <label className="flex items-center gap-3 border-b border-zinc-200 px-4">
              <Search className="h-5 w-5 text-zinc-400" aria-hidden />
              <input
                ref={vnos}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  // The old results belong to the old query: Enter must never open one of them.
                  setZadetki([]);
                  setStanje(e.target.value.trim().length >= 2 ? "isce" : "");
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setIzbran((i) => Math.min(prikaz.length - 1, i + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setIzbran((i) => Math.max(0, i - 1));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (stanje !== "isce") odpri(prikaz[izbran]);
                  }
                }}
                placeholder="Ime, davčna, domena, e-naslov ali telefon"
                className="w-full py-4 text-base outline-none placeholder:text-zinc-400"
              />
            </label>
            <div className="max-h-[60vh] overflow-y-auto">
              {stanje === "napaka" ? <p className="px-4 py-3 text-sm text-red-700">Iskanje ni uspelo.</p> : null}
              {manjka.length ? <p className="px-4 pt-3 text-xs text-amber-700">Ni podatka iz: {manjka.join(", ")}.</p> : null}
              {q.trim().length >= 2 && stanje === "" && prikaz.length === 0 ? (
                <p className="px-4 py-3 text-sm text-zinc-500">
                  Ni zadetka.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setOdprto(false);
                      router.push(`/admin/podjetja/dodaj?q=${encodeURIComponent(q.trim())}`);
                    }}
                    className="underline underline-offset-2 hover:text-zinc-900"
                  >
                    Preveri v registru
                  </button>
                </p>
              ) : null}
              <ul className="py-1">
                {prikaz.map((z, i) => (
                  <li key={z.kljuc}>
                    <button
                      type="button"
                      onMouseEnter={() => setIzbran(i)}
                      onClick={() => odpri(z)}
                      className={`flex w-full flex-col items-start px-4 py-2.5 text-left ${i === izbran ? "bg-zinc-100" : ""}`}
                    >
                      <span className="w-full truncate text-sm font-medium text-zinc-900">{z.ime}</span>
                      <span className="w-full truncate text-xs text-zinc-500">
                        {[z.kodatim && "KodaTim", z.kompletko && "Kompletko", z.pod].filter(Boolean).join(", ")}
                      </span>
                      {z.danes || z.odjava ? (
                        <span className="mt-0.5 text-xs font-medium text-amber-700">
                          {[z.odjava && "Odjava: ne pišemo več", z.danes && "Danes že kontaktiran"].filter(Boolean).join(". ")}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <p className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-400">Enter odpre kartico, Esc zapre.</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
