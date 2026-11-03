import Link from "next/link";
import { zahtevajStran } from "@/lib/require-admin";
import { getCurrentUserPermissions } from "@/lib/permissions/require-permission";
import { RAZDELKI, STARI_MENI, dovoljenjaRazdelka, praviceIz, ustreza } from "@/lib/admin-meni";

/**
 * Stari admin (faza 3): današnji meni s 13 točkami, da se med prenovo nič ne izgubi. Vse stare poti delajo
 * kot prej; Prodajni coach in Arhiv podjetja sta dosegljiva samo tu. Povezavo umaknemo v fazi 7.
 */

export const metadata = { title: "Stari admin" };

export default async function StariAdminPage() {
  // Isti krog ljudi kot Nastavitve: administratorji, ne Prodaja Kompletko.
  const nastavitve = RAZDELKI.find((r) => r.kljuc === "nastavitve");
  await zahtevajStran(...(nastavitve ? dovoljenjaRazdelka(nastavitve) : []));
  const perms = await getCurrentUserPermissions();
  const pravice = praviceIz(perms);
  const tocke = STARI_MENI.filter((t) => ustreza(t.permission, pravice));

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-semibold text-zinc-900">Stari admin</h1>
      <p className="mt-2 text-base text-zinc-600">
        Meni, kot je bil pred prenovo. Vse strani delajo kot prej; novi meni levo jih kaže po razdelkih.
      </p>

      <ul className="mt-8 divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
        {tocke.map((t) => (
          <li key={t.href} className="px-5 py-4">
            <Link href={t.href} className="text-[15px] font-medium text-zinc-900 hover:text-accent">
              {t.label}
            </Link>
            {t.podstrani?.length ? (
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {t.podstrani.map((p) => (
                  <li key={p.href}>
                    <Link href={p.href} className="text-sm text-zinc-500 hover:text-zinc-900">
                      {p.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
