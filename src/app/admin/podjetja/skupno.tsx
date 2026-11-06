import type { Dogodek, Podjetje } from "@/lib/podjetja/podatki";

/** Skupni gradniki strani Podjetja (seznam, kartica, Priložnosti, Dodaj). */

export const STANJE_KODATIM: Record<string, string> = {
  najden: "Najden",
  osnutek: "Osnutek",
  outlook: "V Outlooku",
  poslano: "Poslan mail",
  odgovoril: "Odgovoril",
  zanimanje: "Zanimanje",
  odjava: "Odjava",
};

export const STATUS_LEADA: Record<string, string> = {
  new: "Nov",
  contacted: "Kontaktiran",
  qualified: "Kvalificiran",
  customer: "Stranka",
  not_interested: "Ne zanima",
  duplicate: "Dvojnik",
};

export const STANJE_KOMPLETKO: Record<string, string> = {
  kandidat: "Še nismo pisali",
  poslan: "Poslan mail",
  klic: "Klic",
  odgovoril: "Odgovoril",
  sestanek: "Sestanek",
  kupil: "Kupil",
  ne_zanima: "Ne zanima",
  nedostavljeno: "Nedostavljeno",
  zakljucen: "Zaključen",
};

export const VRSTA_DOGODKA: Record<Dogodek["vrsta"], string> = {
  mail: "Mail",
  odgovor: "Odgovor",
  klic: "Klic",
  ogled: "Ogled predloga",
  opomba: "Opomba",
  faza: "Faza",
  pregled: "Pregled klica",
  stanje: "Stanje",
  obisk: "Obisk",
  sestanek: "Sestanek",
  posel: "Posel",
};

export function kdaj(iso: string | null | undefined, sUro = true): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  return d.toLocaleString("sl-SI", {
    timeZone: "Europe/Ljubljana",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    ...(sUro ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function Znacka({ children, ton }: { children: React.ReactNode; ton: "kodatim" | "kompletko" | "opozorilo" }) {
  const barva =
    ton === "kodatim"
      ? "bg-sky-50 text-sky-800 ring-sky-200"
      : ton === "kompletko"
        ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
        : "bg-red-50 text-red-800 ring-red-200";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${barva}`}>{children}</span>;
}

/** Kje je podjetje v vsakem poslu (ena značka na posel) in odjava. */
export function ZnackePoslov({ p }: { p: Podjetje }) {
  const kodatim = p.kodatim
    ? STANJE_KODATIM[p.kodatim.harvey] ??
      (p.kodatim.faze[0]?.oznaka || STATUS_LEADA[p.kodatim.leadStatus] || "v Strankah")
    : null;
  return (
    <span className="flex flex-wrap gap-1">
      {kodatim ? <Znacka ton="kodatim">KodaTim: {kodatim}</Znacka> : null}
      {p.kompletko ? (
        <Znacka ton="kompletko">Kompletko: {STANJE_KOMPLETKO[p.kompletko.stanje] ?? p.kompletko.stanje}</Znacka>
      ) : null}
      {p.odjava ? <Znacka ton="opozorilo">Odjava</Znacka> : null}
    </span>
  );
}

export function Opozorilo({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{children}</p>;
}

/** Vir, ki ni odgovoril: »ni podatka«, ne prazen seznam. */
export function Manjka({ manjka }: { manjka: string[] }) {
  if (!manjka.length) return null;
  return <Opozorilo>Ni podatka iz: {manjka.join(", ")}. Podjetja iz tega vira manjkajo ali so brez dogodkov.</Opozorilo>;
}
