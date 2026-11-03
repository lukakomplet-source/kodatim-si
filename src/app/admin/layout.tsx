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
import { RAZDELKI, type Razdelek } from "@/lib/admin-meni";
import type { RoleKey } from "@/lib/permissions/registry";
import { Zavihki } from "./Zavihki";

const ICON_CLASS = "h-5 w-5";

/** RBAC roles that belong to the partner portal, never to the admin. */
const PORTALNE_VLOGE: RoleKey[] = ["partner", "referral", "user"];

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

  const vidi = (p: Razdelek["permission"]) =>
    p === null || (Array.isArray(p) ? p.some((k) => hasPermission(perms, k)) : hasPermission(perms, p));

  const visibleNavItems = RAZDELKI.filter(
    (item) => isLegacyAdmin || vidi(item.permission)
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
