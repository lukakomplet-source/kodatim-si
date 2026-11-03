"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { osveziCakaAkcija } from "./actions";

/**
 * »Odpri v Outlooku« za KodaTim Hotele (ostane kot prej, Harvey harvey/outlook.py): mail se odpre med Osnutki v
 * klasičnem Outlooku (luka@kodatim.si), pošlje ga Luka sam; ko ga Harvey najde v Poslano, izgine od tu.
 */
export function GumbOutlook({ id, odprt }: { id: string; odprt: boolean }) {
  const [odpiram, setOdpiram] = useState(false);
  const [jeOdprt, setJeOdprt] = useState(odprt);
  const [napaka, setNapaka] = useState<string | null>(null);

  async function odpri() {
    setNapaka(null);
    setOdpiram(true);
    try {
      const r = await fetch(`/api/admin/prodajna-ekipa/outlook/${encodeURIComponent(id)}`, { method: "POST" });
      const data = (await r.json().catch(() => ({}))) as { ok?: boolean; napaka?: string };
      if (!r.ok || !data.ok) setNapaka(data.napaka ?? "Outlook mail ni odprl.");
      else {
        setJeOdprt(true);
        await osveziCakaAkcija();
      }
    } catch {
      setNapaka("Outlook mail ni odprl.");
    } finally {
      setOdpiram(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        disabled={odpiram}
        onClick={odpri}
        className="inline-flex items-center gap-2 rounded-lg bg-[#0F6CBD] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#115EA3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:opacity-60"
      >
        <Mail className="h-4 w-4" aria-hidden />
        {odpiram ? "Odpiram …" : "Odpri v Outlooku"}
      </button>
      {jeOdprt ? <span className="text-xs font-medium text-emerald-700">V Outlooku med Osnutki: pošlji ga od tam.</span> : null}
      {napaka ? <span className="text-xs text-red-700">{napaka}</span> : null}
    </div>
  );
}
