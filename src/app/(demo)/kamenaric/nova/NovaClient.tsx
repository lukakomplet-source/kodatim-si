"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BadgePercent,
  Bot,
  Check,
  Clock,
  FileText,
  Mail,
  MapPin,
  Package,
  Phone,
  RotateCcw,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Tag,
  Truck,
  Upload,
  X,
} from "lucide-react";
import VerzijaStikalo from "../VerzijaStikalo";
import {
  DODELAVE,
  IZDELKI,
  KATEGORIJE,
  KONTAKT,
  PAKETI,
  POGOJI,
  REFERENCE,
  VSEBINA_PAKETOV,
  cenaNaKos,
  cenaOd,
  dostavaVode,
  eur,
  najvecjiPrihranek,
  slika,
  stopnjaZa,
  type Izdelek,
  type KategorijaId,
  type Paket,
} from "./podatki";

type Postavka = { id: string; izdelek: Izdelek; kolicina: number; izbira?: string; logo: string | null; vzorec?: boolean };
type NovaPostavka = Omit<Postavka, "id">;

const MODRA = "bg-[#1546d8] hover:bg-[#0f38b4] text-white";
const OBROBA = "border border-[#e3e6ee]";
const VNOS = "w-full rounded-lg border border-[#d9dde6] bg-white px-4 py-3 text-sm outline-none focus:border-[#1546d8] focus:ring-2 focus:ring-[#1546d8]/15";

const VODA = IZDELKI.find((i) => i.id === "voda-05")!;

function zneskiKosarice(postavke: Postavka[]) {
  let blago = 0;
  let vodaKos = 0;
  let poPonudbi = 0;
  for (const p of postavke) {
    const c = cenaNaKos(p.izdelek, p.kolicina);
    if (c === null) poPonudbi++;
    else blago += c * p.kolicina;
    if (p.izdelek.kategorija === "voda" && !p.vzorec) vodaKos += p.kolicina;
  }
  const dostavaV = vodaKos > 0 ? dostavaVode(vodaKos) : null;
  return { blago, poPonudbi, dostavaV, skupaj: blago + (dostavaV?.cena ?? 0) };
}

export default function NovaClient({ zacetniPaket }: { zacetniPaket: Paket }) {
  const [paket, setPaketState] = useState<Paket>(zacetniPaket);
  const [logo, setLogo] = useState<string | null>(null);
  const [kosarica, setKosarica] = useState<Postavka[]>([]);
  const [kosaricaOdprta, setKosaricaOdprta] = useState(false);
  const [izbran, setIzbran] = useState<Izdelek | null>(null);
  const [kategorija, setKategorija] = useState<KategorijaId | "vse">("vse");
  const [iskanje, setIskanje] = useState("");
  const [zaPovprasevanje, setZaPovprasevanje] = useState<string>("");
  const [potrdilo, setPotrdilo] = useState<{ st: string; povprasevanje: boolean } | null>(null);

  function setPaket(p: Paket) {
    setPaketState(p);
    const url = new URL(window.location.href);
    url.searchParams.set("paket", String(p));
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function dodaj(p: NovaPostavka) {
    setKosarica((k) => [...k, { ...p, id: `${p.izdelek.id}-${k.length}-${p.kolicina}` }]);
    setKosaricaOdprta(true);
  }

  function pojdi(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  function odpriKategorijo(id: KategorijaId | "vse") {
    setKategorija(id);
    setIskanje("");
    pojdi("katalog");
  }

  function povprasaj(besedilo: string) {
    setZaPovprasevanje(besedilo);
    setIzbran(null);
    setTimeout(() => pojdi("povprasevanje"), 50);
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f6f7f9] text-[#0b1530] antialiased selection:bg-[#1546d8] selection:text-white">
      <DemoVrstica paket={paket} setPaket={setPaket} />
      <Glava paket={paket} stevilo={kosarica.length} odpriKosarico={() => setKosaricaOdprta(true)} pojdi={pojdi} />
      <PromoTrak />
      <Uvod paket={paket} pojdi={pojdi} />
      <Kategorije odpri={odpriKategorijo} />
      <VodaKalkulator paket={paket} logo={logo} setLogo={setLogo} dodaj={dodaj} povprasaj={povprasaj} />
      <Katalog
        paket={paket}
        kategorija={kategorija}
        setKategorija={setKategorija}
        iskanje={iskanje}
        setIskanje={setIskanje}
        odpri={setIzbran}
      />
      <Sezona paket={paket} odpri={setIzbran} />
      <Dodelave />
      <Reference />
      <KakoPoslujemo />
      <Povprasevanje logo={logo} setLogo={setLogo} predizpolnjeno={zaPovprasevanje} />
      {paket === 3 && <Portal logo={logo} setLogo={setLogo} dodaj={dodaj} />}
      <KajDobite paket={paket} setPaket={setPaket} />
      <Noga />

      {izbran && (
        <IzdelekOkno
          izdelek={izbran}
          paket={paket}
          logo={logo}
          setLogo={setLogo}
          zapri={() => setIzbran(null)}
          dodaj={(p) => {
            dodaj(p);
            setIzbran(null);
          }}
          povprasaj={povprasaj}
        />
      )}
      {kosaricaOdprta && (
        <Kosarica
          postavke={kosarica}
          odstrani={(id) => setKosarica((k) => k.filter((p) => p.id !== id))}
          zapri={() => setKosaricaOdprta(false)}
          oddaj={(povprasevanje) => {
            setPotrdilo({ st: `KM-2026-${String(212 + kosarica.length).padStart(4, "0")}`, povprasevanje });
            setKosarica([]);
            setKosaricaOdprta(false);
          }}
        />
      )}
      {potrdilo && <Potrdilo {...potrdilo} zapri={() => setPotrdilo(null)} />}
    </div>
  );
}

/* ───────────────────────── vrstica, glava, promo trak ───────────────────────── */

function DemoVrstica({ paket, setPaket }: { paket: Paket; setPaket: (p: Paket) => void }) {
  return (
    <div className="sticky top-0 z-50 bg-[#0b1530] text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-1.5">
        <div className="flex items-center gap-3">
          <VerzijaStikalo verzija="nova" paket={paket} />
          <p className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 lg:block">Predogled · KodaTim.si</p>
        </div>
        <div className="flex items-center gap-1">
          {PAKETI.map((p) => (
            <button
              key={p.st}
              onClick={() => setPaket(p.st)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${paket === p.st ? "bg-[#1546d8] text-white" : "text-white/70 hover:bg-white/10"}`}
            >
              {p.st} <span className="hidden sm:inline">· {p.ime}</span>
            </button>
          ))}
          <a href="#kaj-dobite" className="ml-1 hidden px-2 text-xs font-semibold text-white/80 underline underline-offset-4 md:block">
            Kaj dobim?
          </a>
        </div>
      </div>
    </div>
  );
}

function Logotip({ className = "" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={slika("logo-kamenaric")} alt="Kamenarič d.o.o. — promo izdelki in poslovna darila" className={className} />;
}

const MENI: { ime: string; cilj: string }[] = [
  { ime: "Promocijska voda", cilj: "voda" },
  { ime: "Rokovniki 2027", cilj: "sezona" },
  { ime: "Katalog", cilj: "katalog" },
  { ime: "Dodelave", cilj: "dodelave" },
  { ime: "Pogoji", cilj: "pogoji" },
];

function Glava({
  paket,
  stevilo,
  odpriKosarico,
  pojdi,
}: {
  paket: Paket;
  stevilo: number;
  odpriKosarico: () => void;
  pojdi: (id: string) => void;
}) {
  return (
    <header className="bg-white">
      <div className="border-b border-[#eef0f4] bg-[#f6f7f9]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-x-6 gap-y-1 px-4 py-1.5 text-xs text-[#4b5563]">
          <span className="hidden items-center gap-1.5 md:flex">
            <Clock className="h-3.5 w-3.5 text-[#1546d8]" /> {KONTAKT.ure}
          </span>
          <a href={`mailto:${KONTAKT.email}`} className="flex items-center gap-1.5 hover:text-[#1546d8]">
            <Mail className="h-3.5 w-3.5 text-[#1546d8]" /> {KONTAKT.email}
          </a>
          <a href={KONTAKT.telefonHref} className="flex items-center gap-1.5 hover:text-[#1546d8]">
            <Phone className="h-3.5 w-3.5 text-[#1546d8]" /> {KONTAKT.telefonMednarodno}
          </a>
        </div>
      </div>
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
        <a href="#" className="shrink-0">
          <Logotip className="h-9 w-auto sm:h-11" />
        </a>
        <nav className="hidden flex-1 items-center justify-center gap-6 text-sm font-medium text-[#1f2a44] xl:flex">
          {MENI.map((m) => (
            <button key={m.ime} onClick={() => pojdi(m.cilj)} className="whitespace-nowrap hover:text-[#1546d8]">
              {m.ime}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => pojdi("katalog")} className={`rounded-lg ${OBROBA} bg-white p-2.5 hover:border-[#1546d8]`} aria-label="Išči izdelke">
            <Search className="h-5 w-5" />
          </button>
          {paket >= 2 && (
            <button onClick={odpriKosarico} className={`relative rounded-lg ${OBROBA} bg-white p-2.5 hover:border-[#1546d8]`} aria-label="Košarica">
              <ShoppingBag className="h-5 w-5" />
              {stevilo > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1546d8] px-1 text-[11px] font-bold text-white">
                  {stevilo}
                </span>
              )}
            </button>
          )}
          {paket === 3 && (
            <button onClick={() => pojdi("portal")} className={`hidden rounded-lg ${OBROBA} bg-white px-4 py-2.5 text-sm font-semibold hover:border-[#1546d8] md:block`}>
              Moj račun
            </button>
          )}
          <button
            onClick={() => pojdi(paket === 1 ? "povprasevanje" : "katalog")}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold ${MODRA}`}
          >
            <span className="hidden sm:inline">{paket === 1 ? "Pošlji povpraševanje" : "Naroči na spletu"}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

const PROMO = [
  { ikona: Truck, a: `Brezplačna dostava nad ${POGOJI.brezPostnine} €`, b: "po Sloveniji" },
  { ikona: Tag, a: "Vaš logotip na vseh izdelkih", b: "tisk, vezenje, gravura" },
  { ikona: BadgePercent, a: "Količinski popusti", b: "pri vodi do −45 %" },
  { ikona: Package, a: "Naročene vzorce obdržite", b: "preverite, preden naročite" },
];

function PromoTrak() {
  return (
    <div className="bg-[#1546d8] text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 gap-y-2 px-4 py-2.5 lg:grid-cols-4">
        {PROMO.map(({ ikona: I, a, b }) => (
          <div key={a} className="flex min-w-0 items-center gap-2.5">
            <I className="h-5 w-5 shrink-0 text-white/90" strokeWidth={1.8} />
            <p className="min-w-0 text-[12px] leading-tight sm:text-[13px]">
              <span className="font-semibold">{a}</span> <span className="hidden text-white/70 sm:inline">· {b}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── uvod ───────────────────────── */

function Foto({ ime, className = "", alt = "", contain }: { ime: string; className?: string; alt?: string; contain?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-2xl ${contain ? "bg-white" : "bg-[#e9ecf2]"} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={slika(ime)}
        alt={alt}
        loading="lazy"
        className={`h-full w-full transition duration-500 hover:scale-105 ${contain ? "object-contain p-2" : "object-cover"}`}
      />
    </div>
  );
}

function Uvod({ paket, pojdi }: { paket: Paket; pojdi: (id: string) => void }) {
  return (
    <section className="overflow-hidden bg-gradient-to-b from-white to-[#f6f7f9]">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-14 pt-10 lg:grid-cols-[1fr_1.1fr] lg:pb-20 lg:pt-14">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1546d8]">Promo izdelki in poslovna darila · Ljubljana</p>
          <h1 className="mt-5 text-[clamp(2.2rem,5vw,4.2rem)] font-extrabold leading-[1.03] tracking-tight">
            Vaš logotip na vsem,
            <br />
            kar vaše stranke <span className="text-[#1546d8]">vzamejo v roke.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-[#374151]">
            Promocijska voda, rokovniki, oblačila, dišeči obeski, brisače in poslovna darila — z vašim znakom, logotipom ali sloganom.{" "}
            <span className="text-[#6b7280]">Česar ne najdete v ponudbi, poiščemo.</span>
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button onClick={() => pojdi("katalog")} className={`flex items-center gap-2 rounded-lg px-6 py-3.5 text-sm font-semibold ${MODRA}`}>
              Oglejte si katalog <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => pojdi("voda")}
              className={`flex items-center gap-2 rounded-lg ${OBROBA} bg-white px-6 py-3.5 text-sm font-semibold hover:border-[#1546d8]`}
            >
              <FileText className="h-4 w-4" /> {paket === 1 ? "Izračunajte ceno vode" : "Izračunaj in naroči"}
            </button>
          </div>
          <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4 sm:divide-x sm:divide-[#e3e6ee]">
            {[
              ["13", "skupin izdelkov"],
              [eur(0.2646, 2), "voda na kos pri 1.200"],
              [`${POGOJI.brezPostnine} €`, "brez poštnine"],
            ].map(([a, b]) => (
              <div key={b} className="sm:pl-4 sm:first:pl-0">
                <dt className="text-xl font-extrabold tracking-tight sm:text-2xl">{a}</dt>
                <dd className="text-xs leading-tight text-[#6b7280]">{b}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative grid h-[340px] grid-cols-6 grid-rows-6 gap-3 sm:h-[480px]">
          <Foto ime="voda-promo" className="col-span-6 row-span-3" alt="Promocijska voda z etiketami" />
          <Foto ime="diseci-novi" className="col-span-2 row-span-3" alt="Dišeči obeski" />
          <Foto ime="brisace-tumb" className="col-span-2 row-span-3" alt="Brisače" />
          <Foto ime="vrecke-darilne" className="col-span-2 row-span-3" alt="Darilne vrečke" />
          <div className="absolute -bottom-4 right-4 hidden items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-lg shadow-black/10 sm:flex">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eef3ff]">
              <BadgePercent className="h-5 w-5 text-[#1546d8]" />
            </div>
            <div>
              <p className="text-sm font-bold">Voda z vašo etiketo</p>
              <p className="text-xs text-[#6b7280]">že od {eur(0.2646)} / plastenko</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── kategorije ───────────────────────── */

function Kategorije({ odpri }: { odpri: (id: KategorijaId | "vse") => void }) {
  return (
    <section id="ponudba" className="mx-auto max-w-7xl scroll-mt-12 px-4 py-16">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1546d8]">Ponudba</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Kaj vse opremimo z vašim logotipom</h2>
        </div>
        <button onClick={() => odpri("vse")} className={`flex items-center gap-2 rounded-lg ${OBROBA} bg-white px-4 py-2.5 text-sm font-semibold hover:border-[#1546d8]`}>
          Vsi izdelki <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {KATEGORIJE.map((k, i) => {
          const st = IZDELKI.filter((x) => x.kategorija === k.id).length;
          return (
            <button
              key={k.id}
              onClick={() => odpri(k.id)}
              className={`group overflow-hidden rounded-xl ${OBROBA} bg-white text-left transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 ${i === 0 ? "col-span-2 row-span-2" : ""}`}
            >
              <div className={`overflow-hidden bg-white ${i === 0 ? "aspect-[4/3] sm:aspect-[16/11]" : "aspect-[4/3]"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slika(k.slika)} alt={k.ime} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              </div>
              <div className="flex items-start justify-between gap-2 p-3.5">
                <div className="min-w-0">
                  <h3 className={`font-bold leading-tight ${i === 0 ? "text-lg" : ""}`}>{k.ime}</h3>
                  <p className="mt-0.5 text-xs leading-snug text-[#6b7280]">{k.opis}</p>
                  <p className="mt-1.5 text-[11px] font-semibold text-[#1546d8]">{st} izdelkov</p>
                </div>
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${OBROBA} group-hover:border-[#1546d8] group-hover:bg-[#1546d8] group-hover:text-white`}>
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ───────────────────────── voda: kalkulator ───────────────────────── */

const POKROVCEK_BARVE: Record<string, string> = {
  bel: "#f8fafc",
  črn: "#111827",
  zelen: "#16a34a",
  rdeč: "#dc2626",
  moder: "#1d4ed8",
  rumen: "#facc15",
  oranžen: "#f97316",
};

function Plastenka({ logo, pokrovcek, className = "" }: { logo: string | null; pokrovcek: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 300" className={className} role="img" aria-label="Predogled plastenke z vašo etiketo">
      <defs>
        <linearGradient id="km-steklo" x1="0" x2="1">
          <stop offset="0" stopColor="#dbeafe" />
          <stop offset="0.45" stopColor="#f8fbff" />
          <stop offset="1" stopColor="#c7d7f5" />
        </linearGradient>
      </defs>
      <rect x="42" y="6" width="36" height="24" rx="4" fill={POKROVCEK_BARVE[pokrovcek] ?? "#f8fafc"} stroke="#0b153022" />
      <path d="M46 30 h28 v14 c0 10 26 22 26 46 v190 c0 8 -6 14 -14 14 h-52 c-8 0 -14 -6 -14 -14 v-190 c0 -24 26 -36 26 -46 z" fill="url(#km-steklo)" stroke="#0b153026" />
      {[118, 236].map((y) => (
        <path key={y} d={`M20 ${y} q40 8 80 0`} fill="none" stroke="#0b153014" strokeWidth="3" />
      ))}
      <rect x="20" y="134" width="80" height="84" fill="#ffffff" stroke="#0b153018" />
      {logo ? (
        <image href={logo} x="26" y="142" width="68" height="68" preserveAspectRatio="xMidYMid meet" />
      ) : (
        <>
          <text x="60" y="172" textAnchor="middle" fontSize="11" fontWeight={900} fill="#1546d8" letterSpacing="1">
            VAŠ LOGO
          </text>
          <text x="60" y="190" textAnchor="middle" fontSize="7" fill="#6b7280">
            vaša etiketa
          </text>
        </>
      )}
    </svg>
  );
}

function NalaganjeLoga({ logo, setLogo, svetlo }: { logo: string | null; setLogo: (l: string | null) => void; svetlo?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => setLogo(String(r.result));
          r.readAsDataURL(f);
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${svetlo ? "bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20" : `${OBROBA} bg-white hover:border-[#1546d8]`}`}
      >
        <Upload className="h-4 w-4" /> {logo ? "Zamenjaj logotip" : "Naloži svoj logotip"}
      </button>
      {logo && (
        <button type="button" onClick={() => setLogo(null)} className={`text-xs underline ${svetlo ? "text-white/70" : "text-[#6b7280]"}`}>
          odstrani
        </button>
      )}
    </div>
  );
}

function VodaKalkulator({
  paket,
  logo,
  setLogo,
  dodaj,
  povprasaj,
}: {
  paket: Paket;
  logo: string | null;
  setLogo: (l: string | null) => void;
  dodaj: (p: NovaPostavka) => void;
  povprasaj: (b: string) => void;
}) {
  const [kolicina, setKolicina] = useState(600);
  const [pokrovcek, setPokrovcek] = useState("moder");
  const stopnje = VODA.stopnje!;
  const naKos = cenaNaKos(VODA, kolicina)!;
  const aktivna = stopnjaZa(VODA, kolicina);
  const prihranek = 1 - naKos / stopnje[0][1];
  const dostava = dostavaVode(kolicina);
  const blago = naKos * kolicina;

  return (
    <section id="voda" className="scroll-mt-12 bg-[#0b1530] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#8fb0ff]">Izpostavljeno · promocijska voda</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Plastenka z vašo etiketo — izračun v sekundi</h2>
          <p className="mt-3 max-w-md text-white/75">
            Izjemno uspešen način promocije na dogodkih ali ob obisku partnerjev. Naložite logotip in poglejte, kako bo videti.
          </p>
          <div className="mt-8 flex items-end gap-6">
            <div className="relative h-72 w-32 shrink-0">
              <div className="absolute inset-x-0 bottom-0 h-6 rounded-full bg-black/40 blur-md" />
              <Plastenka logo={logo} pokrovcek={pokrovcek} className="relative h-full w-full" />
            </div>
            <div className="space-y-4">
              <NalaganjeLoga logo={logo} setLogo={setLogo} svetlo />
              <div>
                <p className="mb-2 text-xs font-semibold text-white/60">Barva pokrovčka</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(POKROVCEK_BARVE).map(([ime, barva]) => (
                    <button
                      key={ime}
                      onClick={() => setPokrovcek(ime)}
                      aria-label={ime}
                      title={ime}
                      className={`h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-[#0b1530] ${pokrovcek === ime ? "ring-white" : "ring-transparent"}`}
                      style={{ background: barva }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl bg-white p-6 text-[#0b1530] sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#6b7280]">Izvirska voda 0,5 l · dobava {VODA.rok}</p>
              <p className="mt-1 text-4xl font-extrabold tracking-tight">
                {kolicina.toLocaleString("sl-SI")} <span className="text-lg font-semibold text-[#6b7280]">plastenk</span>
              </p>
            </div>
            {prihranek > 0.005 && (
              <span className="rounded-full bg-[#dcfce7] px-3 py-1.5 text-sm font-bold text-[#15803d]">prihranite {Math.round(prihranek * 100)} % na kos</span>
            )}
          </div>
          <input
            type="range"
            min={120}
            max={2400}
            step={60}
            value={kolicina}
            onChange={(e) => setKolicina(Number(e.target.value))}
            className="mt-5 w-full accent-[#1546d8]"
            aria-label="Količina plastenk"
          />
          <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {stopnje.map((s) => {
              const je = aktivna?.[0] === s[0];
              return (
                <button
                  key={s[0]}
                  onClick={() => setKolicina(s[0])}
                  className={`rounded-lg px-2 py-2 text-center transition ${je ? "bg-[#1546d8] text-white" : "bg-[#f1f3f7] hover:bg-[#e6e9f0]"}`}
                >
                  <span className={`block text-[11px] ${je ? "text-white/75" : "text-[#6b7280]"}`}>od {s[0].toLocaleString("sl-SI")}</span>
                  <span className="block text-sm font-bold">{eur(s[1], 4)}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-6 space-y-2 rounded-xl bg-[#f6f7f9] p-4 text-sm">
            <Vrstica a="Cena na plastenko" b={eur(naKos, 4)} />
            <Vrstica a={`Voda (${kolicina.toLocaleString("sl-SI")} × ${eur(naKos, 4)})`} b={eur(blago)} />
            <Vrstica a={`Dostava po Sloveniji (${dostava.opis})`} b={eur(dostava.cena)} />
            <div className="flex items-end justify-between border-t border-[#e3e6ee] pt-3">
              <span className="text-xs font-semibold text-[#6b7280]">Skupaj brez DDV</span>
              <span className="text-3xl font-extrabold">{eur(blago + dostava.cena)}</span>
            </div>
            <p className="text-[11px] leading-snug text-[#9aa1ad]">
              + DDV na vodo 9,5 %. Dobavljena količina lahko odstopa ±15 % (zaračuna se dejansko dobavljena). Oblikovanje etikete po 25 €/uro ali pošljete svojo (300 dpi, CMYK). Cene po ceniku kamenaric.si.
            </p>
          </div>
          {paket === 1 ? (
            <button
              onClick={() => povprasaj(`Promocijska voda 0,5 l — ${kolicina} plastenk, pokrovček ${pokrovcek}`)}
              className={`mt-5 flex w-full items-center justify-center gap-2 rounded-lg py-3.5 text-sm font-semibold ${MODRA}`}
            >
              Pošlji povpraševanje za to količino <Send className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => dodaj({ izdelek: VODA, kolicina, izbira: `pokrovček ${pokrovcek}`, logo })}
              className={`mt-5 flex w-full items-center justify-center gap-2 rounded-lg py-3.5 text-sm font-semibold ${MODRA}`}
            >
              <ShoppingBag className="h-4 w-4" /> Dodaj v košarico
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Vrstica({ a, b, poudari }: { a: string; b: string; poudari?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[#6b7280]">{a}</span>
      <span className={`shrink-0 ${poudari ? "font-bold text-[#15803d]" : "font-semibold"}`}>{b}</span>
    </div>
  );
}

/* ───────────────────────── katalog ───────────────────────── */

function CenaOznaka({ izdelek, velika }: { izdelek: Izdelek; velika?: boolean }) {
  const od = cenaOd(izdelek);
  if (od === null) return <p className={`font-semibold text-[#6b7280] ${velika ? "text-base" : "text-xs"}`}>Cena na povpraševanje</p>;
  return (
    <div>
      <p className="text-[11px] text-[#6b7280]">{izdelek.stopnje && izdelek.stopnje.length > 1 ? "že od" : "cena"}</p>
      <p className={`font-extrabold ${velika ? "text-3xl" : "text-lg"}`}>
        {eur(od, izdelek.stopnje ? 4 : 2)}
        <span className="text-xs font-medium text-[#6b7280]"> / kos + DDV</span>
      </p>
    </div>
  );
}

function Znacke({ izdelek }: { izdelek: Izdelek }) {
  const p = najvecjiPrihranek(izdelek);
  return (
    <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
      {p > 0 && <span className="rounded-md bg-[#15803d] px-2 py-0.5 text-[11px] font-bold text-white">do −{Math.round(p * 100)} %</span>}
      {izdelek.oznaka && <span className="rounded-md bg-[#1546d8] px-2 py-0.5 text-[11px] font-bold text-white">{izdelek.oznaka}</span>}
    </div>
  );
}

function Katalog({
  paket,
  kategorija,
  setKategorija,
  iskanje,
  setIskanje,
  odpri,
}: {
  paket: Paket;
  kategorija: KategorijaId | "vse";
  setKategorija: (k: KategorijaId | "vse") => void;
  iskanje: string;
  setIskanje: (s: string) => void;
  odpri: (i: Izdelek) => void;
}) {
  const prikazani = useMemo(() => {
    const q = iskanje.trim().toLowerCase();
    if (q) return IZDELKI.filter((i) => `${i.ime} ${i.opis}`.toLowerCase().includes(q));
    return kategorija === "vse" ? IZDELKI : IZDELKI.filter((i) => i.kategorija === kategorija);
  }, [iskanje, kategorija]);
  const kat = KATEGORIJE.find((k) => k.id === kategorija);

  return (
    <section id="katalog" className="scroll-mt-12 border-t border-[#e9ecf2] bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1546d8]">{paket === 1 ? "Katalog" : "Spletna trgovina"}</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{iskanje ? `Rezultati za »${iskanje}«` : kat ? kat.ime : "Vsi izdelki"}</h2>
          </div>
          <label className="flex w-full items-center gap-2 rounded-lg bg-[#f1f3f7] px-4 py-3 text-sm sm:w-80">
            <Search className="h-4 w-4 shrink-0 text-[#6b7280]" />
            <input
              value={iskanje}
              onChange={(e) => setIskanje(e.target.value)}
              placeholder="Išči: voda, rokovnik, brisača …"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#9aa1ad]"
            />
            {iskanje && (
              <button onClick={() => setIskanje("")} aria-label="Počisti">
                <X className="h-4 w-4 text-[#6b7280]" />
              </button>
            )}
          </label>
        </div>
        <div className="-mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {[{ id: "vse" as const, ime: "Vse" }, ...KATEGORIJE].map((k) => (
            <button
              key={k.id}
              onClick={() => {
                setKategorija(k.id);
                setIskanje("");
              }}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
                kategorija === k.id && !iskanje ? "bg-[#0b1530] text-white" : "bg-[#f1f3f7] text-[#374151] hover:bg-[#e6e9f0]"
              }`}
            >
              {k.ime}
            </button>
          ))}
        </div>
        {prikazani.length === 0 && (
          <p className="rounded-xl bg-[#f6f7f9] p-8 text-center text-sm text-[#4b5563]">
            Tega nimamo v katalogu — <b>poiščemo za vas.</b> Pošljite povpraševanje spodaj ali pokličite {KONTAKT.telefon}.
          </p>
        )}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {prikazani.map((i) => (
            <button
              key={i.id}
              onClick={() => odpri(i)}
              className={`group flex flex-col overflow-hidden rounded-xl ${OBROBA} bg-white text-left transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5`}
            >
              <div className="relative aspect-square w-full overflow-hidden bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slika(i.slika)}
                  alt={i.ime}
                  loading="lazy"
                  className={`h-full w-full transition duration-500 group-hover:scale-105 ${i.katalog ? "object-contain p-3" : "object-cover"}`}
                />
                <Znacke izdelek={i} />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="text-sm font-bold leading-snug sm:text-base">{i.ime}</h3>
                <p className="mt-1 text-xs text-[#6b7280]">{i.opis}</p>
                <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-4">
                  <CenaOznaka izdelek={i} />
                  <span className="flex items-center gap-1 text-xs font-semibold text-[#1546d8]">
                    Podrobnosti <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
        <p className="mt-6 text-xs text-[#9aa1ad]">
          Cene so informativne, v € brez DDV, po ceniku na kamenaric.si. Za aktualne cene nas prosimo preverite po e-pošti.
        </p>
      </div>
    </section>
  );
}

function IzdelekOkno({
  izdelek,
  paket,
  logo,
  setLogo,
  zapri,
  dodaj,
  povprasaj,
}: {
  izdelek: Izdelek;
  paket: Paket;
  logo: string | null;
  setLogo: (l: string | null) => void;
  zapri: () => void;
  dodaj: (p: NovaPostavka) => void;
  povprasaj: (b: string) => void;
}) {
  const zacetna = izdelek.min ?? (izdelek.cena ? 50 : 100);
  const [kolicina, setKolicina] = useState(zacetna);
  const [izbira, setIzbira] = useState(izdelek.izbira?.moznosti[0]);
  const c = cenaNaKos(izdelek, kolicina);
  const premalo = izdelek.min !== undefined && kolicina < izdelek.min;
  const kat = KATEGORIJE.find((k) => k.id === izdelek.kategorija)!;
  const opisIzbire = izdelek.izbira && izbira ? `${izdelek.izbira.ime.toLowerCase()}: ${izbira}` : undefined;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0b1530]/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={zapri}>
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#eef0f4] px-6 py-4">
          <p className="text-sm font-semibold text-[#6b7280]">{kat.ime}</p>
          <button onClick={zapri} aria-label="Zapri" className="rounded-lg p-1 hover:bg-[#f1f3f7]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid md:grid-cols-2">
          <div className="bg-[#f6f7f9] p-6">
            <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={slika(izdelek.slika)} alt={izdelek.ime} className={`h-full w-full ${izdelek.katalog ? "object-contain p-3" : "object-cover"}`} />
              <Znacke izdelek={izdelek} />
            </div>
          </div>
          <div className="min-w-0 space-y-5 p-6">
            <div>
              <h3 className="text-2xl font-extrabold leading-tight">{izdelek.ime}</h3>
              <p className="mt-1 text-sm text-[#4b5563]">{izdelek.opis}</p>
            </div>
            <CenaOznaka izdelek={izdelek} velika />
            <ul className="space-y-1.5 text-sm text-[#374151]">
              {izdelek.rok && <Lastnost>Dobava: {izdelek.rok}</Lastnost>}
              {izdelek.min && <Lastnost>Najmanjša količina: {izdelek.min.toLocaleString("sl-SI")} kos</Lastnost>}
              {izdelek.lastnosti?.map((l) => <Lastnost key={l}>{l}</Lastnost>)}
              <Lastnost>Z vašim logotipom — svetujemo najprimernejšo tehniko</Lastnost>
            </ul>

            {izdelek.stopnje && izdelek.stopnje.length > 1 && (
              <div className="overflow-hidden rounded-xl border border-[#e3e6ee] text-sm">
                <p className="bg-[#f6f7f9] px-4 py-2 text-xs font-semibold text-[#4b5563]">Količinski popusti</p>
                {izdelek.stopnje.map((s) => {
                  const je = stopnjaZa(izdelek, kolicina)?.[0] === s[0];
                  return (
                    <button
                      key={s[0]}
                      onClick={() => setKolicina(s[0])}
                      className={`flex w-full justify-between px-4 py-1.5 text-left ${je ? "bg-[#eef3ff] font-bold text-[#1546d8]" : "hover:bg-[#f6f7f9]"}`}
                    >
                      <span>od {s[0].toLocaleString("sl-SI")} kos</span>
                      <span>{eur(s[1], 4)} / kos</span>
                    </button>
                  );
                })}
              </div>
            )}

            {izdelek.izbira && (
              <div>
                <p className="mb-2 text-sm font-semibold text-[#4b5563]">{izdelek.izbira.ime}</p>
                <div className="flex flex-wrap gap-2">
                  {izdelek.izbira.moznosti.map((m) => (
                    <button
                      key={m}
                      onClick={() => setIzbira(m)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${izbira === m ? "bg-[#0b1530] text-white" : "bg-[#f1f3f7] hover:bg-[#e6e9f0]"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-[#4b5563]">Količina</span>
              <input
                type="number"
                min={1}
                value={kolicina}
                onChange={(e) => setKolicina(Math.max(1, Number(e.target.value) || 1))}
                className={VNOS}
              />
              {premalo && <span className="mt-1 block text-xs font-semibold text-[#b45309]">Najmanjša količina je {izdelek.min} kos.</span>}
            </label>

            {paket >= 2 && <NalaganjeLoga logo={logo} setLogo={setLogo} />}

            {c !== null && (
              <div className="flex items-end justify-between rounded-xl bg-[#f6f7f9] p-4">
                <span className="text-xs font-semibold text-[#6b7280]">
                  {kolicina.toLocaleString("sl-SI")} × {eur(c, izdelek.stopnje ? 4 : 2)}
                </span>
                <span className="text-2xl font-extrabold">{eur(c * kolicina)}</span>
              </div>
            )}

            {paket === 1 ? (
              <button
                onClick={() => povprasaj(`${izdelek.ime} — ${kolicina} kos${opisIzbire ? `, ${opisIzbire}` : ""}`)}
                className={`flex w-full items-center justify-center gap-2 rounded-lg py-3.5 text-sm font-semibold ${MODRA}`}
              >
                Pošlji povpraševanje <Send className="h-4 w-4" />
              </button>
            ) : (
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <button
                  disabled={premalo}
                  onClick={() => dodaj({ izdelek, kolicina, izbira: opisIzbire, logo })}
                  className={`flex items-center justify-center gap-2 rounded-lg py-3.5 text-sm font-semibold disabled:opacity-40 ${MODRA}`}
                >
                  <ShoppingBag className="h-4 w-4" /> {c === null ? "Dodaj v povpraševanje" : "Dodaj v košarico"}
                </button>
                <button
                  onClick={() => dodaj({ izdelek, kolicina: 1, izbira: opisIzbire, logo: null, vzorec: true })}
                  className={`rounded-lg ${OBROBA} px-4 py-3.5 text-sm font-semibold hover:border-[#1546d8]`}
                >
                  Naroči vzorec
                </button>
              </div>
            )}
            <p className="text-[11px] text-[#9aa1ad]">
              Predogled — nič se ne pošlje. {c === null ? "Ceno pripravimo v ponudbi." : "Cena po ceniku kamenaric.si, brez DDV."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Lastnost({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1546d8]" />
      <span>{children}</span>
    </li>
  );
}

/* ───────────────────────── sezona: rokovniki 2027 ───────────────────────── */

function Sezona({ paket, odpri }: { paket: Paket; odpri: (i: Izdelek) => void }) {
  const rokovniki = IZDELKI.filter((i) => i.kategorija === "rokovniki" && i.cena);
  return (
    <section id="sezona" className="scroll-mt-12 bg-[#fff8e1]">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#a16207]">Sezona · novo za 2027</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Rokovniki in koledarji 2027 so že tu</h2>
            <p className="mt-2 max-w-xl text-[15px] text-[#4b5563]">
              Novoletna darila, ki jih partnerji uporabljajo vse leto. Z vašim logotipom v slepem tisku, zlatotisku ali gravuri.
            </p>
          </div>
          {paket >= 2 && (
            <div className="rounded-xl bg-white px-5 py-3 text-sm shadow-sm ring-1 ring-[#fde3a7]">
              <p className="font-bold text-[#a16207]">Akcija (primer)</p>
              <p className="text-[#4b5563]">Pri 100+ rokovnikih slepi tisk logotipa gratis</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {rokovniki.map((i) => (
            <button key={i.id} onClick={() => odpri(i)} className="group overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-[#f3e3b5] transition hover:-translate-y-0.5">
              <div className="relative aspect-[4/3] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slika(i.slika)} alt={i.ime} loading="lazy" className="h-full w-full object-contain p-2" />
                <Znacke izdelek={i} />
              </div>
              <div className="p-4">
                <p className="text-sm font-bold leading-snug">{i.ime}</p>
                <p className="text-xs text-[#6b7280]">{i.opis}</p>
                <p className="mt-2 text-lg font-extrabold">
                  {eur(i.cena!)} <span className="text-xs font-medium text-[#6b7280]">+ DDV</span>
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── dodelave, reference, pogoji ───────────────────────── */

function Dodelave() {
  return (
    <section id="dodelave" className="mx-auto max-w-7xl scroll-mt-12 px-4 py-16">
      <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1546d8]">Dodelave · brandiranje</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Devet načinov, kako vaš znak pride na izdelek</h2>
          <p className="mt-2 text-[15px] text-[#4b5563]">
            Vsaka tehnika je primerna za določeno vrsto izdelka — nekatere lahko dodelamo na več načinov, izberete sami. Tekstil npr. potiskamo ali vezemo.
          </p>
        </div>
        <div className={`rounded-xl ${OBROBA} bg-white px-5 py-4 text-sm`}>
          <p className="font-bold">Oblikovanje: 23 €/uro + DDV</p>
          <p className="text-[#6b7280]">po dejansko porabljenem času</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DODELAVE.map((d) => (
          <div key={d.ime} className={`flex items-center gap-4 rounded-xl ${OBROBA} bg-white p-4`}>
            {d.slika ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={slika(d.slika)} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-[#eef3ff]">
                <Sparkles className="h-6 w-6 text-[#1546d8]" />
              </span>
            )}
            <div className="min-w-0">
              <h3 className="font-bold leading-tight">{d.ime}</h3>
              <p className="mt-1 text-xs leading-snug text-[#6b7280]">{d.opis}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Reference() {
  return (
    <section className="border-y border-[#e9ecf2] bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1546d8]">Iz naše galerije</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Narejeno za naše stranke</h2>
          </div>
          <p className="max-w-sm text-sm text-[#6b7280]">
            V prodaji promocijskih izdelkov in poslovnih daril smo večji del tega tisočletja.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {REFERENCE.map((r) => (
            <figure key={r.ime} className={`overflow-hidden rounded-xl ${OBROBA} bg-[#f6f7f9]`}>
              <div className="aspect-[4/3] overflow-hidden bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slika(r.slika)} alt={r.ime} loading="lazy" className="h-full w-full object-cover" />
              </div>
              <figcaption className="p-4">
                <p className="font-bold">{r.ime}</p>
                <p className="text-xs text-[#6b7280]">{r.opis}</p>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-5 text-xs text-[#9aa1ad]">Fotografije z vaše strani. Na pravo stran dodamo še mnenja strank z Googla.</p>
      </div>
    </section>
  );
}

function KakoPoslujemo() {
  const tocke = [
    { ikona: ShoppingBag, a: `Najmanjše naročilo ${POGOJI.najmanjse} € neto`, b: "Preverite tudi minimalno pakiranje izdelka." },
    { ikona: Truck, a: `Nad ${POGOJI.brezPostnine} € brez poštnine`, b: "Dostava po Sloveniji. Voda: pol palete 33 €, paleta 43 €." },
    { ikona: Package, a: "Vzorci", b: "Naročene vzorce plačate in obdržite." },
    { ikona: Tag, a: "Cene brez DDV", b: "Informativne, v €. Aktualne preverimo po e-pošti." },
    { ikona: Sparkles, a: "Česar ni v ponudbi, poiščemo", b: "Pošljite povpraševanje — tudi za posebne izdelke." },
    { ikona: Clock, a: KONTAKT.ure, b: `${KONTAKT.telefon} · ${KONTAKT.email}` },
  ];
  return (
    <section id="pogoji" className="mx-auto max-w-7xl scroll-mt-12 px-4 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1546d8]">Kako poslujemo</p>
      <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Jasni pogoji, brez presenečenj</h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tocke.map(({ ikona: I, a, b }) => (
          <div key={a} className={`flex gap-4 rounded-xl ${OBROBA} bg-white p-5`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#eef3ff]">
              <I className="h-5 w-5 text-[#1546d8]" />
            </span>
            <div className="min-w-0">
              <p className="font-bold">{a}</p>
              <p className="mt-0.5 break-words text-sm text-[#6b7280]">{b}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────── povpraševanje ───────────────────────── */

function Polje({ oznaka, tip = "text" }: { oznaka: string; tip?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[#4b5563]">{oznaka}</span>
      <input type={tip} className={VNOS} />
    </label>
  );
}

function Povprasevanje({ logo, setLogo, predizpolnjeno }: { logo: string | null; setLogo: (l: string | null) => void; predizpolnjeno: string }) {
  const [poslano, setPoslano] = useState(false);
  return (
    <section id="povprasevanje" className="scroll-mt-12 bg-[#eef3ff]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1546d8]">Povpraševanje</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Pošljite idejo in logotip — pripravimo ponudbo</h2>
          <p className="mt-3 max-w-md text-[#4b5563]">Za vse izdelke ponujamo brandiranje: znak, logotip, kontakti, slogan, design. Ali pa nas preprosto pokličite.</p>
          <a href={KONTAKT.telefonHref} className="mt-6 inline-flex items-center gap-3 text-3xl font-extrabold tracking-tight hover:text-[#1546d8]">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white">
              <Phone className="h-6 w-6 text-[#1546d8]" />
            </span>
            {KONTAKT.telefon}
          </a>
          <a href={`mailto:${KONTAKT.email}`} className="mt-3 flex items-center gap-3 text-lg font-semibold hover:text-[#1546d8]">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white">
              <Mail className="h-6 w-6 text-[#1546d8]" />
            </span>
            {KONTAKT.email}
          </a>
        </div>
        <form
          key={predizpolnjeno}
          onSubmit={(e) => {
            e.preventDefault();
            setPoslano(true);
          }}
          className={`min-w-0 space-y-4 rounded-2xl ${OBROBA} bg-white p-6 shadow-sm sm:p-8`}
        >
          {poslano ? (
            <div className="py-16 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#eef3ff]">
                <Check className="h-7 w-7 text-[#1546d8]" />
              </span>
              <p className="mt-4 text-2xl font-extrabold">Hvala za povpraševanje!</p>
              <p className="mt-2 text-sm text-[#6b7280]">Predogled — povpraševanje ni bilo nikamor poslano.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Polje oznaka="Ime in priimek" />
                <Polje oznaka="Podjetje" />
                <Polje oznaka="E-pošta" tip="email" />
                <Polje oznaka="Telefon" />
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-[#4b5563]">Kaj potrebujete (izdelek, količina, rok)</span>
                <textarea rows={4} defaultValue={predizpolnjeno} placeholder="npr. 600 plastenk vode z našo etiketo za dogodek 20. 11." className={VNOS} />
              </label>
              <NalaganjeLoga logo={logo} setLogo={setLogo} />
              <button className={`flex w-full items-center justify-center gap-2 rounded-lg py-3.5 text-sm font-semibold ${MODRA}`}>
                Pošlji povpraševanje <Send className="h-4 w-4" />
              </button>
            </>
          )}
        </form>
      </div>
    </section>
  );
}

/* ───────────────────────── košarica ───────────────────────── */

function Kosarica({
  postavke,
  odstrani,
  zapri,
  oddaj,
}: {
  postavke: Postavka[];
  odstrani: (id: string) => void;
  zapri: () => void;
  oddaj: (povprasevanje: boolean) => void;
}) {
  const z = zneskiKosarice(postavke);
  const leCenovne = postavke.length > 0 && z.poPonudbi === postavke.length;
  const doMinimuma = Math.max(0, POGOJI.najmanjse - z.blago);
  const doDostave = Math.max(0, POGOJI.brezPostnine - z.blago);
  const blokirano = postavke.length === 0 || (!leCenovne && doMinimuma > 0 && z.poPonudbi === 0);

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-[#0b1530]/50 backdrop-blur-sm" onClick={zapri}>
      <aside className="flex h-full w-full max-w-md flex-col bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#eef0f4] px-6 py-5">
          <h3 className="text-xl font-extrabold">Košarica</h3>
          <button onClick={zapri} aria-label="Zapri" className="rounded-lg p-1 hover:bg-[#f1f3f7]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {postavke.length > 0 && z.blago > 0 && (
          <div className="border-b border-[#eef0f4] px-6 py-4">
            <p className="text-sm font-semibold">
              {doDostave > 0 ? (
                <>
                  Še <span className="text-[#1546d8]">{eur(doDostave)}</span> do brezplačne dostave
                </>
              ) : (
                <span className="text-[#15803d]">Dostava je brezplačna 🎉</span>
              )}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eef0f4]">
              <div className="h-full rounded-full bg-[#1546d8] transition-all" style={{ width: `${Math.min(100, (z.blago / POGOJI.brezPostnine) * 100)}%` }} />
            </div>
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto p-6">
          {postavke.length === 0 && <p className="py-10 text-center text-sm text-[#6b7280]">Košarica je prazna.</p>}
          {postavke.map((p) => {
            const c = cenaNaKos(p.izdelek, p.kolicina);
            return (
              <div key={p.id} className={`flex gap-3 rounded-xl ${OBROBA} p-3`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slika(p.izdelek.slika)} alt="" className="h-16 w-16 shrink-0 rounded-lg bg-white object-contain" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {p.vzorec && <span className="mr-1 rounded bg-[#fff7e6] px-1.5 text-[11px] text-[#a16207]">VZOREC</span>}
                    {p.izdelek.ime}
                  </p>
                  <p className="text-xs text-[#6b7280]">
                    {p.kolicina.toLocaleString("sl-SI")} kos{p.izbira ? ` · ${p.izbira}` : ""}
                    {p.logo ? " · z logotipom" : ""}
                  </p>
                  <p className="mt-1 text-sm font-extrabold">{c === null ? <span className="font-semibold text-[#6b7280]">po ponudbi</span> : eur(c * p.kolicina)}</p>
                </div>
                <button onClick={() => odstrani(p.id)} className="self-start text-[#9aa1ad] hover:text-[#0b1530]" aria-label="Odstrani">
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="space-y-2 border-t border-[#eef0f4] p-6 text-sm">
          <Vrstica a="Izdelki" b={eur(z.blago)} />
          {z.dostavaV && <Vrstica a={`Dostava vode (${z.dostavaV.opis})`} b={eur(z.dostavaV.cena)} />}
          <Vrstica a="Poštnina (ostalo)" b={doDostave > 0 ? "po ceniku" : "brezplačno"} poudari={doDostave === 0} />
          {z.poPonudbi > 0 && <Vrstica a={`Po ponudbi (${z.poPonudbi})`} b="pripravimo ceno" />}
          <div className="flex items-end justify-between border-t border-[#eef0f4] pt-3">
            <span className="font-semibold text-[#6b7280]">Skupaj brez DDV</span>
            <span className="text-3xl font-extrabold">{eur(z.skupaj)}</span>
          </div>
          {blokirano && postavke.length > 0 && (
            <p className="rounded-lg bg-[#fff7e6] p-3 text-xs font-semibold text-[#a16207]">
              Najmanjše naročilo je {POGOJI.najmanjse} € neto — dodajte še {eur(doMinimuma)}.
            </p>
          )}
          <button
            disabled={blokirano}
            onClick={() => oddaj(leCenovne)}
            className={`flex w-full items-center justify-center gap-2 rounded-lg py-3.5 text-sm font-semibold disabled:opacity-40 ${MODRA}`}
          >
            {leCenovne ? "Pošlji povpraševanje" : z.poPonudbi > 0 ? "Naroči in zahtevaj ponudbo" : "Oddaj naročilo"} <ArrowRight className="h-4 w-4" />
          </button>
          <p className="text-center text-[11px] text-[#9aa1ad]">Predogled — naročilo se ne pošlje nikamor.</p>
        </div>
      </aside>
    </div>
  );
}

function Potrdilo({ st, povprasevanje, zapri }: { st: string; povprasevanje: boolean; zapri: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0b1530]/60 p-4" onClick={zapri}>
      <div className="w-full max-w-md rounded-2xl bg-white p-8" onClick={(e) => e.stopPropagation()}>
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#eef3ff]">
          <Check className="h-7 w-7 text-[#1546d8]" />
        </span>
        <h3 className="mt-4 text-2xl font-extrabold">{povprasevanje ? "Povpraševanje prejeto" : "Naročilo prejeto"}</h3>
        <p className="mt-2 text-sm text-[#4b5563]">
          Številka <b>{st}</b>. V pravi trgovini bi stranka zdaj dobila e-mail s potrdilom{povprasevanje ? "" : " in predračunom"}, Kamenarič pa naročilo z logotipom v
          prilogi na {KONTAKT.email}.
        </p>
        <p className="mt-4 rounded-lg bg-[#f6f7f9] p-3 text-xs text-[#6b7280]">To je predogled — nič ni bilo poslano.</p>
        <button onClick={zapri} className={`mt-6 w-full rounded-lg py-3 text-sm font-semibold ${MODRA}`}>
          V redu
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── paket 3: portal ───────────────────────── */

const PRETEKLA = [
  { st: "KM-2025-0874", datum: "18. 11. 2025", izdelek: "r0044", kolicina: 150, izbira: undefined },
  { st: "KM-2025-0611", datum: "3. 6. 2025", izdelek: "voda-05", kolicina: 600, izbira: "pokrovček moder" },
  { st: "KM-2025-0322", datum: "21. 3. 2025", izdelek: "diseci-obeski", kolicina: 1000, izbira: "vonj: limona" },
];

type Sporocilo = { od: "ai" | "jaz"; besedilo: string; predlog?: NovaPostavka };

function Kartica({ ikona: I, naslov, children }: { ikona: typeof Bot; naslov: string; children: React.ReactNode }) {
  return (
    <div className={`min-w-0 rounded-2xl ${OBROBA} bg-white p-6`}>
      <p className="mb-4 flex items-center gap-2 text-sm font-bold">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef3ff]">
          <I className="h-4 w-4 text-[#1546d8]" />
        </span>
        {naslov}
      </p>
      {children}
    </div>
  );
}

function Portal({ logo, setLogo, dodaj }: { logo: string | null; setLogo: (l: string | null) => void; dodaj: (p: NovaPostavka) => void }) {
  return (
    <section id="portal" className="scroll-mt-12 bg-[#f6f7f9]">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1546d8]">Portal za stalne stranke</p>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Vaš račun. Vaše cene. Vaša naročila.</h2>

        <div className={`mb-6 mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl ${OBROBA} bg-white p-5`}>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0b1530] text-lg font-bold text-white">AS</div>
            <div>
              <p className="text-xs text-[#6b7280]">Prijavljeni kot (primer)</p>
              <p className="font-bold">Avtoservis Primer d.o.o.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-[#1546d8] px-3 py-1.5 text-white">Vaš popust −8 % (primer)</span>
            <span className="rounded-full bg-[#f1f3f7] px-3 py-1.5">Plačilo na 30 dni</span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <AiPomocnik dodaj={dodaj} logo={logo} />
          <Kartica ikona={Package} naslov="Predogled vaše etikete">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
              <div className="flex gap-2">
                {["moder", "bel", "rdeč"].map((p) => (
                  <Plastenka key={p} logo={logo} pokrovcek={p} className="h-56 w-[88px]" />
                ))}
              </div>
              <div className="space-y-3">
                <NalaganjeLoga logo={logo} setLogo={setLogo} />
                <p className="text-xs text-[#6b7280]">Naložite logotip — takoj vidite, kako bo plastenka videti, še preden naročite.</p>
              </div>
            </div>
          </Kartica>
          <Kartica ikona={RotateCcw} naslov="Pretekla naročila">
            <div className="divide-y divide-[#eef0f4]">
              {PRETEKLA.map((n) => {
                const iz = IZDELKI.find((i) => i.id === n.izdelek)!;
                return (
                  <div key={n.st} className="flex items-center gap-3 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={slika(iz.slika)} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-white object-contain" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{iz.ime}</p>
                      <p className="text-xs text-[#6b7280]">
                        {n.st} · {n.datum} · {n.kolicina.toLocaleString("sl-SI")} kos
                      </p>
                    </div>
                    <button onClick={() => dodaj({ izdelek: iz, kolicina: n.kolicina, izbira: n.izbira, logo })} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${MODRA}`}>
                      Ponovi
                    </button>
                  </div>
                );
              })}
            </div>
          </Kartica>
          <Kartica ikona={Truck} naslov="Sledenje · KM-2026-0198">
            <ol className="space-y-4">
              {(
                [
                  ["Naročilo potrjeno", "6. 10.", true],
                  ["Etiketa odobrena", "7. 10.", true],
                  ["Polnjenje in etiketiranje", "danes", true],
                  ["Dostava (pol palete)", "predvidoma 16. 10.", false],
                ] as const
              ).map(([a, b, ok]) => (
                <li key={a} className="flex items-center gap-4">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${ok ? "bg-[#1546d8] text-white" : "border-2 border-[#d9dde6]"}`}>
                    {ok ? <Check className="h-4 w-4" /> : null}
                  </span>
                  <span className={`flex-1 text-sm font-semibold ${ok ? "" : "text-[#9aa1ad]"}`}>{a}</span>
                  <span className="text-xs text-[#6b7280]">{b}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 rounded-xl bg-[#fff7e6] p-4 text-sm ring-1 ring-[#fde3a7]">
              <p className="font-bold text-[#a16207]">Opomnik pred sezono</p>
              <p className="mt-1 text-[#4b5563]">Lani ste 18. 11. naročili 150 rokovnikov R0044. Rokovniki 2027 so že na zalogi — ponovite z enim klikom?</p>
            </div>
          </Kartica>
        </div>
      </div>
    </section>
  );
}

function razumi(vnos: string, logo: string | null): Sporocilo {
  const t = vnos.toLowerCase();
  const st = Number((t.match(/(\d[\d.\s]*)/)?.[1] ?? "").replace(/[.\s]/g, "")) || 0;
  const id = /čaj|caj/.test(t)
    ? "ledeni-caj"
    : /vod|plasten/.test(t)
      ? /okus/.test(t)
        ? "voda-okus"
        : /1,5|1\.5|liter in pol/.test(t)
          ? "voda-15"
          : "voda-05"
      : /rokovnik|poslovnik|planer/.test(t)
        ? /dnevn/.test(t)
          ? "r0043"
          : "r0044"
        : /obes|dišeč|disec|osvežil/.test(t)
          ? "diseci-obeski"
          : /brisač|brisac/.test(t)
            ? "brisace-classic"
            : /koledar/.test(t)
              ? "koledar-vas"
              : /polo|majic/.test(t)
                ? "polo"
                : /značk|znack/.test(t)
                  ? "skatlice-znacke"
                  : null;
  const izdelek = id ? IZDELKI.find((i) => i.id === id) : undefined;
  if (!izdelek) {
    return { od: "ai", besedilo: "Povejte mi izdelek in količino — npr. »600 plastenk vode z logotipom do petka« ali »150 rokovnikov 2027«." };
  }
  const kolicina = Math.max(izdelek.min ?? 1, st || izdelek.min || 100);
  const c = cenaNaKos(izdelek, kolicina);
  const rok = t.match(/do (ponedeljka|torka|srede|četrtka|petka|sobote|nedelje|\d{1,2}\.\s?\d{1,2}\.?)/)?.[1];
  const cena =
    c === null
      ? "Ceno pripravim v ponudbi — pošljem jo na vaš e-mail"
      : `Cena ${eur(c, izdelek.stopnje ? 4 : 2)}/kos, skupaj ${eur(c * kolicina)} brez DDV` +
        (izdelek.kategorija === "voda" ? ` + dostava ${eur(dostavaVode(kolicina).cena)}` : "");
  return {
    od: "ai",
    besedilo:
      `Predlagam: ${kolicina.toLocaleString("sl-SI")} × ${izdelek.ime}. ${cena}.` +
      (izdelek.rok ? ` Dobava: ${izdelek.rok}${rok ? ` — za rok »do ${rok}« potrdite etiketo/grafiko še danes` : ""}.` : "") +
      (logo ? " Vaš logotip že imam." : " Naložite še logotip, pa pripravim predogled."),
    predlog: { izdelek, kolicina, logo },
  };
}

const PREDLOGI = ["600 plastenk vode z logotipom do petka", "150 tedenskih rokovnikov 2027", "1000 dišečih obeskov limona"];

function AiPomocnik({ dodaj, logo }: { dodaj: (p: NovaPostavka) => void; logo: string | null }) {
  const [sporocila, setSporocila] = useState<Sporocilo[]>([
    { od: "ai", besedilo: "Pozdravljeni! Napišite, kaj potrebujete — sestavim ponudbo po vaših cenah v nekaj sekundah." },
  ]);
  const [vnos, setVnos] = useState("");

  function poslji(besedilo: string) {
    if (!besedilo.trim()) return;
    setSporocila((s) => [...s, { od: "jaz", besedilo }, razumi(besedilo, logo)]);
    setVnos("");
  }

  return (
    <Kartica ikona={Bot} naslov="AI pomočnik za ponudbe">
      <div className="flex max-h-80 min-h-56 flex-col gap-3 overflow-y-auto pr-1">
        {sporocila.map((s, i) => (
          <div key={i} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${s.od === "jaz" ? "self-end bg-[#1546d8] text-white" : "self-start bg-[#f1f3f7]"}`}>
            {s.besedilo}
            {s.predlog && (
              <button onClick={() => dodaj(s.predlog!)} className="mt-3 flex items-center gap-1.5 rounded-lg bg-[#0b1530] px-3 py-1.5 text-xs font-semibold text-white">
                <ShoppingBag className="h-3.5 w-3.5" /> V košarico
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {PREDLOGI.map((p) => (
          <button key={p} onClick={() => poslji(p)} className="flex items-center gap-1 rounded-full bg-[#eef3ff] px-3 py-1 text-[11px] font-medium text-[#1546d8] hover:bg-[#dfe8ff]">
            <Sparkles className="h-3 w-3" /> {p}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          poslji(vnos);
        }}
        className="mt-3 flex gap-2"
      >
        <input value={vnos} onChange={(e) => setVnos(e.target.value)} placeholder="npr. 1200 plastenk vode, rdeč pokrovček" className={VNOS} />
        <button className={`rounded-lg px-4 ${MODRA}`} aria-label="Pošlji">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </Kartica>
  );
}

/* ───────────────────────── kaj dobite, noga ───────────────────────── */

function KajDobite({ paket, setPaket }: { paket: Paket; setPaket: (p: Paket) => void }) {
  const v = VSEBINA_PAKETOV[paket];
  const naslednji = paket < 3 ? ((paket + 1) as Paket) : null;
  return (
    <section id="kaj-dobite" className="scroll-mt-10 bg-[#1546d8] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/70">Za Kamenarič d.o.o. · pripravil KodaTim</p>
          <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{v.naslov}</h2>
          <p className="mt-5 max-w-md text-lg text-white/85">{v.zakaj}</p>
          <div className="mt-8 flex flex-wrap gap-2">
            {PAKETI.map((p) => (
              <button
                key={p.st}
                onClick={() => setPaket(p.st)}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${paket === p.st ? "bg-white text-[#1546d8]" : "bg-white/10 hover:bg-white/20"}`}
              >
                {p.st} · {p.ime}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-8 text-[#0b1530]">
          <ul className="space-y-4">
            {v.tocke.map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#eef3ff]">
                  <Check className="h-3.5 w-3.5 text-[#1546d8]" />
                </span>
                <span className="leading-snug">{t}</span>
              </li>
            ))}
          </ul>
          {naslednji && (
            <button onClick={() => setPaket(naslednji)} className={`mt-8 flex w-full items-center justify-between rounded-xl ${OBROBA} px-5 py-4 text-left hover:border-[#1546d8]`}>
              <span>
                <span className="block text-xs text-[#6b7280]">Še korak dlje</span>
                <span className="font-bold">
                  Poglej paket {naslednji} — {PAKETI[naslednji - 1].kratko}
                </span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 text-[#1546d8]" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Noga() {
  return (
    <footer className="bg-[#0b1530] text-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <span className="inline-block rounded-lg bg-white px-3 py-2">
            <Logotip className="h-9 w-auto" />
          </span>
          <p className="mt-4 max-w-xs text-sm text-white/60">Promocijski izdelki in poslovna darila z vašim logotipom — za podjetja iz vse Slovenije.</p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-bold">Kontakt</p>
          <a href={KONTAKT.telefonHref} className="flex items-center gap-2 text-white/80 hover:text-white">
            <Phone className="h-4 w-4" /> {KONTAKT.telefonMednarodno}
          </a>
          <a href={`mailto:${KONTAKT.email}`} className="flex items-center gap-2 text-white/80 hover:text-white">
            <Mail className="h-4 w-4" /> {KONTAKT.email}
          </a>
          <p className="flex items-center gap-2 text-white/80">
            <Clock className="h-4 w-4" /> {KONTAKT.ure}
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-bold">Sedež</p>
          <p className="flex items-start gap-2 text-white/80">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {KONTAKT.podjetje}, {KONTAKT.naslov}
          </p>
          <p className="pt-4 text-xs text-white/40">Predogled nove strani · izdelal KodaTim.si</p>
        </div>
      </div>
    </footer>
  );
}
