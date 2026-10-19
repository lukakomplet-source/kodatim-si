import { ShieldCheck } from "lucide-react";
import type { Paket } from "@/lib/predlogi";

/**
 * Lukov cenik, kot je v njegovi ponudbi Kamenariču: paketi 1 · 2 · 3 in AI
 * nadgradnja, mesečnina in garancija. Cene pridejo s predlogom (shranjene
 * ob nastanku), zato stran, PDF in mail vedno kažejo isto.
 */
export function Cene({
  cene,
  mesecnina,
  garancija,
  pogoji,
  kompaktno = false,
}: {
  cene: Paket[];
  mesecnina?: string;
  garancija?: string;
  pogoji?: string;
  /** V PDF: manj zraka, da gre cenik z garancijo na eno stran. */
  kompaktno?: boolean;
}) {
  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {cene.map((c) => (
          <div
            key={c.st}
            className={`flex gap-4 border-b border-zinc-100 px-5 last:border-b-0 sm:px-6 ${
              kompaktno ? "py-2.5" : "py-4"
            } ${c.priporocen ? "bg-accent/[0.05]" : ""}`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                c.priporocen ? "bg-accent text-white" : "bg-zinc-100 text-zinc-700"
              }`}
            >
              {c.st}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-semibold text-zinc-900">
                  {c.ime}
                  {c.priporocen && (
                    <span className="ml-2 whitespace-nowrap rounded-full bg-accent px-2 py-0.5 align-middle text-[11px] font-semibold text-white">
                      ⭐ priporočamo
                    </span>
                  )}
                </p>
                <p className="whitespace-nowrap font-semibold text-zinc-900">{c.cena}</p>
              </div>
              {c.opis && <p className="mt-1 text-sm leading-relaxed text-zinc-500">{c.opis}</p>}
            </div>
          </div>
        ))}
      </div>
      {mesecnina && <p className="mt-4 text-sm leading-relaxed text-zinc-600">{mesecnina}</p>}
      {garancija && (
        <div
          className={`flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 ${kompaktno ? "mt-3 p-4" : "mt-5 p-5"}`}
        >
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div>
            <p className="font-semibold text-emerald-900">Garancija</p>
            <p className="mt-1 text-sm leading-relaxed text-emerald-900/80">{garancija}</p>
            {pogoji && <p className="mt-2 text-xs leading-relaxed text-emerald-900/60">{pogoji}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
