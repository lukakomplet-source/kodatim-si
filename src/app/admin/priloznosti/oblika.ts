import type { Izid, StanjeRaziskave } from "@/lib/priloznosti";

export const STANJE: Record<StanjeRaziskave, { oznaka: string; razred: string }> = {
  caka: { oznaka: "čaka na začetek", razred: "bg-zinc-100 text-zinc-700" },
  v_teku: { oznaka: "v teku", razred: "bg-sky-100 text-sky-900" },
  koncano: { oznaka: "končano", razred: "bg-emerald-100 text-emerald-900" },
  nedokoncano: { oznaka: "nedokončano", razred: "bg-amber-100 text-amber-900" },
  prekinjeno: { oznaka: "prekinjeno, nadaljuje", razred: "bg-amber-100 text-amber-900" },
  ustavljeno: { oznaka: "ustavljeno", razred: "bg-zinc-200 text-zinc-700" },
  napaka: { oznaka: "napaka", razred: "bg-red-100 text-red-900" },
};

export const IZID: Record<Exclude<Izid, "">, { oznaka: string; razred: string }> = {
  ZAVRNI: { oznaka: "Zavrni", razred: "bg-zinc-900 text-white" },
  VALIDIRAJ: { oznaka: "Validiraj s testom", razred: "bg-emerald-700 text-white" },
  NEZNANO: { oznaka: "Še ne vemo", razred: "bg-amber-600 text-white" },
};

/** Harvey hrani čas v UTC kot "YYYY-MM-DD HH:MM:SS". */
export function cas(utc: string | null | undefined): string {
  if (!utc) return "";
  const d = new Date(utc.replace(" ", "T") + (utc.endsWith("Z") ? "" : "Z"));
  if (Number.isNaN(d.getTime())) return utc;
  return d.toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function minute(sekund: number): string {
  if (!sekund) return "0 min";
  return sekund < 60 ? `${Math.round(sekund)} s` : `${Math.round(sekund / 60)} min`;
}

export function dolarji(v: number): string {
  return `${(v || 0).toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}
