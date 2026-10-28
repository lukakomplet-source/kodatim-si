"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Phone } from "lucide-react";
import { opisObsega, type IzidKlica, type Posiljanje } from "@/lib/prodajna-ekipa";
import { zabeleziKlicAkcija } from "./actions";

/**
 * Panik gumb: kdo je danes na vrsti in kaj (Luka, 28. 10. 2026: »follow upala z mailom pa s klicom, pa še enkrat
 * … mail video … da jih dobimo na catch-up meeting«). Koraki in datumi pridejo iz Harveyja Kompletko
 * (harvey/posiljanja.py: follow-up → klic → mail po klicu → video → zadnji mail, samo delavniki).
 * Maile Luka pošlje sam iz Outlooka (osnutki so zgoraj v mapi), klic tu samo vpiše.
 */

const IZIDI: { izid: IzidKlica; besedilo: string; razlaga: string }[] = [
  { izid: "sestanek", besedilo: "Sestanek", razlaga: "dogovorjen termin" },
  { izid: "poslji_mail", besedilo: "Pošljite na mail", razlaga: "pripravim mail z dvema terminoma" },
  { izid: "ni_dvignil", besedilo: "Ni dvignil", razlaga: "pokličeš znova naslednji delavnik" },
  { izid: "ne_zanima", besedilo: "Ne zanima", razlaga: "izpade iz zaporedja" },
];

const IZID_BESEDILO: Record<IzidKlica, string> = {
  sestanek: "sestanek",
  poslji_mail: "želijo mail",
  ni_dvignil: "ni dvignil",
  ne_zanima: "ne zanima",
};

function datum(iso: string): string {
  const [l, m, d] = iso.slice(0, 10).split("-");
  if (!d) return "";
  const dan = new Date(Number(l), Number(m) - 1, Number(d)).toLocaleDateString("sl-SI", { weekday: "short" });
  return `${dan} ${Number(d)}. ${Number(m)}.`;
}

function jeKlic(korak: string): boolean {
  return korak.startsWith("Pokliči");
}

/** Odgovori na zavrnitve po 3A: potrdi, poveži, vprašaj (Documents\HARVEY\pravila-pogovora.md, 28. 10. 2026). */
const ZAVRNITVE: { rece: string; odgovor: string; izid?: string }[] = [
  {
    rece: "Imamo GPS.",
    odgovor:
      "Odlično, to pomeni, da varnost voznikov že jemljete resno. GPS pove, kje je vozilo. Kdo pa danes ukrepa, če voznik ponoči na parkirišču potrebuje pomoč?",
  },
  {
    rece: "Nimamo časa.",
    odgovor: "Razumem, v prevozu je vedno veliko dela. Ravno zato traja samo 15 minut. Je lažje naslednji teden na Teams?",
  },
  {
    rece: "Pošljite na mail.",
    odgovor: "Seveda, z veseljem. Komu naj pošljem, da ne pristane med ostalimi?",
    izid: "Pošljite na mail, vpiši ime in mail",
  },
  {
    rece: "Moram vprašati šefa.",
    odgovor: "Seveda, smiselno. Kaj mislite, kaj ga bo najprej zanimalo? Da mu pripravim točno to.",
  },
  {
    rece: "Koliko stane?",
    odgovor:
      "Odvisno od števila vozil, zato vam na pamet ne bi rekel napačne številke. Koliko vozil imate na poti? Na sestanku vam pokažem točno za vaš vozni park.",
  },
  {
    rece: "Bom premislil.",
    odgovor: "Seveda. Kaj je glavna stvar, o kateri razmišljate?",
  },
  {
    rece: "Ne rabimo.",
    odgovor: "V redu, hvala za iskren odgovor. Lahko samo vprašam, kako imate to danes urejeno?",
    izid: "Ne zanima",
  },
];

function ScenarijKlica() {
  return (
    <div className="space-y-3 text-sm leading-6 text-zinc-700">
      <div>
        <p className="font-semibold text-zinc-900">Uvod</p>
        <p>
          »Dober dan, Luka Komplet iz Kompletka. Pred par dnevi sem vam pisal glede klica v sili za voznike. Kdo pri vas
          skrbi za varnost voznikov na poti?«
        </p>
      </div>
      <div>
        <p className="font-semibold text-zinc-900">Dve vprašanji, odgovori naj sam</p>
        <p>»Kaj voznik danes naredi, če ga ponoči na parkirišču kdo ogroža ali mu postane slabo?«</p>
        <p>»Kako hitro pa vi izveste, da je nekaj narobe?«</p>
      </div>
      <div>
        <p className="font-semibold text-zinc-900">Predlog</p>
        <p>
          »Bi si vzeli 15 minut, da vam pokažem, kako to rešujemo? Lahko na Teams ali pridem k vam. Vam bolj ustreza
          torek dopoldne ali četrtek popoldne?«
        </p>
      </div>
      <div>
        <p className="font-semibold text-zinc-900">Če rečejo … (potrdi, poveži, vprašaj)</p>
        <ul className="list-disc space-y-1.5 pl-5">
          {ZAVRNITVE.map((z) => (
            <li key={z.rece}>
              <span className="font-medium">»{z.rece}«</span> »{z.odgovor}«
              {z.izid ? <span className="text-zinc-500"> Izid: {z.izid}.</span> : null}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-semibold text-zinc-900">Ko je pogovor dober</p>
        <p>»Česa se bojite, da bi se zgodilo?« Na jasno vprašanje (licenca, kdo pride) odgovori naravnost: intervencijo izvaja ProtecTrans z licenco.</p>
        <p className="mt-1 text-zinc-500">Nikoli: »Imate kakšno vprašanje?«, prepir, pritisk ali izmišljena zgodba o stranki.</p>
      </div>
      <div>
        <p className="font-semibold text-zinc-900">Na koncu sestanka: priporočilo</p>
        <p>
          »Poznate še kakšnega prevoznika, ki bi mu to koristilo? Lahko rečem, da prihajam od vas?« Ime in mail vpiši v
          opombo, pripravim mail z njegovim priporočilom.
        </p>
      </div>
    </div>
  );
}

function Korak({ p }: { p: Posiljanje }) {
  const [odprt, setOdprt] = useState(false);
  const [oseba, setOseba] = useState(p.oseba ?? "");
  const [opomba, setOpomba] = useState("");
  const [komu, setKomu] = useState(p.oseba_email ?? "");
  const [napaka, setNapaka] = useState("");
  const [poteka, zacni] = useTransition();
  const klic = jeKlic(p.naslednje);

  const vpisi = (izid: IzidKlica) =>
    zacni(async () => {
      const r = await zabeleziKlicAkcija(p.domena, izid, oseba, opomba, komu);
      setNapaka(r.ok ? "" : (r.napaka ?? "Ni uspelo."));
      if (r.ok) setOdprt(false);
    });

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-base font-semibold text-zinc-900">{p.podjetje}</p>
        <span className="text-sm font-medium text-zinc-700">{p.naslednje}</span>
      </div>
      <p className="mt-0.5 text-sm text-zinc-500">
        {p.email}
        {p.oseba ? ` · odloča: ${p.oseba}` : ""}
        {p.klic_izid ? ` · zadnji klic: ${IZID_BESEDILO[p.klic_izid]}` : ""}
      </p>
      {opisObsega(p) ? (
        <p className="mt-0.5 text-sm font-medium text-zinc-700" title={p.tovornjaki_dokaz || undefined}>
          {opisObsega(p)}
        </p>
      ) : null}
      {klic ? (
        <div className="mt-2">
          <div className="flex flex-wrap items-center gap-2">
            {p.telefon ? (
              p.telefon.split(",").map((t) => (
                <a
                  key={t}
                  href={`tel:${t.replace(/[^\d+]/g, "")}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
                >
                  <Phone className="h-4 w-4" aria-hidden />
                  {t.trim()}
                </a>
              ))
            ) : (
              <span className="text-sm text-zinc-500">Številke na njihovi strani ni.</span>
            )}
            <button
              type="button"
              onClick={() => setOdprt((o) => !o)}
              aria-expanded={odprt}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
            >
              Vpiši izid
              <ChevronDown className={`h-4 w-4 transition-transform ${odprt ? "rotate-180" : ""}`} aria-hidden />
            </button>
          </div>
          {odprt ? (
            <div className="mt-3 space-y-2 rounded-xl bg-zinc-50 p-3">
              <label className="block text-sm text-zinc-700">
                Kdo odloča (kar ti povedo)
                <input
                  value={oseba}
                  onChange={(e) => setOseba(e.target.value)}
                  placeholder="npr. gospod Novak, vodja voznega parka"
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm text-zinc-700">
                Komu pisati (mail, ki ti ga povedo)
                <input
                  type="email"
                  value={komu}
                  onChange={(e) => setKomu(e.target.value)}
                  placeholder="npr. novak@podjetje.si"
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-zinc-500">
                  Pri »Pošljite na mail« pripravim mail na ime: »vaš sodelavec mi je svetoval, naj vam pišem«. Za nagovor
                  zgoraj napiši »gospod« ali »gospa« in priimek.
                </span>
              </label>
              <label className="block text-sm text-zinc-700">
                Opomba
                <input
                  value={opomba}
                  onChange={(e) => setOpomba(e.target.value)}
                  placeholder="npr. torek ob 9.00 na Teams"
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                {IZIDI.map((i) => (
                  <button
                    key={i.izid}
                    type="button"
                    disabled={poteka}
                    onClick={() => vpisi(i.izid)}
                    title={i.razlaga}
                    className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 ring-1 ring-zinc-300 hover:bg-zinc-100 disabled:opacity-50"
                  >
                    {i.besedilo}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-1 text-sm text-zinc-500">Osnutek pripravim jaz, med pripravljenimi maili ga odpreš v Outlooku.</p>
      )}
      {napaka ? <p className="mt-1 text-sm text-red-700">{napaka}</p> : null}
    </li>
  );
}

export function PanikKoraki({ podjetja }: { podjetja: Posiljanje[] }) {
  const [scenarij, setScenarij] = useState(false);
  const [kasneje, setKasneje] = useState(false);
  const vrsta = podjetja.filter((p) => p.naslednje);
  const danes = vrsta.filter((p) => p.zaDanes);
  const prihodnji = vrsta
    .filter((p) => !p.zaDanes)
    .sort((a, b) => (a.naslednjeKdaj || "").localeCompare(b.naslednjeKdaj || ""));
  const klicev = danes.filter((p) => jeKlic(p.naslednje)).length;

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200 sm:p-5" aria-labelledby="panik-danes">
      <h3 id="panik-danes" className="text-lg font-semibold text-zinc-900">
        Panik gumb: danes na vrsti
      </h3>
      <p className="mt-1 text-sm text-zinc-500">
        {danes.length
          ? `Pošlji ${danes.length - klicev}, pokliči ${klicev}. Cilj vsakega koraka je 15 minut na Teams ali obisk.`
          : "Danes ni nič na vrsti."}
      </p>
      {danes.length ? <ul className="mt-2 divide-y divide-zinc-100">{danes.map((p) => <Korak key={p.domena} p={p} />)}</ul> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setScenarij((s) => !s)}
          aria-expanded={scenarij}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
        >
          Scenarij klica
          <ChevronDown className={`h-4 w-4 transition-transform ${scenarij ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {prihodnji.length ? (
          <button
            type="button"
            onClick={() => setKasneje((s) => !s)}
            aria-expanded={kasneje}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
          >
            Naslednji dnevi ({prihodnji.length})
            <ChevronDown className={`h-4 w-4 transition-transform ${kasneje ? "rotate-180" : ""}`} aria-hidden />
          </button>
        ) : null}
      </div>
      {scenarij ? (
        <div className="mt-3 rounded-xl bg-zinc-50 p-4">
          <ScenarijKlica />
        </div>
      ) : null}
      {kasneje ? (
        <ul className="mt-3 divide-y divide-zinc-100 text-sm">
          {prihodnji.map((p) => (
            <li key={p.domena} className="flex flex-wrap justify-between gap-2 py-2">
              <span className="text-zinc-900">{p.podjetje}</span>
              <span className="text-zinc-500">
                {p.naslednje}, {datum(p.naslednjeKdaj)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
