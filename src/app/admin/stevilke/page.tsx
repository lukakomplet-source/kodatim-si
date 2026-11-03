import { zahtevajStran } from "@/lib/require-admin";
import { getCurrentUserPermissions } from "@/lib/permissions/require-permission";
import { preberiPosel } from "@/lib/posel";
import {
  preberiStevilkeKodaTimTeden,
  preberiStevilkeKompletkoTeden,
  type KlicniStevci,
  type StevciKodaTim,
} from "@/lib/stevilke";

/**
 * Številke › Dan in teden (faza 7): samo iz vpisanih dogodkov (maili, odgovori, ogledi, vpisani klici).
 * Kjer vir ne odgovori, piše »ni podatka«. Napoved šele pri 5 sestankih, prej »premalo podatkov«.
 * Zapora: promotion.view, lead_intelligence.view ali kompletko.view (kot zavihek v admin-meni.ts); Kompletko del vidi
 * administrator ali kdor ima kompletko.view, KodaTim del administrator ali kdor ima lead_intelligence.view.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Dan in teden" };

const KODATIM_VRSTICE: { kljuc: keyof StevciKodaTim; ime: string }[] = [
  { kljuc: "poslano", ime: "Poslani maili (Harvey)" },
  { kljuc: "prvih", ime: "od tega prvih mailov" },
  { kljuc: "outlook", ime: "Odprti v Outlooku (Hoteli, pošlješ sam)" },
  { kljuc: "odgovorov", ime: "Odgovori" },
  { kljuc: "zanimanje", ime: "od tega zanimanje" },
  { kljuc: "ogledov", ime: "Predlogi, ki so jih odprli" },
  { kljuc: "odjav", ime: "Odjave" },
  { kljuc: "odbitij", ime: "Odbiti maili" },
  { kljuc: "raziskanih", ime: "Raziskana podjetja" },
  { kljuc: "osnutkov", ime: "Novi osnutki" },
  { kljuc: "zavrnjenih", ime: "Zavrnjeni osnutki" },
];

const KLICNE: { kljuc: keyof KlicniStevci; ime: string }[] = [
  { kljuc: "klici", ime: "Klici" },
  { kljuc: "dvignjeni", ime: "Dvignjeni" },
  { kljuc: "sestanki", ime: "Sestanki" },
  { kljuc: "posli", ime: "Posli" },
  { kljuc: "klic_v_sestanek", ime: "Klic v sestanek" },
  { kljuc: "sestanek_v_posel", ime: "Sestanek v posel" },
];

function NiPodatka({ vir }: { vir: string }) {
  return (
    <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
      {vir}: ni podatka (ne odgovarja).
    </p>
  );
}

const CELICA = "px-3 py-2 text-right tabular-nums";

export default async function DanInTedenPage() {
  await zahtevajStran("promotion.view", "lead_intelligence.view", "kompletko.view");
  const [perms, posel] = await Promise.all([getCurrentUserPermissions(), preberiPosel()]);
  const aktiven = !!perms && !perms.neaktiven;
  const jeAdmin = aktiven && perms.bypassAll;
  const smeKodatim = jeAdmin || (aktiven && perms.granted.has("lead_intelligence.view"));
  const smeKompletko = jeAdmin || (aktiven && perms.granted.has("kompletko.view"));
  const kodatim = smeKodatim && posel !== "kompletko";
  const kompletko = smeKompletko && posel !== "kodatim";

  const [kt, kp] = await Promise.all([
    kodatim ? preberiStevilkeKodaTimTeden() : Promise.resolve(null),
    kompletko ? preberiStevilkeKompletkoTeden(7) : Promise.resolve(null),
  ]);

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-semibold text-zinc-900">Dan in teden</h1>
      <p className="mt-2 text-base text-zinc-500">
        Samo to, kar je vpisano: poslani maili, odgovori, ogledi in klici. Teden pomeni zadnjih 7 dni.
      </p>

      {kompletko ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-900">Kompletko</h2>
          {!kp ? (
            <div className="mt-3">
              <NiPodatka vir="Harvey Kompletko (5556)" />
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-zinc-500">Klici od {kp.obdobje.od}, po tem, kdo je klical.</p>
              <div className="mt-3 overflow-x-auto rounded-2xl bg-white ring-1 ring-zinc-200">
                <table className="w-full text-sm">
                  <thead className="text-xs text-zinc-500">
                    <tr className="border-b border-zinc-200">
                      <th className="px-3 py-2 text-left font-medium">Kdo</th>
                      {KLICNE.map((k) => (
                        <th key={k.kljuc} className="px-3 py-2 text-right font-medium">
                          {k.ime}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(kp.obdobje.po_osebi).map(([ime, s]) => (
                      <tr key={ime} className="border-b border-zinc-100">
                        <td className="px-3 py-2 text-zinc-800">{ime === "neznano" ? "ni vpisano, kdo" : ime}</td>
                        {KLICNE.map((k) => (
                          <td key={k.kljuc} className={CELICA}>
                            {s[k.kljuc]}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="px-3 py-2 text-zinc-900">Skupaj</td>
                      {KLICNE.map((k) => (
                        <td key={k.kljuc} className={CELICA}>
                          {kp.obdobje.skupaj[k.kljuc]}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-sm text-zinc-500">
                {kp.obdobje.skupaj.sestanki >= 5
                  ? "Sestankov je 5 ali več: napoved lahko dodamo."
                  : "Napoved: premalo podatkov (manj kot 5 sestankov)."}
              </p>

              <h3 className="mt-6 text-sm font-semibold text-zinc-900">Kaj bi moralo biti vključeno, da bi rekli da</h3>
              {kp.vkljuceno?.length ? (
                <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                  {kp.vkljuceno.map((v) => (
                    <li key={`${v.cas}-${v.domena}`}>
                      »{v.besedilo}«{" "}
                      <span className="text-zinc-500">
                        {v.domena}
                        {v.ugovor ? `, rekli: ${v.ugovor}` : ""}
                        {v.kdo ? `, klical ${v.kdo}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">
                  Še noben odgovor. Vpiše se pri izidu klica, ko po »ne« vprašaš, kaj bi moralo biti vključeno.
                </p>
              )}

              <h3 className="mt-6 text-sm font-semibold text-zinc-900">Maili po varianti (od začetka)</h3>
              {Object.keys(kp.variante).length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">Še noben mail.</p>
              ) : (
                <div className="mt-2 overflow-x-auto rounded-2xl bg-white ring-1 ring-zinc-200">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-zinc-500">
                      <tr className="border-b border-zinc-200">
                        <th className="px-3 py-2 text-left font-medium">Varianta</th>
                        <th className="px-3 py-2 text-right font-medium">Poslano</th>
                        <th className="px-3 py-2 text-right font-medium">Odgovori</th>
                        <th className="px-3 py-2 text-right font-medium">Sestanki</th>
                        <th className="px-3 py-2 text-right font-medium">Kupili</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(kp.variante).map(([v, s]) => (
                        <tr key={v} className="border-b border-zinc-100 last:border-0">
                          <td className="px-3 py-2 text-zinc-800">{v}</td>
                          <td className={CELICA}>{s.poslano}</td>
                          <td className={CELICA}>{s.odgovori}</td>
                          <td className={CELICA}>{s.sestanki}</td>
                          <td className={CELICA}>{s.kupili}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      ) : null}

      {kodatim ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-900">KodaTim</h2>
          {!kt ? (
            <div className="mt-3">
              <NiPodatka vir="Harvey KodaTim (5555)" />
            </div>
          ) : (
            <>
              <div className="mt-3 overflow-x-auto rounded-2xl bg-white ring-1 ring-zinc-200">
                <table className="w-full text-sm">
                  <thead className="text-xs text-zinc-500">
                    <tr className="border-b border-zinc-200">
                      <th className="px-3 py-2 text-left font-medium" />
                      <th className="px-3 py-2 text-right font-medium">Danes</th>
                      <th className="px-3 py-2 text-right font-medium">7 dni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {KODATIM_VRSTICE.map((v) => (
                      <tr key={v.kljuc} className="border-b border-zinc-100 last:border-0">
                        <td className={`px-3 py-2 ${v.ime.startsWith("od tega") ? "pl-6 text-zinc-500" : "text-zinc-800"}`}>{v.ime}</td>
                        <td className={CELICA}>{kt.danes[v.kljuc]}</td>
                        <td className={CELICA}>{kt.teden[v.kljuc]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-sm text-zinc-500">
                Zdaj čaka tebe: {kt.caka.skupaj} (odobritev {kt.caka.odobritev}, Outlook {kt.caka.outlook}). Klici KodaTim
                se štejejo na Danes iz Strank.
              </p>
            </>
          )}
        </section>
      ) : null}

      {!kodatim && !kompletko ? (
        <p className="mt-8 text-sm text-zinc-500">
          {smeKodatim || smeKompletko
            ? "Stikalo posla je na poslu, ki ga ne vidiš. Preklopi na Vse."
            : "Za številke rabiš pravico za KodaTim stranke ali Kompletko. Uredi jo administrator v Nastavitvah › Vloge."}
        </p>
      ) : null}
    </div>
  );
}
