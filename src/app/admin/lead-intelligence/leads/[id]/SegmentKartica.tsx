import type { IntelLead } from "@/lib/lead-intelligence/types";

type Razlog = { razlog: string; odlomek: string; url: string; tocke?: number };
type Segment = {
  segment_ime: string;
  ocena: number;
  razlogi: Razlog[];
  enote: number | null;
  prihodki: number | null;
  zaposleni: number | null;
  leto: string | null;
  cw_url: string;
  stanje: string;
  izbran_dne: string | null;
};

const STANJE: Record<string, string> = {
  pregledan: "ustreza, čaka na izbor",
  izbran: "izbran za mail",
  v_pripravi: "v pripravi (problem, stran, mail)",
  caka_odobritev: "mail čaka na tvojo odobritev",
  poslan: "mail poslan",
  odgovoril: "odgovoril",
  odjava: "odjava",
};

/**
 * Zakaj je Harveyjev segment izbral to podjetje: vsak razlog z odlomkom z
 * njihove strani in povezavo, da ga lahko preveriš, ter obseg s CompanyWalla.
 */
export default function SegmentKartica({ lead }: { lead: IntelLead }) {
  const s = (lead.custom_fields as Record<string, unknown> | null)?.segment as Segment | undefined;
  if (!s || typeof s !== "object") return null;
  const obseg = [
    s.prihodki != null ? `${Math.round(s.prihodki).toLocaleString("sl-SI")} € prihodkov` : null,
    s.zaposleni != null ? `${String(s.zaposleni).replace(".", ",")} zaposlenih` : null,
  ].filter(Boolean);
  return (
    <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Zakaj ga je Harvey izbral</h2>
      <p className="mt-1 text-sm text-zinc-600">
        {s.segment_ime} · ocena <span className="font-semibold text-zinc-900">{s.ocena}</span> ·{" "}
        {STANJE[s.stanje] ?? s.stanje}
        {s.izbran_dne ? ` · izbran ${s.izbran_dne.split("-").reverse().join(". ")}` : ""}
      </p>
      {obseg.length > 0 && (
        <p className="mt-2 text-sm text-zinc-700">
          {obseg.join(", ")}
          {s.leto ? ` (${s.leto})` : ""}
          {s.cw_url && (
            <>
              {" · "}
              <a href={s.cw_url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                CompanyWall
              </a>
            </>
          )}
        </p>
      )}
      {s.enote ? <p className="mt-1 text-sm text-zinc-700">{s.enote} enot ali vozil, kot piše na njihovi strani</p> : null}
      <ul className="mt-4 space-y-3">
        {s.razlogi.map((r, i) => (
          <li key={i} className="text-sm">
            <p className="font-medium text-zinc-900">{r.razlog}</p>
            <p className="mt-0.5 text-zinc-600">»{r.odlomek}«</p>
            <a
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-900"
            >
              {r.url.replace(/^https?:\/\//, "")}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
