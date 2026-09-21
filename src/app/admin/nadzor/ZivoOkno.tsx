"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Črno okno z živim potekom — isto, kar teče v ukazni vrstici delavca.
 *
 * Zakaj sploh: kartica pove „koliko je narejenega“, to okno pa „kaj se dogaja
 * ta hip“. Register podjetij obdela rezino v nekaj sekundah, zato bi bilo pri
 * 30-sekundnem osveževanju strani vsakič vidno drugo mesto brez vmesnih —
 * tukaj se vrstice dodajajo sproti, kakor jih delavec zapiše.
 *
 * Ustavi se samo, kadar zavihek ni viden: nesmiselno je klicati strežnik za
 * okno, ki ga nihče ne gleda (isto pravilo kot pri osveževanju strani).
 */

type Vrstica = { ob: string | null; besedilo: string; napaka: boolean };

export function ZivoOkno({
  kljuc,
  naslov,
  vsakoS = 3,
}: {
  kljuc: string;
  naslov: string;
  vsakoS?: number;
}) {
  const [vrstice, setVrstice] = useState<Vrstica[] | null>(null);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [tece, setTece] = useState(true);
  const okno = useRef<HTMLDivElement>(null);
  // Ali je bralec pri dnu. Ce se je odmaknil navzgor (bere starejso vrstico),
  // ga nove vrstice ne smejo vleci nazaj.
  const priDnu = useRef(true);

  useEffect(() => {
    let ustavljen = false;
    let cas: ReturnType<typeof setTimeout> | undefined;

    const poberi = async () => {
      if (ustavljen) return;
      if (document.visibilityState !== "visible" || !tece) {
        cas = setTimeout(poberi, vsakoS * 1000);
        return;
      }
      try {
        const r = await fetch(`/api/admin/nadzor/zivo?kljuc=${encodeURIComponent(kljuc)}`, {
          cache: "no-store",
        });
        if (!r.ok) throw new Error(`strežnik je vrnil ${r.status}`);
        const d = (await r.json()) as { vrstice: Vrstica[] };
        if (!ustavljen) {
          setVrstice(d.vrstice);
          setNapaka(null);
        }
      } catch (e) {
        // Napako pokažemo in NE praznimo okna: zadnje znane vrstice so bolj
        // uporabne od praznega zaslona, ko omrežje za hip zataji.
        if (!ustavljen) setNapaka(e instanceof Error ? e.message : String(e));
      }
      if (!ustavljen) cas = setTimeout(poberi, vsakoS * 1000);
    };

    void poberi();
    return () => {
      ustavljen = true;
      if (cas) clearTimeout(cas);
    };
  }, [kljuc, vsakoS, tece]);

  useEffect(() => {
    // POZOR: tukaj je bil `scrollIntoView`, ki premakne CELO STRAN, da pride
    // element v vidno polje. Stiri okna so to klicala vsake 3 sekunde, zato je
    // stran ves cas uhajala navzgor. Drsimo torej samo znotraj vsebnika.
    const el = okno.current;
    if (el && priDnu.current) el.scrollTop = el.scrollHeight;
  }, [vrstice]);

  return (
    <div className="overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-zinc-800">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              napaka ? "bg-red-500" : tece ? "animate-pulse bg-emerald-400" : "bg-zinc-600"
            }`}
          />
          <p className="font-mono text-xs text-zinc-300">{naslov}</p>
        </div>
        <button
          type="button"
          onClick={() => setTece((v) => !v)}
          className="rounded-md px-2 py-0.5 font-mono text-[11px] text-zinc-400 ring-1 ring-zinc-700 transition hover:text-zinc-100"
        >
          {tece ? "ustavi" : "nadaljuj"}
        </button>
      </div>

      <div
        ref={okno}
        onScroll={(e) => {
          const el = e.currentTarget;
          priDnu.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="h-64 overflow-y-auto px-3 py-2"
      >
        {vrstice === null && !napaka && (
          <p className="font-mono text-xs text-zinc-500">berem dnevnik …</p>
        )}
        {vrstice?.length === 0 && (
          <p className="font-mono text-xs text-zinc-500">dnevnik je prazen</p>
        )}
        {vrstice?.map((v, i) => (
          <p
            key={`${i}-${v.ob ?? ""}`}
            className={`whitespace-pre-wrap break-all font-mono text-xs leading-relaxed ${
              v.napaka ? "text-red-400" : "text-emerald-300"
            }`}
          >
            {v.ob && <span className="text-zinc-600">{v.ob} </span>}
            {v.besedilo}
          </p>
        ))}
      </div>

      {napaka && (
        <p className="border-t border-zinc-800 px-3 py-1.5 font-mono text-[11px] text-red-400">
          {napaka}
        </p>
      )}
    </div>
  );
}
