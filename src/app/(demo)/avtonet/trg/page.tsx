import { BadgePercent, Flame, Handshake, MapPin, Palette, PieChart, TrendingUp } from "lucide-react";
import { preberiStatistike } from "@/lib/avtonet/statistikaBranje";
import { eur } from "@/lib/avtonet/analiza";

/**
 * Tržni pregled — the market-wide aggregates, precomputed by the worker.
 *
 * Public on purpose: like /analiza it is the demo a prospect can be shown.
 * Every section renders only when its sample is workable; the young sections
 * say "zbiramo" instead of showing thin medians as insight.
 */

export const revalidate = 300;
export const metadata = { title: "Trg — SBN Auto" };

type Pogajalska = {
  modeli: { model: string; vzorec: number; medSpustPct: number; delezZnizanih: number }[];
  dealer: number | null;
  zasebnik: number | null;
};
type ZvsT = {
  modeli: { model: string; cenaDealer: number; cenaZasebnik: number; razlikaPct: number; vzorec: number }[];
  medRazlikaPct: number | null;
  modelov: number;
};
type Barve = { vrstice: { barva: string; aktivnih: number; medCena: number | null; medDni: number | null; vzorecDni: number }[] };
type Struktura = { gorivo: Record<string, number>; menjalnik: Record<string, number>; starost: Record<string, number>; aktivnihSkupaj: number };
type Vroci = { vrstice: { model: string; medOglediNaDan: number; aktivnih: number; delez14: number | null }[]; zbiramo: boolean; oglasovZOgledi: number };
type Regije = { vrstice: { regija: string; aktivnih: number; odstopanjePct: number; medDni: number | null }[]; zbiramo: boolean; pokritost: number };
type Sezona = { tocke: { mesec: string; medDni: number; vzorec: number }[]; zbiramo: boolean };
type Indeks = { tocke: { mesec: string; medianaMedian: number; modelov: number }[] };

export default async function TrgPage() {
  const s = await preberiStatistike([
    "pogajalska", "zasebnik_vs_trgovec", "barve", "struktura", "vroci_modeli", "regije", "sezona", "indeks_cen", "meta",
  ]);
  const pog = s.pogajalska as Pogajalska | null;
  const zvt = s.zasebnik_vs_trgovec as ZvsT | null;
  const barve = s.barve as Barve | null;
  const str = s.struktura as Struktura | null;
  const vroci = s.vroci_modeli as Vroci | null;
  const regije = s.regije as Regije | null;
  const sezona = s.sezona as Sezona | null;
  const indeks = s.indeks_cen as Indeks | null;
  const meta = s.meta as { aktivnih: number; zakljucenihVeljavnih: number } | null;

  if (!meta) {
    return (
      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center">
        <h1 className="text-lg font-semibold text-zinc-900">Statistika še ni izračunana</h1>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-zinc-500">
          Prvi izračun se zgodi po prvem končanem pregledu trga. Poglejte kasneje.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">Tržni pregled</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-zinc-500">
        Agregati čez celoten slovenski trg ({meta.aktivnih.toLocaleString("sl-SI")} aktivnih oglasov).
        Preračunano po vsakem pregledu trga; prodajne metrike izločajo ponovne objave istega vozila.
      </p>

      {/* Pogajalska rezerva */}
      {pog && (pog.modeli.length > 0 || pog.dealer !== null) && (
        <Sekcija ikona={<Handshake className="h-4 w-4 text-accent" />} naslov="Pogajalska rezerva"
          opis="Koliko so prodajalci dejansko spustili ceno od prve objave do izginotja oglasa.">
          {(pog.dealer !== null || pog.zasebnik !== null) && (
            <p className="mb-3 text-sm text-zinc-700">
              {pog.dealer !== null && <>Trgovci spustijo tipično <strong>{pog.dealer} %</strong>. </>}
              {pog.zasebnik !== null && <>Zasebniki tipično <strong>{pog.zasebnik} %</strong>.</>}
            </p>
          )}
          {pog.modeli.length > 0 ? (
            <Tabela glava={["Model", "Tipičen spust", "% oglasov z znižanjem", "Vzorec"]}
              vrstice={pog.modeli.slice(0, 12).map((m) => [m.model, `${m.medSpustPct} %`, `${m.delezZnizanih} %`, String(m.vzorec)])} />
          ) : (
            <Zbiramo besedilo="Za razrez po modelih še ni dovolj zaključenih oglasov (prag: 15 na model)." />
          )}
        </Sekcija>
      )}

      {/* Zasebnik vs trgovec */}
      {zvt && zvt.modeli.length > 0 && (
        <Sekcija ikona={<BadgePercent className="h-4 w-4 text-accent" />} naslov="Zasebnik proti trgovcu"
          opis="Mediana zahtevane cene istega modela pri trgovcih in zasebnikih.">
          {zvt.medRazlikaPct !== null && (
            <p className="mb-3 text-sm text-zinc-700">
              Čez {zvt.modelov} modelov so trgovci tipično <strong>{zvt.medRazlikaPct} % dražji</strong> od zasebnikov.
            </p>
          )}
          <Tabela glava={["Model", "Trgovec", "Zasebnik", "Razlika", "Vzorec"]}
            vrstice={zvt.modeli.slice(0, 10).map((m) => [m.model, eur(m.cenaDealer), eur(m.cenaZasebnik), `${m.razlikaPct} %`, String(m.vzorec)])} />
        </Sekcija>
      )}

      {/* Vroči modeli */}
      {vroci && (
        <Sekcija ikona={<Flame className="h-4 w-4 text-accent" />} naslov="Vroči modeli"
          opis="Mediana ogledov na dan (povpraševanje) proti številu aktivnih oglasov (ponudba).">
          {vroci.zbiramo ? (
            <Zbiramo besedilo={`Oglede zbiramo od 14. 8. — zaenkrat ${vroci.oglasovZOgledi} oglasov z znanimi ogledi. Lestvica se napolni v nekaj dneh.`} />
          ) : (
            <Tabela glava={["Model", "Ogledi/dan", "Aktivnih", "Prodanih ≤ 14 dni"]}
              vrstice={vroci.vrstice.slice(0, 15).map((v) => [v.model, String(v.medOglediNaDan), String(v.aktivnih), v.delez14 === null ? "—" : `${v.delez14} %`])} />
          )}
        </Sekcija>
      )}

      {/* Regije */}
      {regije && (
        <Sekcija ikona={<MapPin className="h-4 w-4 text-accent" />} naslov="Cene po regijah"
          opis="Odstopanje cen od državne mediane ISTIH modelov — ne primerjamo različnih avtov, ampak isti avto v različnih regijah.">
          {regije.zbiramo || regije.vrstice.length === 0 ? (
            <Zbiramo besedilo={`Lokacija je znana pri ${regije.pokritost.toLocaleString("sl-SI")} oglasih (zbira se z detajlnimi pregledi). Prikaz, ko bo pokritost dovolj velika.`} />
          ) : (
            <Tabela glava={["Regija", "Odstopanje cene", "Aktivnih", "Mediana dni"]}
              vrstice={regije.vrstice.map((r) => [r.regija, `${r.odstopanjePct > 0 ? "+" : ""}${r.odstopanjePct} %`, String(r.aktivnih), r.medDni === null ? "—" : String(r.medDni)])} />
          )}
        </Sekcija>
      )}

      {/* Barve */}
      {barve && barve.vrstice.length > 0 && (
        <Sekcija ikona={<Palette className="h-4 w-4 text-accent" />} naslov="Barve"
          opis="Ponudba, tipična cena in hitrost izginotja po barvi.">
          <Tabela glava={["Barva", "Aktivnih", "Mediana cene", "Mediana dni (vzorec)"]}
            vrstice={barve.vrstice.slice(0, 12).map((b) => [b.barva, String(b.aktivnih), eur(b.medCena), b.medDni === null ? "—" : `${b.medDni} (${b.vzorecDni})`])} />
        </Sekcija>
      )}

      {/* Struktura */}
      {str && (
        <Sekcija ikona={<PieChart className="h-4 w-4 text-accent" />} naslov="Struktura ponudbe"
          opis={`Iz česa je sestavljen trg ta trenutek (${str.aktivnihSkupaj.toLocaleString("sl-SI")} aktivnih oglasov).`}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Delezi naslov="Gorivo" podatki={str.gorivo} />
            <Delezi naslov="Menjalnik" podatki={str.menjalnik} />
            <Delezi naslov="Starost" podatki={str.starost} />
          </div>
        </Sekcija>
      )}

      {/* Indeks + sezona — zorita */}
      <Sekcija ikona={<TrendingUp className="h-4 w-4 text-accent" />} naslov="Indeks cen in sezonskost"
        opis="Gibanje cen po mesecih in sezonski vzorci prodaje.">
        {indeks && indeks.tocke.length >= 2 ? (
          <Tabela glava={["Mesec", "Mediana median modelov", "Modelov"]}
            vrstice={indeks.tocke.map((t) => [t.mesec, eur(t.medianaMedian), String(t.modelov)])} />
        ) : (
          <Zbiramo besedilo="Časovna vrsta se gradi — prva primerjava mesecev bo vidna septembra, resen trend čez ~3 mesece. Točke se zbirajo same." />
        )}
        {sezona && !sezona.zbiramo && sezona.tocke.length > 0 && (
          <div className="mt-3">
            <Tabela glava={["Mesec izginotja", "Mediana dni", "Vzorec"]}
              vrstice={sezona.tocke.map((t) => [t.mesec, String(t.medDni), String(t.vzorec)])} />
          </div>
        )}
      </Sekcija>

      <p className="mt-8 border-t border-zinc-200 pt-4 text-xs text-zinc-400">
        Vse številke so mediane z navedenim vzorcem; skupine pod pragom niso prikazane. „Zadnja cena
        pred izginotjem&ldquo; ni prodajna cena — te vir ne objavi. Podatki z Avto.net ob upoštevanju
        njihovega robots.txt.
      </p>
    </div>
  );
}

function Sekcija({ ikona, naslov, opis, children }: { ikona: React.ReactNode; naslov: string; opis: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">{ikona}{naslov}</h2>
      <p className="mt-0.5 max-w-2xl text-sm text-zinc-500">{opis}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Tabela({ glava, vrstice }: { glava: string[]; vrstice: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
          <tr>{glava.map((g, i) => <th key={g} className={`px-4 py-2.5 font-medium ${i > 0 ? "text-right" : ""}`}>{g}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {vrstice.map((v, i) => (
            <tr key={i} className="hover:bg-zinc-50">
              {v.map((c, j) => (
                <td key={j} className={`px-4 py-2.5 ${j === 0 ? "font-medium text-zinc-900" : "text-right tabular-nums text-zinc-600"}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Delezi({ naslov, podatki }: { naslov: string; podatki: Record<string, number> }) {
  const vnosi = Object.entries(podatki).slice(0, 5);
  // Shares against the KNOWN values in this category — an advert whose fuel we
  // do not know must not silently count as "not diesel".
  const skupaj = Object.values(podatki).reduce((a, b) => a + b, 0);
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{naslov}</p>
      <div className="mt-2 space-y-1.5">
        {vnosi.map(([k, n]) => {
          const pct = skupaj > 0 ? Math.round((n / skupaj) * 100) : 0;
          return (
            <div key={k}>
              <div className="flex justify-between text-xs text-zinc-600"><span>{k}</span><span className="tabular-nums">{pct} %</span></div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full rounded-full bg-accent/70" style={{ width: `${Math.max(2, pct)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Zbiramo({ besedilo }: { besedilo: string }) {
  return (
    <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
      📊 Zbiramo podatke — {besedilo}
    </p>
  );
}
