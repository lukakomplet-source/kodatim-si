import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppWindow, BarChart3, Building2, History, LayoutDashboard, MessagesSquare, Search, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import DashboardShell from "@/components/dashboard/DashboardShell";
import LastPathTracker from "@/components/dashboard/LastPathTracker";
import { OznaciInterno } from "@/app/predlog/[koda]/OznaciInterno";
import { getCurrentUserPermissions } from "@/lib/permissions/require-permission";
import { RAZDELKI, meniZa, potiRazdelka, praviceIz } from "@/lib/admin-meni";
import type { RoleKey } from "@/lib/permissions/registry";
import { preberiPosel } from "@/lib/posel";
import { Zavihki } from "./Zavihki";
import { StikaloPosla } from "./StikaloPosla";
import { NaslovStrani } from "./NaslovStrani";
import { ZnackaCaka } from "./ZnackaCaka";
import { IskanjePodjetij } from "./IskanjePodjetij";

const ICON_CLASS = "h-5 w-5";

/** RBAC roles that belong to the partner portal, never to the admin. */
const PORTALNE_VLOGE: RoleKey[] = ["partner", "referral", "user"];

/** Ikona vsake točke menija; točke same so v src/lib/admin-meni.ts (iz njih so tudi zavihki na vrhu). */
const IKONE: Record<string, ReactNode> = {
  danes: <LayoutDashboard className={ICON_CLASS} />,
  podjetja: <Building2 className={ICON_CLASS} />,
  komunikacija: <MessagesSquare className={ICON_CLASS} />,
  iskanje: <Search className={ICON_CLASS} />,
  stevilke: <BarChart3 className={ICON_CLASS} />,
  aplikacije: <AppWindow className={ICON_CLASS} />,
  nastavitve: <Settings className={ICON_CLASS} />,
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/prijava?redirect=/admin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isLegacyAdmin = profile?.role === "admin";
  const perms = await getCurrentUserPermissions();

  // Status »Neaktiven« locks everyone out, legacy admins included.
  if (perms?.neaktiven) {
    redirect("/racun-neaktiven");
  }

  // Legacy admins keep working exactly as before. RBAC roles get in, except
  // the portal roles (Partner, Referral, User): per Luka's decision (Faza 2,
  // Q1) a partner sees only /partner. A portal role whose profile isn't a
  // partner goes home, because /partner would send it back here (loop).
  if (!isLegacyAdmin && (!perms?.roleKey || PORTALNE_VLOGE.includes(perms.roleKey))) {
    redirect(profile?.role === "partner" ? "/partner" : "/");
  }

  // Meni za tega uporabnika: razdelki in zavihki, ki jih sme videti (src/lib/admin-meni.ts).
  const pravice = praviceIz(perms);
  const meni = meniZa(isLegacyAdmin ? { admin: true, ima: () => true } : pravice);
  const posel = await preberiPosel();
  // Badge »čaka« (phase 5): the same businesses as Komunikacija (komunikacija/kontekst.ts) and the switch.
  const jeAdmin = isLegacyAdmin || pravice.admin;
  const vidiKodaTim = jeAdmin && posel !== "kompletko";
  const vidiKompletko = jeAdmin ? posel !== "kodatim" : pravice.ima("kompletko.view");

  const visibleNavItems = meni.map((r) => {
    // Paths come from the full section, so the highlighted item always matches razdelekZa().
    const celoten = RAZDELKI.find((x) => x.kljuc === r.kljuc) ?? r;
    return {
      href: r.href,
      label: r.label,
      icon: IKONE[r.kljuc],
      skupina: r.skupina,
      poti: potiRazdelka(celoten),
      // Danes (/admin) is lit only on /admin itself, as in razdelekZa(); otherwise every page outside a section.
      natancno: r.href === "/admin",
      znacka:
        r.kljuc === "komunikacija" ? (
          <Suspense fallback={null}>
            <ZnackaCaka kodatim={vidiKodaTim} kompletko={vidiKompletko} />
          </Suspense>
        ) : undefined,
    };
  });
  // Tab href (as in RAZDELKI) -> the page it opens for this user (Ljudje may open /admin/vloge, …).
  const dovoljeniZavihki = Object.fromEntries(meni.flatMap((r) => (r.zavihki ?? []).map((z) => [z.href, z.vhod])));

  // »Stari admin« only for admins (whoever sees Nastavitve), never for Prodaja Kompletko.
  // Ctrl+K (phase 6): whoever may open Podjetja (the search route checks the same permissions).
  const iscePodjetja = jeAdmin || pravice.ima("lead_intelligence.view") || pravice.ima("kompletko.view");

  const vidiStariAdmin =
    perms?.roleKey !== "prodaja_kompletko" && meni.some((r) => r.kljuc === "nastavitve");

  return (
    <DashboardShell
      title="Admin"
      navItems={visibleNavItems}
      userEmail={user.email ?? ""}
      lepljiv
      zgoraj={
        <>
          <StikaloPosla zacetno={posel} />
          {iscePodjetja ? <IskanjePodjetij /> : null}
        </>
      }
      spodaj={
        vidiStariAdmin ? (
          <Link
            href="/admin/stari-admin"
            className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm text-zinc-400 transition hover:bg-zinc-50 hover:text-zinc-700"
          >
            <History className="h-4 w-4" />
            Stari admin
          </Link>
        ) : null
      }
    >
      <LastPathTracker />
      <NaslovStrani />
      {/* Whoever uses the admin is team: their proposal views never count */}
      <OznaciInterno />
      <Zavihki dovoljeni={dovoljeniZavihki} />
      {children}
    </DashboardShell>
  );
}
