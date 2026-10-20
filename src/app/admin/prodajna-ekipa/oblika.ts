import type { StanjeDelavca } from "@/lib/prodajna-ekipa";

/** Skupno oblikovanje za pregled ekipe in podrobnosti delavca. */

export const STANJE: Record<StanjeDelavca, { oznaka: string; pika: string; besedilo: string }> = {
  dela: { oznaka: "dela zdaj", pika: "bg-emerald-400 shadow-[0_0_10px_2px] shadow-emerald-400/60 animate-pulse", besedilo: "text-emerald-300" },
  caka: { oznaka: "čaka na delo", pika: "bg-sky-400", besedilo: "text-sky-300" },
  tiho: { oznaka: "tiho do jutra", pika: "bg-violet-400", besedilo: "text-violet-300" },
  izklopljen: { oznaka: "izklopljen", pika: "bg-zinc-500", besedilo: "text-zinc-400" },
  ustavljen: { oznaka: "ustavljen", pika: "bg-amber-400", besedilo: "text-amber-300" },
  napaka: { oznaka: "napaka", pika: "bg-red-500", besedilo: "text-red-300" },
  prosto: { oznaka: "nič ne čaka", pika: "bg-zinc-500", besedilo: "text-zinc-400" },
};

/** Delavci, ki delajo samo, ko je pošiljanje vklopljeno (Lukov »začni«). */
const OB_POSILJANJU = new Set(["kontrolor", "preverjevalec", "posiljatelj"]);

/** Stanje delavca za prikaz: ugasnjeni delavci pošiljanja čakajo na Luka, niso pokvarjeni. */
export function stanjeZaPrikaz(kljuc: string, stanje: StanjeDelavca) {
  if (stanje === "izklopljen" && OB_POSILJANJU.has(kljuc)) {
    return { ...STANJE.izklopljen, oznaka: "čaka na tvoj »začni«" };
  }
  return STANJE[stanje] ?? STANJE.caka;
}

export const ODLOCITEV: Record<string, string> = {
  handle_replies: "bere odgovore",
  send_campaign: "pošilja",
  write_campaign: "piše osnutke",
  prospect: "išče kontakte",
  idle: "analizira",
};

/** »pred 3 min«, »pred 2 h«, »včeraj« — glede na čas povzetka. */
export function kdaj(iso: string | null | undefined, zdaj: string): string {
  if (!iso) return "še nikoli";
  const razlika = (new Date(zdaj).getTime() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(razlika)) return "—";
  if (razlika < 0) return "čez " + kdajNaprej(-razlika);
  if (razlika < 60) return "pravkar";
  if (razlika < 3600) return `pred ${Math.round(razlika / 60)} min`;
  if (razlika < 86400) return `pred ${Math.round(razlika / 3600)} h`;
  const dni = Math.round(razlika / 86400);
  return dni === 1 ? "včeraj" : `pred ${dni} dnevi`;
}

function kdajNaprej(s: number): string {
  if (s < 60) return "manj kot minuto";
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.round(s / 3600)} h`;
}

export function uraLokalno(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("sl-SI", {
    timeZone: "Europe/Ljubljana",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function stevilo(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("sl-SI").format(v);
}

/** Oznake številk, ki jih Harvey vrača pri posameznem delavcu. */
export const OZNAKE_STEVILK: Record<string, string> = {
  danes: "Danes",
  teden: "Zadnjih 7 dni",
  skupaj: "Skupaj",
  v_izvozu: "Družb v izvozu registra",
  nedosegljivih: "Strani ni bilo mogoče prebrati",
  ocenjenih: "Ocenjenih strani",
  s_pomanjkljivostmi: "S pomanjkljivostmi",
  pomanjkljivosti: "Vseh pomanjkljivosti",
  preverjenih_podjetij: "Preverjenih podjetij",
  uspesnost: "Uspešnost (%)",
  cakajo: "Čaka na odobritev",
  spustil: "Spustil naprej",
  cakajo_sporocil: "Sporočil čaka",
  odobreno_caka_na_posiljanje: "Odobreno, čaka na pošiljanje",
  zavrnjeno: "Zavrnjenih",
  caka: "Čaka na preverjanje",
  preverjenih: "Preverjenih",
  tveganih: "Tveganih (catch-all)",
  neveljavnih: "Neveljavnih",
  kljuc_nastavljen: "Ključ za preverjanje",
  na_dan: "Največ na dan",
  okno_odprto: "Okno za pošiljanje odprto",
  okno: "Okno za pošiljanje",
  razlog_izklopa: "Zakaj je izklopljen",
  zanimanje: "Z zanimanjem",
  vprasanja: "Vprašanja",
  ugovori: "Ugovori",
  ne_zanima: "Ne zanima",
  odjave: "Odjave",
  kontaktiranih: "Kontaktiranih podjetij",
  odgovorilo: "Odgovorilo",
  odzivnost: "Odzivnost (%)",
  odbitja: "Odbitja (%)",
  meja_odbitij: "Meja odbitij (%)",
  klicev_claude: "Klicev Claude (danes / 7 dni / skupaj)",
  odlocitev: "Zadnja odločitev",
  razlog: "Zakaj",
  naslednji_krog: "Naslednji krog",
  meja_narocnine_odstotkov: "Meja naročnine (%)",
  model: "Model",
  mozgani: "Opomba modela",
};

export function vrednostStevilke(kljuc: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "da" : "ne";
  if (typeof v === "number") return stevilo(v);
  if (kljuc === "odlocitev" && typeof v === "string") return ODLOCITEV[v] ?? v;
  if (kljuc === "naslednji_krog" && typeof v === "string") return uraLokalno(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("danes" in o && "teden" in o && "skupaj" in o) {
      return `${stevilo(o.danes as number)} / ${stevilo(o.teden as number)} / ${stevilo(o.skupaj as number)}`;
    }
    return JSON.stringify(v);
  }
  return String(v);
}
