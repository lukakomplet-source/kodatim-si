"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  BellOff,
  Car,
  Clock,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  PRODAJALEC_FILTRI,
  PRODAJALEC_LABELS,
  naslovVozila,
  povzetekFiltra,
  type MoznostiFiltrov,
  type Spremljanje,
} from "@/lib/avtonet/spremljanja";
import {
  izbrisiSpremljanje,
  preklopiSpremljanje,
  shraniSpremljanje,
  type SpremljanjeResult,
} from "./spremljanja-actions";
import { KakoDeluje } from "./KakoDeluje";

/**
 * The watch list.
 *
 * Written for someone shopping for a car, not for someone operating a scraper.
 * Every card answers three questions at a glance — what am I watching, is it
 * on, and is there anything new — and the filter is rendered as one readable
 * line instead of a grid of fields, because a card nobody can read at a glance
 * is just a table with rounded corners.
 */

export type Kartica = { spremljanje: Spremljanje; zadetkov: number; novih: number };

const CARD = "rounded-2xl border border-zinc-200 bg-white shadow-sm";
const INPUT =
  "mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/10";
const LABEL = "block text-[11px] font-semibold uppercase tracking-wide text-zinc-500";

export function SpremljanjaClient({
  kartice,
  moznosti,
  aktivnihOglasov,
  zadnjiPregled,
}: {
  kartice: Kartica[];
  moznosti: MoznostiFiltrov;
  aktivnihOglasov: number;
  zadnjiPregled: string | null;
}) {
  const router = useRouter();
  const [obrazec, setObrazec] = useState<{ open: boolean; urejam: Spremljanje | null }>({
    open: false,
    urejam: null,
  });
  const [state, formAction, saving] = useActionState<SpremljanjeResult, FormData>(shraniSpremljanje, {});
  const [isPending, startTransition] = useTransition();
  const [napaka, setNapaka] = useState<string | null>(null);

  // Adjusted during render rather than in an effect: the action already
  // revalidated the page, so this is state catching up with a prop, not a side
  // effect — and a setState inside an effect would cascade an extra render.
  if (state.success && obrazec.open) {
    setObrazec({ open: false, urejam: null });
  }

  const aktivnih = kartice.filter((k) => k.spremljanje.aktivno).length;
  const novihSkupaj = kartice
    .filter((k) => k.spremljanje.aktivno)
    .reduce((n, k) => n + k.novih, 0);

  const preklop = (s: Spremljanje) => {
    startTransition(async () => {
      const out = await preklopiSpremljanje(s.id, !s.aktivno);
      if (out.error) setNapaka(out.error);
      router.refresh();
    });
  };

  const izbrisi = (s: Spremljanje) => {
    if (!confirm(`Izbrisati spremljanje „${naslovVozila(s)}“?`)) return;
    startTransition(async () => {
      const out = await izbrisiSpremljanje(s.id);
      if (out.error) setNapaka(out.error);
      router.refresh();
    });
  };

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">Moja spremljanja</h1>
          <p className="mt-2 max-w-xl text-[15px] text-zinc-500">
            Spremljaj avtomobile, ki jih iščeš, in bodi obveščen, ko se pojavi nov ustrezen oglas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setObrazec({ open: true, urejam: null })}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          Novo spremljanje
        </button>
      </header>

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Bell className="h-4 w-4" />} label="Aktivnih spremljanj" value={aktivnih} />
        <Kpi
          icon={<Search className="h-4 w-4" />}
          label="Novih zadetkov"
          value={novihSkupaj}
          tone={novihSkupaj > 0 ? "accent" : "zinc"}
        />
        <Kpi icon={<Car className="h-4 w-4" />} label="Oglasov v bazi" value={aktivnihOglasov} />
        <div className={`${CARD} p-4`}>
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-500">
            <Clock className="h-4 w-4" />
            Zadnji pregled
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-900">
            <Cas iso={zadnjiPregled} />
          </p>
        </div>
      </div>

      {napaka && (
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {napaka}
        </p>
      )}

      <KakoDeluje
        naslov="Kako deluje spremljanje"
        uvod={
          <>
            Spremljanje je nabor pogojev. Ob vsakem pregledu trga preverimo, ali je prišel oglas, ki
            jim ustreza, in ga označimo kot nov. Nič ne kupujemo in nič ne pošiljamo prodajalcu — samo
            povemo ti.
          </>
        }
        koraki={[
          {
            naslov: "Kaj pomenijo pogoji",
            besedilo: (
              <>
                Prazno polje ne omejuje ničesar. Izpolnjena polja veljajo hkrati (vsi pogoji morajo
                biti izpolnjeni). Pri letniku, kilometrih, moči in ceni delujeta obe meji; če vpišeš
                samo eno, druga ostane odprta.
              </>
            ),
          },
          {
            naslov: "Kdaj se preverja",
            besedilo: (
              <>
                Ob vsakem pregledu trga — privzeto ob 5.00, 10.00 in 22.00, in vsakič, ko research
                zaženeš ročno. Preverjanje se izvede <strong>takoj po pregledu seznama</strong>, ne
                šele po zbiranju podrobnosti, da je obvestilo pravočasno.
              </>
            ),
          },
          {
            naslov: "Kaj pomeni značka „N novih“",
            besedilo: (
              <>
                Toliko ustreznih oglasov se je pojavilo, odkar si to spremljanje nazadnje odprl.
                Šteje se datum, ko smo oglas <em>prvič videli</em>. Značko počistiš z gumbom „Označi
                kot pregledano“ na seznamu oglasov.
              </>
            ),
          },
          {
            naslov: "Obvestila po e-pošti",
            besedilo: (
              <>
                Naslov se poišče po vrsti: kar je vpisano <strong>pri tem spremljanju</strong>, sicer
                naslov iz <strong>Nastavitev</strong>, sicer tvoj prijavni e-naslov. Pošiljatelj je{" "}
                <strong>security@kompletko.com</strong>. Isti oglas se pri istem spremljanju pošlje
                samo enkrat, tudi če se pregled ponovi.
              </>
            ),
          },
          {
            naslov: "Kam gre naprej",
            besedilo: (
              <>
                „Prikaži oglase“ odpre vse trenutne zadetke; novi so označeni z <strong>NOVO</strong>.
                Klik na oglas te odpelje na izvirni oglas na Avto.netu.
              </>
            ),
          },
        ]}
        omejitve={[
          <>
            <strong>Filter prodajalca je delno slep.</strong> Vrsta prodajalca ni na seznamu oglasov —
            preberemo jo šele na strani posameznega oglasa in tudi tam ne vedno. Oglasov z neznanim
            prodajalcem zato ne izpustimo, ampak jih označimo.
          </>,
          <>
            <strong>Model se išče po besedilu naslova.</strong> Če vpišeš „M340i“, iščemo ta niz v
            nazivu oglasa — prodajalec, ki modela ni napisal enako, ne bo najden.
          </>,
          <>
            Spremljanje najde samo oglase, ki so bili <strong>zajeti v pregledu</strong>. Če je
            zbiralnik ugasnjen, ne najde ničesar novega — na vrhu strani vidiš, kdaj je bil zadnji
            pregled.
          </>,
        ]}
      />


      {obrazec.open && (
        <Obrazec
          urejam={obrazec.urejam}
          moznosti={moznosti}
          formAction={formAction}
          saving={saving}
          napaka={state.error}
          zapri={() => setObrazec({ open: false, urejam: null })}
        />
      )}

      <div className="mt-8 space-y-3">
        {kartice.length === 0 ? (
          <Prazno onNovo={() => setObrazec({ open: true, urejam: null })} />
        ) : (
          kartice.map(({ spremljanje: s, zadetkov, novih }) => (
            <article key={s.id} className={`${CARD} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[17px] font-semibold text-zinc-900">{naslovVozila(s)}</h2>
                    {novih > 0 && s.aktivno && (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
                        {novih} {novih === 1 ? "nov oglas" : "novih"}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        s.aktivno ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${s.aktivno ? "bg-emerald-500" : "bg-zinc-400"}`}
                      />
                      {s.aktivno ? "Aktivno" : "Izklopljeno"}
                    </span>
                  </div>

                  <p className="mt-1.5 text-sm text-zinc-600">{povzetekFiltra(s)}</p>

                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                    <span>{zadetkov} ustreznih oglasov trenutno v bazi</span>
                    {s.email_obvestila && <span>· obvestila na {s.email_obvestila}</span>}
                    {!s.email_obvestila && <span>· brez e-obvestil</span>}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/avtonet/spremljanje/${s.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-zinc-700"
                  >
                    Prikaži oglase
                  </Link>
                  <button
                    type="button"
                    onClick={() => setObrazec({ open: true, urejam: s })}
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3.5 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Uredi
                  </button>
                  <button
                    type="button"
                    onClick={() => preklop(s)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3.5 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {s.aktivno ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                    {s.aktivno ? "Izklopi" : "Vklopi"}
                  </button>
                  <button
                    type="button"
                    onClick={() => izbrisi(s)}
                    disabled={isPending}
                    title="Izbriši"
                    className="rounded-full p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-red-500 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      {kartice.length > 0 && (
        <p className="mt-6 text-xs text-zinc-400">
          Trg pregledamo vsak dan. Nov oglas se tu pojavi po prvem pregledu, ki ga zajame.
        </p>
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone = "zinc",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "zinc" | "accent";
}) {
  return (
    <div className={`${CARD} p-4`}>
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-500">
        {icon}
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "accent" ? "text-accent" : "text-zinc-900"}`}
      >
        {value.toLocaleString("sl-SI")}
      </p>
    </div>
  );
}

/** Relative time, computed after mount so a cached page cannot show a stale one. */
function Cas({ iso }: { iso: string | null }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()));
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!iso) return <span className="text-zinc-400">še ni bilo pregleda</span>;
  if (now === 0) return <span>…</span>;

  const min = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (min < 1) return <span>pravkar</span>;
  if (min < 60) return <span>pred {min} min</span>;
  const h = Math.floor(min / 60);
  if (h < 24) return <span>pred {h} h</span>;
  return <span>pred {Math.floor(h / 24)} dnevi</span>;
}

function Prazno({ onNovo }: { onNovo: () => void }) {
  return (
    <div className={`${CARD} px-6 py-12 text-center`}>
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
        <Bell className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-zinc-900">Še nimate nobenega spremljanja</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-zinc-500">
        Povejte, kateri avto iščete — znamko, letnik, kilometre, ceno — in javili vam bomo, ko se pojavi
        nov ustrezen oglas. Brez brskanja po oglasniku vsak dan.
      </p>
      <button
        type="button"
        onClick={onNovo}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110"
      >
        <Plus className="h-4 w-4" />
        Ustvari prvo spremljanje
      </button>
    </div>
  );
}

function Obrazec({
  urejam,
  moznosti,
  formAction,
  saving,
  napaka,
  zapri,
}: {
  urejam: Spremljanje | null;
  moznosti: MoznostiFiltrov;
  formAction: (fd: FormData) => void;
  saving: boolean;
  napaka?: string;
  zapri: () => void;
}) {
  return (
    <div className={`${CARD} mt-6 p-6`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            {urejam ? `Uredi „${naslovVozila(urejam)}“` : "Kaj želiš spremljati?"}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Izpolni samo tisto, kar ti je pomembno — prazna polja ne omejujejo iskanja.
          </p>
        </div>
        <button
          type="button"
          onClick={zapri}
          className="rounded-full p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form action={formAction} className="mt-5 space-y-5">
        <input type="hidden" name="id" value={urejam?.id ?? ""} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={LABEL}>
            Znamka
            <input
              name="znamka"
              defaultValue={urejam?.znamka ?? ""}
              list="avtonet-znamke"
              placeholder="npr. BMW"
              className={INPUT}
            />
            <datalist id="avtonet-znamke">
              {moznosti.znamke.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </label>
          <label className={LABEL}>
            Model
            <input
              name="model"
              defaultValue={urejam?.model ?? ""}
              placeholder="npr. M340i"
              className={INPUT}
            />
          </label>
        </div>

        <Skupina naslov="Letnik">
          <Par ime="letnik_min" oznaka="Od" vrednost={urejam?.letnik_min} placeholder="2020" />
          <Par ime="letnik_max" oznaka="Do" vrednost={urejam?.letnik_max} placeholder="2025" />
        </Skupina>

        <Skupina naslov="Kilometri">
          <Par ime="km_min" oznaka="Najmanj" vrednost={urejam?.km_min} placeholder="0" />
          <Par ime="km_max" oznaka="Največ" vrednost={urejam?.km_max} placeholder="100000" />
        </Skupina>

        <Skupina naslov="Moč (KM)">
          <Par ime="moc_min" oznaka="Najmanj" vrednost={urejam?.moc_min} placeholder="300" />
          <Par ime="moc_max" oznaka="Največ" vrednost={urejam?.moc_max} placeholder="" />
        </Skupina>

        <Skupina naslov="Cena (€)">
          <Par ime="cena_min" oznaka="Od" vrednost={urejam?.cena_min} placeholder="" />
          <Par ime="cena_max" oznaka="Do" vrednost={urejam?.cena_max} placeholder="50000" />
        </Skupina>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className={LABEL}>
            Gorivo
            <select name="gorivo" defaultValue={urejam?.gorivo ?? ""} className={INPUT}>
              <option value="">Vse</option>
              {moznosti.goriva.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            Menjalnik
            <select name="menjalnik" defaultValue={urejam?.menjalnik ?? ""} className={INPUT}>
              <option value="">Vsi</option>
              {moznosti.menjalniki.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            Prodajalec
            <select
              name="prodajalec_filter"
              defaultValue={urejam?.prodajalec_filter ?? "vsi"}
              className={INPUT}
            >
              {PRODAJALEC_FILTRI.map((p) => (
                <option key={p} value={p}>
                  {PRODAJALEC_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="rounded-xl bg-zinc-50 px-3.5 py-2.5 text-xs text-zinc-500">
          Vrsta prodajalca ni objavljena na seznamu oglasov — preberemo jo šele na strani posameznega
          oglasa in tudi tam ne vedno. Oglasov z neznanim prodajalcem zato ne izpustimo, ampak jih
          označimo.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={LABEL}>
            Ime spremljanja
            <input
              name="naziv"
              defaultValue={urejam?.naziv ?? ""}
              placeholder="samodejno iz znamke in modela"
              className={INPUT}
            />
          </label>
          <label className={LABEL}>
            E-naslov za obvestila
            <input
              name="email_obvestila"
              type="email"
              defaultValue={urejam?.email_obvestila ?? ""}
              placeholder="privzeto iz Nastavitev"
              className={INPUT}
            />
            <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-zinc-400">
              Pustite prazno in obvestila gredo na naslov iz Nastavitev. Vpišite drugega samo, če
              želite prav to spremljanje drugam.
            </span>
          </label>
        </div>

        {napaka && (
          <p className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {napaka}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {urejam ? "Shrani spremembe" : "Ustvari spremljanje"}
          </button>
          <button
            type="button"
            onClick={zapri}
            className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            Prekliči
          </button>
        </div>
      </form>
    </div>
  );
}

function Skupina({ naslov, children }: { naslov: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className={LABEL}>{naslov}</legend>
      <div className="mt-1 grid grid-cols-2 gap-4">{children}</div>
    </fieldset>
  );
}

function Par({
  ime,
  oznaka,
  vrednost,
  placeholder,
}: {
  ime: string;
  oznaka: string;
  vrednost: number | null | undefined;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-zinc-500">{oznaka}</span>
      <input
        name={ime}
        inputMode="numeric"
        defaultValue={vrednost ?? ""}
        placeholder={placeholder}
        className={INPUT}
      />
    </label>
  );
}
