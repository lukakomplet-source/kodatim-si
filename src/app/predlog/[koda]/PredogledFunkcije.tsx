"use client";

import { useState, type ReactNode } from "react";
import { Bot, Check, RotateCcw, Upload } from "lucide-react";
import type { Funkcija, PoljeKonfiguratorja } from "@/lib/predlogi";

/**
 * Funkcija nove strani, ki jo lastnik lahko preizkusi: izbere storitev, dan in
 * uro, odda naročilo ali vpraša pomočnika. Nič se ne pošlje in nič se ne
 * shrani — polja za osebne podatke so samo za ogled, da nihče ne vpiše svojih.
 * Polja njihove panoge (mere, material, logotip …) so prava, ker niso osebni
 * podatki; naložena datoteka ostane na obiskovalčevem računalniku.
 */

type Storitev = { ime: string; opis: string };
type Vprasanje = { v: string; o: string };
type Vrednosti = Record<string, string>;

const DNEVI = ["Pon", "Tor", "Sre", "Čet", "Pet"] as const;
type Dan = (typeof DNEVI)[number];
const KDAJ: Record<Dan, string> = {
  Pon: "v ponedeljek",
  Tor: "v torek",
  Sre: "v sredo",
  Čet: "v četrtek",
  Pet: "v petek",
};
const URE = ["8:00", "9:30", "11:00", "13:00", "14:30", "16:00"];
// Nekaj zasedenih terminov, da koledar izgleda kot pravi.
const ZASEDENO = new Set(["Pon 9:30", "Tor 11:00", "Sre 8:00", "Sre 14:30", "Čet 13:00", "Pet 9:30"]);

export function PredogledFunkcije({
  funkcija,
  poziv,
  storitve,
  ime,
  polja = [],
  rezultat = "",
  vprasanja = [],
}: {
  funkcija: Funkcija;
  poziv: string;
  storitve: Storitev[];
  ime: string;
  polja?: PoljeKonfiguratorja[];
  rezultat?: string;
  vprasanja?: Vprasanje[];
}) {
  if (funkcija === "rezervacija") return <Rezervacija poziv={poziv} storitve={storitve} />;
  if (funkcija === "narocilo") return <Narocilo poziv={poziv} storitve={storitve} polja={polja} rezultat={rezultat} />;
  if (funkcija === "ai_asistent") return <Pomocnik ime={ime} storitve={storitve} vprasanja={vprasanja} />;
  if (funkcija === "portal") return <Portal ime={ime} storitve={storitve} />;
  return <Povprasevanje poziv={poziv} storitve={storitve} polja={polja} rezultat={rezultat} />;
}

/* ───────────── konfigurator: polja njihove panoge ───────────── */

function povzetek(vrednosti: Vrednosti): string {
  return Object.entries(vrednosti)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}

function Konfigurator({
  polja,
  vrednosti,
  nastavi,
}: {
  polja: PoljeKonfiguratorja[];
  vrednosti: Vrednosti;
  nastavi: (ime: string, vrednost: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {polja.map((p) => {
        const v = vrednosti[p.ime] ?? "";
        if (p.vrsta === "izbira" && p.moznosti && p.moznosti.length > 1) {
          return (
            <div key={p.ime} className="sm:col-span-2">
              <p className="mb-2 text-xs font-medium text-zinc-500">{p.ime}</p>
              <div className="flex flex-wrap gap-2">
                {p.moznosti.map((m) => (
                  <Izbira key={m} izbrano={v === m} onClick={() => nastavi(p.ime, m)}>
                    {m}
                  </Izbira>
                ))}
              </div>
            </div>
          );
        }
        if (p.vrsta === "datoteka") {
          return <Nalaganje key={p.ime} ime={p.ime} vrednost={v} nastavi={(x) => nastavi(p.ime, x)} />;
        }
        return (
          <label key={p.ime} className="block">
            <span className="text-xs font-medium text-zinc-500">
              {p.ime}
              {p.enota ? ` (${p.enota})` : ""}
            </span>
            <input
              type={p.vrsta === "stevilo" ? "number" : "text"}
              min={0}
              value={v}
              onChange={(e) => nastavi(p.ime, e.target.value)}
              placeholder={p.vrsta === "stevilo" ? "npr. 120" : ""}
              className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
            />
          </label>
        );
      })}
    </div>
  );
}

function Nalaganje({ ime, vrednost, nastavi }: { ime: string; vrednost: string; nastavi: (v: string) => void }) {
  const [predogled, setPredogled] = useState<string | null>(null);
  return (
    <label className="block cursor-pointer rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center text-sm text-zinc-600 transition hover:border-zinc-500 sm:col-span-2">
      <input
        type="file"
        accept="image/*,.pdf"
        className="sr-only"
        onChange={(e) => {
          const datoteka = e.target.files?.[0];
          if (!datoteka) return;
          nastavi(datoteka.name);
          if (datoteka.type.startsWith("image/")) {
            const bralnik = new FileReader();
            bralnik.onload = () => setPredogled(String(bralnik.result));
            bralnik.readAsDataURL(datoteka);
          } else {
            setPredogled(null);
          }
        }}
      />
      {predogled ? (
        // eslint-disable-next-line @next/next/no-img-element -- predogled naložene datoteke (data URL)
        <img src={predogled} alt="" className="mx-auto h-20 w-auto object-contain" />
      ) : (
        <Upload className="mx-auto h-5 w-5 text-zinc-400" />
      )}
      <span className="mt-2 block font-medium text-zinc-800">{vrednost || ime}</span>
      <span className="block text-xs text-zinc-400">Predogled — datoteka ostane na vašem računalniku.</span>
    </label>
  );
}

/** B2B portal: stalna stranka se prijavi, naroči s količinami ali ponovi zadnje naročilo. */
function Portal({ ime, storitve }: { ime: string; storitve: Storitev[] }) {
  const [prijavljen, setPrijavljen] = useState(false);
  const [kolicine, setKolicine] = useState<Record<string, number>>({});
  const [oddano, setOddano] = useState(false);
  const artikli = storitve.length > 0 ? storitve.slice(0, 6) : [{ ime: "Vaš izdelek", opis: "" }];

  if (oddano) {
    return (
      <Potrjeno
        naslov="Naročilo je oddano"
        besedilo="Stalna stranka je naročila sama, po svojih cenah in tudi zvečer. Vi dobite urejeno naročilo z vsemi količinami, ona pa potrditev in rok dobave."
        znova={() => {
          setOddano(false);
          setKolicine({});
        }}
      />
    );
  }
  if (!prijavljen) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">Prijava za stalne stranke podjetja {ime}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Polje oznaka="Uporabnik" />
          <Polje oznaka="Geslo" />
        </div>
        <Gumb onClick={() => setPrijavljen(true)}>Prijava (predogled)</Gumb>
      </div>
    );
  }
  const izbrano = Object.values(kolicine).some((k) => k > 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-50 px-4 py-3 text-sm">
        <span>
          Pozdravljeni, <span className="font-semibold">Primer d.o.o.</span>
        </span>
        <button
          type="button"
          onClick={() => setKolicine(Object.fromEntries(artikli.slice(0, 2).map((a) => [a.ime, 10])))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 ring-1 ring-zinc-200 hover:ring-zinc-400"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Ponovi zadnje naročilo
        </button>
      </div>
      <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
        {artikli.map((a) => {
          const k = kolicine[a.ime] ?? 0;
          return (
            <li key={a.ime} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900">{a.ime}</p>
                <p className="text-xs text-zinc-500">Vaša cena po dogovoru</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  aria-label="Manj"
                  onClick={() => setKolicine((s) => ({ ...s, [a.ime]: Math.max(0, k - 5) }))}
                  className="h-8 w-8 rounded-lg border border-zinc-200 text-zinc-700 hover:border-zinc-400"
                >
                  −
                </button>
                <span className="w-8 text-center text-sm tabular-nums">{k}</span>
                <button
                  type="button"
                  aria-label="Več"
                  onClick={() => setKolicine((s) => ({ ...s, [a.ime]: k + 5 }))}
                  className="h-8 w-8 rounded-lg border border-zinc-200 text-zinc-700 hover:border-zinc-400"
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <Gumb onemogoceno={!izbrano} onClick={() => setOddano(true)}>
        {izbrano ? "Oddaj naročilo" : "Izberite količine"}
      </Gumb>
    </div>
  );
}

function Rezervacija({ poziv, storitve }: { poziv: string; storitve: Storitev[] }) {
  const [storitev, setStoritev] = useState(storitve[0]?.ime ?? "");
  const [dan, setDan] = useState<Dan>("Tor");
  const [ura, setUra] = useState("");
  const [potrjeno, setPotrjeno] = useState(false);
  const zamik = storitve.length > 0 ? 1 : 0;

  if (potrjeno) {
    return (
      <Potrjeno
        naslov="Termin je rezerviran"
        besedilo={`${storitev ? `${storitev}, ` : ""}${KDAJ[dan]} ob ${ura}. Stranka takoj dobi potrditev po e-pošti, vi pa termin v koledarju — brez enega samega klica.`}
        znova={() => {
          setPotrjeno(false);
          setUra("");
        }}
      />
    );
  }
  return (
    <div className="space-y-5">
      {storitve.length > 0 && (
        <Korak stevilka={1} naslov="Izberite storitev">
          <div className="flex flex-wrap gap-2">
            {storitve.map((s) => (
              <Izbira key={s.ime} izbrano={storitev === s.ime} onClick={() => setStoritev(s.ime)}>
                {s.ime}
              </Izbira>
            ))}
          </div>
        </Korak>
      )}
      <Korak stevilka={1 + zamik} naslov="Izberite dan">
        <div className="grid grid-cols-5 gap-2">
          {DNEVI.map((d) => (
            <Izbira
              key={d}
              izbrano={dan === d}
              onClick={() => {
                setDan(d);
                setUra("");
              }}
            >
              {d}
            </Izbira>
          ))}
        </div>
      </Korak>
      <Korak stevilka={2 + zamik} naslov="Izberite uro">
        <div className="grid grid-cols-3 gap-2">
          {URE.map((u) => (
            <Izbira
              key={u}
              izbrano={ura === u}
              onemogoceno={ZASEDENO.has(`${dan} ${u}`)}
              onClick={() => setUra(u)}
            >
              {u}
            </Izbira>
          ))}
        </div>
      </Korak>
      <Gumb onemogoceno={!ura} onClick={() => setPotrjeno(true)}>
        {ura ? poziv : "Najprej izberite uro"}
      </Gumb>
    </div>
  );
}

function Narocilo({
  poziv,
  storitve,
  polja = [],
  rezultat = "",
}: {
  poziv: string;
  storitve: Storitev[];
  polja?: PoljeKonfiguratorja[];
  rezultat?: string;
}) {
  const [izbrane, setIzbrane] = useState<string[]>(storitve[0] ? [storitve[0].ime] : []);
  const [dan, setDan] = useState<Dan>("Sre");
  const [vrednosti, setVrednosti] = useState<Vrednosti>({});
  const [potrjeno, setPotrjeno] = useState(false);
  const zamik = (storitve.length > 0 ? 1 : 0) + (polja.length > 0 ? 1 : 0);

  if (potrjeno) {
    const podrobnosti = povzetek(vrednosti);
    return (
      <Potrjeno
        naslov="Naročilo je oddano"
        besedilo={`${izbrane.length ? `${izbrane.join(", ")}, ` : ""}${podrobnosti ? `${podrobnosti}, ` : ""}${KDAJ[dan]}. ${
          rezultat || "Vse podatke dobite naenkrat v e-pošti, stranka pa potrditev — nič ni treba zapisovati po telefonu."
        }`}
        znova={() => setPotrjeno(false)}
      />
    );
  }
  return (
    <div className="space-y-5">
      {storitve.length > 0 && (
        <Korak stevilka={1} naslov="Kaj želite naročiti?">
          <div className="flex flex-wrap gap-2">
            {storitve.map((s) => (
              <Izbira
                key={s.ime}
                izbrano={izbrane.includes(s.ime)}
                onClick={() =>
                  setIzbrane((prej) =>
                    prej.includes(s.ime) ? prej.filter((x) => x !== s.ime) : [...prej, s.ime],
                  )
                }
              >
                {s.ime}
              </Izbira>
            ))}
          </div>
        </Korak>
      )}
      {polja.length > 0 && (
        <Korak stevilka={storitve.length > 0 ? 2 : 1} naslov="Podrobnosti">
          <Konfigurator polja={polja} vrednosti={vrednosti} nastavi={(k, v) => setVrednosti((s) => ({ ...s, [k]: v }))} />
        </Korak>
      )}
      <Korak stevilka={1 + zamik} naslov="Kdaj vam ustreza?">
        <div className="grid grid-cols-5 gap-2">
          {DNEVI.map((d) => (
            <Izbira key={d} izbrano={dan === d} onClick={() => setDan(d)}>
              {d}
            </Izbira>
          ))}
        </div>
      </Korak>
      <Korak stevilka={2 + zamik} naslov="Podatki stranke">
        <div className="grid gap-3 sm:grid-cols-2">
          <Polje oznaka="Ime in priimek" />
          <Polje oznaka="Telefon" />
          <div className="sm:col-span-2">
            <Polje oznaka="Opombe" vrstice={2} />
          </div>
        </div>
      </Korak>
      <Gumb onemogoceno={storitve.length > 0 && izbrane.length === 0} onClick={() => setPotrjeno(true)}>
        {poziv}
      </Gumb>
    </div>
  );
}

function Povprasevanje({
  poziv,
  storitve,
  polja = [],
  rezultat = "",
}: {
  poziv: string;
  storitve: Storitev[];
  polja?: PoljeKonfiguratorja[];
  rezultat?: string;
}) {
  const [storitev, setStoritev] = useState(storitve[0]?.ime ?? "");
  const [vrednosti, setVrednosti] = useState<Vrednosti>({});
  const [potrjeno, setPotrjeno] = useState(false);

  if (potrjeno) {
    const podrobnosti = [storitev, povzetek(vrednosti)].filter(Boolean).join(", ");
    return (
      <Potrjeno
        naslov="Povpraševanje je poslano"
        besedilo={`Vi dobite sporočilo z vsemi podatki${podrobnosti ? ` (${podrobnosti})` : ""}, stranka pa potrdilo. ${
          rezultat || "Odgovorite, ko vam ustreza."
        }`}
        znova={() => setPotrjeno(false)}
      />
    );
  }
  return (
    <div className="space-y-5">
      {storitve.length > 0 && (
        <Korak stevilka={1} naslov="Kaj vas zanima?">
          <div className="flex flex-wrap gap-2">
            {storitve.map((s) => (
              <Izbira key={s.ime} izbrano={storitev === s.ime} onClick={() => setStoritev(s.ime)}>
                {s.ime}
              </Izbira>
            ))}
          </div>
        </Korak>
      )}
      {polja.length > 0 && (
        <Korak stevilka={storitve.length > 0 ? 2 : 1} naslov="Podrobnosti">
          <Konfigurator polja={polja} vrednosti={vrednosti} nastavi={(k, v) => setVrednosti((s) => ({ ...s, [k]: v }))} />
        </Korak>
      )}
      <Korak stevilka={(storitve.length > 0 ? 2 : 1) + (polja.length > 0 ? 1 : 0)} naslov="Podatki stranke">
        <div className="grid gap-3 sm:grid-cols-2">
          <Polje oznaka="Ime in priimek" />
          <Polje oznaka="E-pošta ali telefon" />
          <div className="sm:col-span-2">
            <Polje oznaka="Sporočilo" vrstice={polja.length > 0 ? 2 : 3} />
          </div>
        </div>
      </Korak>
      <Gumb onClick={() => setPotrjeno(true)}>{poziv}</Gumb>
    </div>
  );
}

type Vrstica = { kdo: "stranka" | "pomocnik"; besedilo: string };

function Pomocnik({ ime, storitve, vprasanja: pravaVprasanja = [] }: { ime: string; storitve: Storitev[]; vprasanja?: Vprasanje[] }) {
  // Njihova resnična vprašanja (iz raziskave), sicer vprašanja o storitvah.
  const vprasanja = [
    ...(pravaVprasanja.length > 0
      ? pravaVprasanja.slice(0, 4).map((x) => ({ vprasanje: x.v, odgovor: x.o }))
      : storitve.slice(0, 3).map((s) => ({
          vprasanje: `Povejte mi več: ${s.ime}`,
          odgovor: s.opis || `${s.ime} je ena naših storitev. Za podrobnosti pustite kontakt in vas pokličemo.`,
        }))),
    {
      vprasanje: "Kako se dogovorimo?",
      odgovor: "Pustite ime in telefon, pa vas pokličemo, ko vam ustreza.",
    },
  ];
  const [pogovor, setPogovor] = useState<Vrstica[]>([
    { kdo: "pomocnik", besedilo: `Pozdravljeni! Sem spletni pomočnik podjetja ${ime}. Kaj vas zanima?` },
  ]);

  return (
    <div>
      <div className="max-h-80 space-y-3 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4">
        {pogovor.map((v, i) => (
          <div key={i} className={`flex gap-2 ${v.kdo === "stranka" ? "justify-end" : ""}`}>
            {v.kdo === "pomocnik" && (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white">
                <Bot className="h-4 w-4" />
              </span>
            )}
            <p
              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                v.kdo === "stranka" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-800"
              }`}
            >
              {v.besedilo}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {vprasanja.map((v) => (
          <Izbira
            key={v.vprasanje}
            izbrano={false}
            onClick={() =>
              setPogovor((prej) => [
                ...prej,
                { kdo: "stranka", besedilo: v.vprasanje },
                { kdo: "pomocnik", besedilo: v.odgovor },
              ])
            }
          >
            {v.vprasanje}
          </Izbira>
        ))}
      </div>
      <p className="mt-3 text-xs text-zinc-400">
        Predogled. Pravi pomočnik odgovarja iz vsebine vaše strani — česar ne ve, preda vam.
      </p>
    </div>
  );
}

function Korak({ stevilka, naslov, children }: { stevilka: number; naslov: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-900">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white">
          {stevilka}
        </span>
        {naslov}
      </p>
      {children}
    </div>
  );
}

function Izbira({
  izbrano,
  onemogoceno = false,
  onClick,
  children,
}: {
  izbrano: boolean;
  onemogoceno?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={onemogoceno}
      aria-pressed={izbrano}
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm transition ${
        izbrano
          ? "border-zinc-900 bg-zinc-900 text-white"
          : onemogoceno
            ? "cursor-not-allowed border-zinc-100 bg-zinc-50 text-zinc-300 line-through"
            : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
      }`}
    >
      {children}
    </button>
  );
}

function Polje({ oznaka, vrstice }: { oznaka: string; vrstice?: number }) {
  const razred =
    "mt-1 block w-full cursor-default rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-400 outline-none";
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-500">{oznaka}</span>
      {vrstice ? (
        <textarea readOnly tabIndex={-1} rows={vrstice} placeholder="Izpolni stranka" className={`${razred} resize-none`} />
      ) : (
        <input readOnly tabIndex={-1} placeholder="Izpolni stranka" className={razred} />
      )}
    </label>
  );
}

function Gumb({
  onemogoceno = false,
  onClick,
  children,
}: {
  onemogoceno?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={onemogoceno}
      onClick={onClick}
      className="w-full rounded-xl bg-[var(--b,var(--color-accent))] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Potrjeno({ naslov, besedilo, znova }: { naslov: string; besedilo: string; znova: () => void }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <p className="flex items-center gap-2 font-semibold text-emerald-900">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
          <Check className="h-4 w-4" />
        </span>
        {naslov}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-emerald-900/80">{besedilo}</p>
      <p className="mt-3 text-xs text-emerald-900/60">Predogled — nič ni bilo poslano.</p>
      <button
        type="button"
        onClick={znova}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-800 hover:underline"
      >
        <RotateCcw className="h-3.5 w-3.5" /> Poskusite znova
      </button>
    </div>
  );
}
