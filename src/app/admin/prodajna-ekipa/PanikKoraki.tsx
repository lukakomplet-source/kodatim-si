"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Phone } from "lucide-react";
import type { HladniKlic, HladniKlici, IzidKlica, Posiljanje, Skrb } from "@/lib/prodajna-ekipa";
import { opisObsega } from "@/lib/obsegPrevoznika";
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
    rece: "Tega nam po zakonu ni treba.",
    odgovor:
      "Imate prav, gumba zakon ne predpisuje. Predpisuje pa, da imate pisno oceno tveganja in ukrepe tudi za voznika na poti. Kako imate to danes napisano?",
  },
  {
    rece: "Imamo zavarovanje.",
    odgovor:
      "Odlično, to je pametno. Zavarovanje plača škodo za nazaj. Kdo pa vozniku pomaga v tistih petih minutah, ko se dogaja?",
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
          Brez maila prej: »Dober dan, Luka Komplet iz Kompletka. Kličem prevoznike glede varnosti voznikov na poti. Kdo
          pri vas skrbi za to?«
        </p>
        <p>
          Po mailu: »Dober dan, Luka Komplet iz Kompletka. Pred par dnevi sem vam pisal o voznikih ponoči na
          parkiriščih. Sem vas ujel v slabem trenutku?« (Skoraj vsak reče »ne, povejte«. S tem ti je sam dal dovoljenje.)
        </p>
      </div>
      <div>
        <p className="font-semibold text-zinc-900">1. Problem: vprašaj in molči, naj pove sam</p>
        <p>
          »Kaj vas pri voznikih na poti najbolj skrbi?« Odgovor zapiši z njegovimi besedami v polje »Kaj jih skrbi«.
        </p>
        <p>»Se je pri vas ali pri kolegih že kaj zgodilo? Kraja goriva, prerezana cerada, napad na voznika?«</p>
        <p>»Če se to zgodi ponoči, kdo pri vas izve prvi? In v koliko časa?«</p>
      </div>
      <div>
        <p className="font-semibold text-zinc-900">2. Cena: naj jo izračuna on</p>
        <p>
          »Kaj bi vas tak dogodek stal? Tovor, vozilo, ki stoji, voznik na bolniški, stranka, ki čaka.« Številke ne
          povej ti; ko jo izgovori sam, si jo zapomni.
        </p>
      </div>
      <div>
        <p className="font-semibold text-zinc-900">3. Zakon: kot nasvet, ne kot grožnja</p>
        <p>
          »Še nekaj, kar prevozniki pogosto spregledajo: po zakonu o varnosti in zdravju pri delu (ZVZD-1, 17. člen) mora
          imeti vsak delodajalec, ne glede na število zaposlenih, pisno oceno tveganja za delo svojih ljudi. Tudi za
          voznika, ki ponoči sam stoji na parkirišču. Ali imate tam napisano, kako voznik pokliče pomoč, če sam ne
          more?«
        </p>
        <p className="mt-1 text-zinc-500">
          Res je: zakon zahteva oceno tveganja in ukrepe, gumba ne predpisuje. Nikoli ne reci »zakon zahteva panik
          gumb« in ne omenjaj zneskov glob.
        </p>
      </div>
      <div>
        <p className="font-semibold text-zinc-900">4. Predlog z dvema možnostma</p>
        <p>
          »Predlagam takole: 20 minut, pri vas ali na Teams. Pokažem vam, kako gumb deluje, in skupaj pogledava, ali
          imate voznike na poti v oceni tveganja pokrite. Vam bolj ustreza torek dopoldne ali četrtek popoldne?«
        </p>
        <p className="mt-1 text-zinc-500">Ko reče termin, ga ponovi in vpiši v opombo. Potem nehaj prodajati.</p>
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

const POLJE = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";

/** Številke kot tel: gumbi in »Vpiši izid« z obrazcem (kdo odloča, komu pisati, kaj jih skrbi, opomba). */
function KlicIzid({
  domena,
  telefon,
  oseba: zacetnaOseba,
  komu: zacetniKomu,
  hladni,
}: {
  domena: string;
  telefon?: string;
  oseba?: string;
  komu?: string;
  hladni: boolean;
}) {
  const [odprt, setOdprt] = useState(false);
  const [oseba, setOseba] = useState(zacetnaOseba ?? "");
  const [komu, setKomu] = useState(zacetniKomu ?? "");
  const [skrb, setSkrb] = useState("");
  const [opomba, setOpomba] = useState("");
  const [napaka, setNapaka] = useState("");
  const [poteka, zacni] = useTransition();

  const vpisi = (izid: IzidKlica) =>
    zacni(async () => {
      const r = await zabeleziKlicAkcija(domena, izid, oseba, opomba, komu, skrb, hladni);
      setNapaka(r.ok ? "" : (r.napaka ?? "Ni uspelo."));
      if (r.ok) setOdprt(false);
    });

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        {telefon ? (
          telefon.split(",").map((t) => (
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
            Kaj jih skrbi (njihove besede)
            <input
              value={skrb}
              onChange={(e) => setSkrb(e.target.value)}
              placeholder="npr. kraja goriva na parkiriščih v Italiji"
              className={POLJE}
            />
          </label>
          <label className="block text-sm text-zinc-700">
            Kdo odloča (kar ti povedo)
            <input
              value={oseba}
              onChange={(e) => setOseba(e.target.value)}
              placeholder="npr. gospod Novak, vodja voznega parka"
              className={POLJE}
            />
          </label>
          <label className="block text-sm text-zinc-700">
            Komu pisati (mail, ki ti ga povedo)
            <input
              type="email"
              value={komu}
              onChange={(e) => setKomu(e.target.value)}
              placeholder="npr. novak@podjetje.si"
              className={POLJE}
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
              className={POLJE}
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
      {napaka ? <p className="mt-1 text-sm text-red-700">{napaka}</p> : null}
    </div>
  );
}

function Korak({ p }: { p: Posiljanje }) {
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
      {jeKlic(p.naslednje) ? (
        <KlicIzid domena={p.domena} telefon={p.telefon} oseba={p.oseba} komu={p.oseba_email} hladni={false} />
      ) : (
        <p className="mt-1 text-sm text-zinc-500">Osnutek pripravim jaz, med pripravljenimi maili ga odpreš v Outlooku.</p>
      )}
    </li>
  );
}

/** Prevoznik, ki mu še nismo pisali: klic najprej, mail po klicu (Luka, 29. 10. 2026: »cold call mi deluje«). */
function HladniKorak({ k }: { k: HladniKlic }) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-base font-semibold text-zinc-900">{k.podjetje}</p>
        <span className="text-sm font-medium text-zinc-700">
          {k.poskusi ? `Pokliči znova (${k.poskusi + 1}. poskus)` : "Prvi klic"}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-zinc-500">
        {[k.kraj, k.email, k.oseba ? `odloča: ${k.oseba}` : ""].filter(Boolean).join(" · ")}
      </p>
      {opisObsega(k) ? (
        <p className="mt-0.5 text-sm font-medium text-zinc-700" title={k.tovornjaki_dokaz || undefined}>
          {opisObsega(k)}
        </p>
      ) : null}
      <KlicIzid domena={k.domena} telefon={k.telefon} oseba={k.oseba} komu={k.oseba_email} hladni />
    </li>
  );
}

function KliciDanes({ hladni, skrbi }: { hladni: HladniKlici; skrbi: Skrb[] }) {
  const [prikaziSkrbi, setPrikaziSkrbi] = useState(false);
  const ostane = hladni.klici.length;
  return (
    <div className="mt-6 border-t border-zinc-100 pt-4">
      <h4 className="text-base font-semibold text-zinc-900">Klici danes: najprej klic, mail po klicu</h4>
      <p className="mt-1 text-sm text-zinc-500">
        {ostane
          ? `Poklicanih ${hladni.poklicaniDanes} od ${hladni.naDan}. Najprej večji prevozniki, številka je z njihove strani. Pri »Pošljite na mail« pripravim mail po klicu, hladni mail za to podjetje pa umaknem.`
          : `Danes si poklical vseh ${hladni.poklicaniDanes}. Jutri jih pride novih ${hladni.naDan}.`}
      </p>
      {ostane ? (
        <ul className="mt-2 divide-y divide-zinc-100">
          {hladni.klici.map((k) => (
            <HladniKorak key={k.domena} k={k} />
          ))}
        </ul>
      ) : null}
      {skrbi.length ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setPrikaziSkrbi((s) => !s)}
            aria-expanded={prikaziSkrbi}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
          >
            Kaj jih skrbi ({skrbi.length})
            <ChevronDown className={`h-4 w-4 transition-transform ${prikaziSkrbi ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {prikaziSkrbi ? (
            <ul className="mt-2 space-y-1.5 text-sm">
              {skrbi.map((s) => (
                <li key={`${s.domena}-${s.klicano}`}>
                  <span className="text-zinc-900">»{s.skrb}«</span>{" "}
                  <span className="text-zinc-500">
                    {s.naziv}, {datum(s.klicano)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PanikKoraki({
  podjetja,
  hladniKlici,
  skrbi,
}: {
  podjetja: Posiljanje[];
  hladniKlici: HladniKlici | null;
  skrbi: Skrb[];
}) {
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
      {hladniKlici ? <KliciDanes hladni={hladniKlici} skrbi={skrbi} /> : null}
    </section>
  );
}
