import Link from "next/link";
import { Inbox, Percent, PhoneCall, UserCheck, Users } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/require-admin";
import ResumeCard from "@/components/dashboard/ResumeCard";
import {
  predajVPromocije,
  preberiDanes,
  preberiEkipo,
  preberiLijak,
  sinhronizirajLeade,
  type Lijak,
} from "@/lib/prodajna-ekipa";
import { Osvezevanje } from "./nadzor/Osvezevanje";
import { Diagram } from "./prodajna-ekipa/Diagram";

/**
 * Prva stran admina: kaj danes čaka nate in prodajna ekipa pri delu, pod
 * tem stari kratki povzetek. Pot naprej je v meniju po korakih
 * (1 najdi stranke → 2 stik → 3 prodaja → …).
 */

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const supabase = createAdminClient();

  // Ekipo, predajo in sinhronizacijo vidi in sproži samo administrator.
  let jeAdmin = true;
  try {
    await requireAdmin();
  } catch {
    jeAdmin = false;
  }

  const [{ count: leadsCount }, { count: partnersCount }, { data: pending }] =
    await Promise.all([
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "partner"),
      supabase.from("commissions").select("amount").eq("status", "pending"),
    ]);

  const ekipa = jeAdmin ? await preberiEkipo() : null;
  let lijak: Lijak | null = null;
  let danes: { klicev: number; leadovIzKlepeta: number } | null = null;
  if (jeAdmin) {
    const [l, d] = await Promise.all([
      preberiLijak().catch(() => null),
      preberiDanes().catch(() => null),
      // Predaja zanimanja v Promocije in kontakti ekipe v Bazo leadov.
      ekipa?.povzetek ? predajVPromocije().catch(() => null) : Promise.resolve(null),
      ekipa?.povzetek ? sinhronizirajLeade().catch(() => null) : Promise.resolve(null),
    ]);
    lijak = l;
    danes = d;
  }

  const pendingTotal = (pending ?? []).reduce(
    (sum, row) => sum + Number(row.amount),
    0
  );

  const stats = [
    { icon: Inbox, label: "Leadi iz klepeta", value: leadsCount ?? 0 },
    { icon: Users, label: "Partnerji", value: partnersCount ?? 0 },
    {
      icon: Percent,
      label: "Neizplačane provizije",
      value: `${pendingTotal.toFixed(2)} €`,
    },
  ];

  const povzetek = ekipa?.povzetek ?? null;
  const osnutkov = povzetek?.delavci.find((d) => d.kljuc === "odobritev")?.glavna.vrednost ?? 0;
  const zanimanje = povzetek?.delavci.find((d) => d.kljuc === "prodaja")?.glavna.vrednost ?? 0;
  const naloge = [
    {
      ikona: UserCheck,
      stevilo: osnutkov ?? 0,
      besedilo: "osnutkov čaka na tvojo odobritev",
      href: "/admin/prodajna-ekipa/odobritev",
      gumb: "Odobri",
    },
    {
      ikona: PhoneCall,
      stevilo: danes?.klicev ?? 0,
      besedilo: zanimanje ? `klicev za danes (${zanimanje} z zanimanjem)` : "klicev za danes",
      href: "/admin/promocije",
      gumb: "Pokliči",
    },
    {
      ikona: Inbox,
      stevilo: danes?.leadovIzKlepeta ?? 0,
      besedilo: "novih leadov iz klepeta (7 dni)",
      href: "/admin/leads",
      gumb: "Poglej",
    },
  ];

  return (
    <div>
      {jeAdmin ? <Osvezevanje vsakoS={30} /> : null}
      <h1 className="text-3xl font-semibold text-zinc-900">Pregled</h1>
      <p className="mt-2 text-base text-zinc-500">
        Kaj danes čaka nate in kaj dela prodajna ekipa. Pot naprej je v meniju po korakih.
      </p>

      <ResumeCard />

      {jeAdmin ? (
        <>
          <h2 className="mt-8 text-sm font-semibold text-zinc-900">Danes zate</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {naloge.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="group flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-400"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <n.ikona className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-2xl font-semibold text-zinc-900">{n.stevilo}</span>
                  <span className="block text-sm text-zinc-500">{n.besedilo}</span>
                </span>
                <span className="shrink-0 text-sm font-medium text-zinc-400 group-hover:text-zinc-900">
                  {n.gumb} →
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-900">Prodajna ekipa pri delu</h2>
            <Link href="/admin/prodajna-ekipa" className="text-sm text-zinc-500 underline hover:text-zinc-900">
              Odpri ekipo
            </Link>
          </div>
          {ekipa?.napaka ? (
            <p className="mt-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
              {ekipa.napaka}
            </p>
          ) : null}
          {povzetek ? <Diagram povzetek={povzetek} lijak={lijak} /> : null}
        </>
      ) : null}

      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <stat.icon className="h-6 w-6" />
            </div>
            <p className="mt-5 text-3xl font-semibold text-zinc-900">
              {stat.value}
            </p>
            <p className="mt-1 text-sm text-zinc-500">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
