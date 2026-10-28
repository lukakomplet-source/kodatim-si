import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import {
  Activity,
  Archive,
  Factory,
  Globe,
  LayoutDashboard,
  Mail,
  Radar,
  ShieldCheck,
  Siren,
  Target,
  UserCog,
  Users,
  Workflow,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import DashboardShell from "@/components/dashboard/DashboardShell";
import LastPathTracker from "@/components/dashboard/LastPathTracker";
import { OznaciInterno } from "@/app/predlog/[koda]/OznaciInterno";
import { getCurrentUserPermissions, hasPermission } from "@/lib/permissions/require-permission";
import { RAZDELKI } from "@/lib/admin-meni";
import { Zavihki } from "./Zavihki";

const ICON_CLASS = "h-5 w-5";

/** Ikona vsake točke menija; točke same so v src/lib/admin-meni.ts (iz njih so tudi zavihki na vrhu). */
const IKONE: Record<string, ReactNode> = {
  danes: <LayoutDashboard className={ICON_CLASS} />,
  maili: <Mail className={ICON_CLASS} />,
  kompletko: <Siren className={ICON_CLASS} />,
  stranke: <Radar className={ICON_CLASS} />,
  iskanje: <Factory className={ICON_CLASS} />,
  prodaja: <Target className={ICON_CLASS} />,
  harvey: <Workflow className={ICON_CLASS} />,
  izvedba: <Globe className={ICON_CLASS} />,
  partnerji: <Users className={ICON_CLASS} />,
  uporabniki: <UserCog className={ICON_CLASS} />,
  vloge: <ShieldCheck className={ICON_CLASS} />,
  nadzor: <Activity className={ICON_CLASS} />,
  arhiv: <Archive className={ICON_CLASS} />,
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

  // Additive widening: legacy admins keep working exactly as before; any of
  // the 7 new RBAC roles also gets in, so the new permission system and nav
  // filtering below are actually reachable/testable in this phase. Nothing
  // existing is removed by this check.
  if (!isLegacyAdmin && !perms?.roleKey) {
    redirect("/partner");
  }

  const visibleNavItems = RAZDELKI.filter(
    (item) => item.permission === null || isLegacyAdmin || hasPermission(perms, item.permission)
  ).map((r) => ({
    href: r.href,
    label: r.label,
    icon: IKONE[r.kljuc],
    skupina: r.skupina,
    poti: [...(r.poti ?? []), ...(r.zavihki ?? []).flatMap((z) => [z.href, ...(z.poti ?? [])])],
  }));

  return (
    <DashboardShell
      title="Admin"
      navItems={visibleNavItems}
      userEmail={user.email ?? ""}
    >
      <LastPathTracker />
      {/* Whoever uses the admin is team: their proposal views never count */}
      <OznaciInterno />
      <Zavihki />
      {children}
    </DashboardShell>
  );
}
