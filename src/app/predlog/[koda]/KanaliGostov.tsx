import { Bot, KeyRound, Languages, MessageSquare } from "lucide-react";
import type { KanalGosta } from "@/lib/predlogi";

/**
 * Nastanitve (Luka, 28. 10. 2026): »sliko odgovora primera pri Bookingu pa Airbnb … če nimajo sistema še
 * za kodo za vrata, kamere, varovanje … cel sistem jim lahko postavimo, AI da odgovarja v njihovem jeziku«.
 * Primer pogovora v nabiralniku sporočil obeh portalov: njune barve in razpored, brez njunih logotipov,
 * jasno označen kot primer. Statično, zato enako na strani, v PDF in na sliki.
 */

const SLOG = {
  booking: {
    ime: "Booking.com",
    glava: "#003580",
    glavaBesedilo: "#ffffff",
    podlaga: "#f5f5f5",
    gost: "bg-white text-[#1a1a1a] ring-1 ring-[#e7e7e7]",
    ai: "bg-[#e9f0fa] text-[#1a1a1a]",
    poudarek: "#006ce4",
  },
  airbnb: {
    ime: "Airbnb",
    glava: "#ffffff",
    glavaBesedilo: "#222222",
    podlaga: "#ffffff",
    gost: "bg-[#f2f2f2] text-[#222222]",
    ai: "bg-[#222222] text-white",
    poudarek: "#ff385c",
  },
} as const;

/** Telefon je visok toliko, kolikor je pogovora; `najvec` skrajša pogovor (PDF: vprašanje in odgovor). */
export function SporocilaKanala({ ime, kanal, najvec }: { ime: string; kanal: KanalGosta; najvec?: number }) {
  const s = SLOG[kanal.kanal];
  const sporocila = najvec ? kanal.sporocila.slice(0, najvec) : kanal.sporocila;
  return (
    <figure className="mx-auto w-[300px]">
      <div className="rounded-[2.6rem] bg-[#0b0f14] p-2.5 shadow-2xl shadow-black/30 ring-1 ring-white/10">
        <div className="flex min-h-[420px] flex-col overflow-hidden rounded-[2.1rem]" style={{ background: s.podlaga }}>
          <div
            className="px-4 pb-3 pt-7"
            style={{ background: s.glava, color: s.glavaBesedilo, borderBottom: kanal.kanal === "airbnb" ? "1px solid #ebebeb" : undefined }}
          >
            <p className="text-[11px] font-semibold opacity-80">{s.ime} · sporočila</p>
            <div className="mt-1.5 flex items-center gap-2.5">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                style={{ background: s.poudarek }}
              >
                {kanal.gost.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[15px] font-semibold">{kanal.gost}</p>
                <p className="truncate text-[11px] opacity-75">gost · {kanal.jezik || "tuji jezik"}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-end gap-2 px-3 py-3">
            {sporocila.map((m, i) => {
              const ai = m.od === "ai";
              return (
                <div key={i} className={`flex flex-col ${ai ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[84%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${ai ? s.ai : s.gost}`}>
                    <span className="whitespace-pre-line">{m.besedilo}</span>
                  </div>
                  <span className="mt-0.5 px-1 text-[10px] text-[#717171]">
                    {ai ? `AI za ${ime}` : kanal.gost} · {m.cas}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="px-3 pb-4">
            <div className="rounded-full px-4 py-2 text-[12px] text-[#717171] ring-1 ring-[#dddddd]" style={{ background: "#fff" }}>
              Napišite sporočilo …
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-[12px] text-[#6b7280]">Primer · {s.ime}, AI odgovori v jeziku gosta</figcaption>
    </figure>
  );
}

export const SISTEM = [
  { Ikona: MessageSquare, naslov: "Vsi kanali na enem mestu", opis: "Booking, Airbnb, WhatsApp in e-pošta — gostje pišejo, kjer želijo." },
  { Ikona: Languages, naslov: "AI odgovarja v jeziku gosta", opis: "Takoj, tudi ponoči, iz podatkov vaših apartmajev in sob." },
  { Ikona: Bot, naslov: "Vi dobite samo nujno", opis: "S kratkim povzetkom, za katero enoto in katerega gosta gre." },
  { Ikona: KeyRound, naslov: "Vstop s kodo", opis: "Gost dobi kodo vrat in navodila za prihod sam, ob pravem času." },
] as const;

export const VAROVANJE =
  "Če še nimate sistema za vstop s kodo, kamer ali varovanja, vam lahko postavimo tudi to — povezano z istim sistemom.";