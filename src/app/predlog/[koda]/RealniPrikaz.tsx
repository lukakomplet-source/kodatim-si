"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { CheckCheck, Mic, Phone, PhoneOff, Video, Volume2 } from "lucide-react";
import type { KlicAgenta, PogovorAgenta } from "@/lib/predlogi";

/**
 * Realistični prikaz rešitve (Luka, 24. 10. 2026: »WhatsApp naj izgleda kot WhatsApp … klici AI
 * naj izgleda, kot da kliče AI agent njihove firme«). Ni posnetek delujoče aplikacije, ampak natančno
 * to, kar bomo izdelali: sporočila se prikazujejo eno za drugim, na sliki za mail in v PDF pa statično
 * (zaSliko) oziroma do koraka (korak = koliko sporočil je vidnih).
 */

const ZELENA = "#008069";

export function WhatsAppPogovor({
  ime,
  pogovor,
  zaSliko = false,
  korak,
  visina = 560,
}: {
  ime: string;
  pogovor: PogovorAgenta;
  zaSliko?: boolean;
  korak?: number;
  visina?: number;
}) {
  const vsa = pogovor.sporocila;
  const mirno = useReducedMotion();
  const staticno = zaSliko || korak !== undefined || !!mirno;
  const [tece, setTece] = useState(1);
  useEffect(() => {
    if (staticno) return;
    const t = setInterval(() => setTece((n) => (n >= vsa.length ? 1 : n + 1)), 1700);
    return () => clearInterval(t);
  }, [staticno, vsa.length]);
  const vidnih = korak !== undefined ? Math.min(vsa.length, Math.max(1, korak)) : staticno ? vsa.length : tece;

  return (
    <div className="mx-auto w-[300px] rounded-[2.6rem] bg-[#0b0f14] p-2.5 shadow-2xl shadow-black/40 ring-1 ring-white/10">
      <div className="overflow-hidden rounded-[2.1rem] bg-[#efeae2]" style={{ height: visina }}>
        {/* glava kot v WhatsAppu */}
        <div className="flex items-center gap-2.5 px-3 pb-2.5 pt-7 text-white" style={{ background: ZELENA }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
            {ime.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[15px] font-semibold">{ime}</p>
            <p className="truncate text-[11px] text-white/80">AI asistent · {pogovor.opis || "na spletu"}</p>
          </div>
          <Video className="h-5 w-5 opacity-90" aria-hidden />
          <Phone className="ml-3 h-[18px] w-[18px] opacity-90" aria-hidden />
        </div>
        {/* sporočila */}
        <div
          className="flex h-[calc(100%-112px)] flex-col justify-end gap-1.5 overflow-hidden px-2.5 py-3"
          style={{
            backgroundImage:
              "radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px), radial-gradient(rgba(0,0,0,0.025) 1px, transparent 1px)",
            backgroundSize: "18px 18px, 11px 11px",
            backgroundPosition: "0 0, 6px 9px",
          }}
        >
          {vsa.slice(0, vidnih).map((s, i) => {
            const ai = s.od === "ai";
            return (
              <div key={i} className={`flex ${ai ? "justify-end" : "justify-start"}`}>
                <div
                  className={`relative max-w-[82%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-[13px] leading-snug text-[#111b21] shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] ${
                    ai ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white"
                  }`}
                >
                  <span className="whitespace-pre-line">{s.besedilo}</span>
                  <span className="ml-2 inline-flex translate-y-0.5 items-center gap-0.5 align-bottom text-[10px] text-[#667781]">
                    {s.cas}
                    {ai ? <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" aria-hidden /> : null}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {/* vnosna vrstica */}
        <div className="flex items-center gap-2 px-2 pb-3">
          <div className="flex-1 rounded-full bg-white px-4 py-2 text-[13px] text-[#8696a0]">Sporočilo</div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: ZELENA }}>
            <Mic className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </div>
    </div>
  );
}

export function AiKlic({
  ime,
  klic,
  zaSliko = false,
}: {
  ime: string;
  klic: KlicAgenta;
  zaSliko?: boolean;
}) {
  const vse = klic.replike;
  const [vidnih, setVidnih] = useState(zaSliko ? vse.length : 1);
  const [sekunde, setSekunde] = useState(zaSliko ? 47 : 0);
  useEffect(() => {
    if (zaSliko) return;
    const t = setInterval(() => {
      setSekunde((s) => s + 1);
    }, 1000);
    const r = setInterval(() => setVidnih((n) => (n >= vse.length ? 1 : n + 1)), 2200);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [zaSliko, vse.length]);
  const cas = `${String(Math.floor(sekunde / 60)).padStart(2, "0")}:${String(sekunde % 60).padStart(2, "0")}`;

  return (
    <div className="mx-auto w-[300px] rounded-[2.6rem] bg-[#0b0f14] p-2.5 shadow-2xl shadow-black/40 ring-1 ring-white/10">
      <div
        className="flex h-[560px] flex-col overflow-hidden rounded-[2.1rem] px-5 pb-6 pt-10 text-white"
        style={{ background: "linear-gradient(180deg,#123b3a 0%,#0c2324 55%,#081617 100%)" }}
      >
        <div className="text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#0F9D8A] text-xl font-bold shadow-lg">
            AI
          </span>
          <p className="mt-3 text-lg font-semibold">{ime}</p>
          <p className="text-sm text-white/70">{klic.opis || "AI asistent"} · {cas}</p>
          {/* valovanje glasu */}
          <div className="mt-4 flex h-8 items-end justify-center gap-1" aria-hidden>
            {[10, 22, 14, 28, 18, 30, 12, 24, 16, 26, 11].map((h, i) => (
              <span
                key={i}
                className={`w-1 rounded-full bg-[#5eead4] ${zaSliko ? "" : "animate-pulse"}`}
                style={{ height: h, animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>
        </div>
        <div className="mt-5 flex flex-1 flex-col justify-end gap-2 overflow-hidden">
          {vse.slice(0, vidnih).map((r, i) => (
            <p
              key={i}
              className={`rounded-2xl px-3 py-2 text-[12.5px] leading-snug ${
                r.od === "ai" ? "self-start bg-white/12 text-white" : "self-end bg-[#5eead4]/20 text-[#d7fff7]"
              }`}
              style={{ backgroundColor: r.od === "ai" ? "rgba(255,255,255,0.12)" : undefined }}
            >
              <span className="mb-0.5 block text-[10px] font-semibold opacity-60">
                {r.od === "ai" ? "AI" : "Gost"}
              </span>
              {r.besedilo}
            </p>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-around">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/12" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <Mic className="h-5 w-5" aria-hidden />
          </span>
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e5484d]">
            <PhoneOff className="h-6 w-6" aria-hidden />
          </span>
          <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <Volume2 className="h-5 w-5" aria-hidden />
          </span>
        </div>
      </div>
    </div>
  );
}
