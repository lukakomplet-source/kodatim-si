import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  Percent,
  Users,
  UserCog,
  ShieldCheck,
  Inbox,
  Radar,
  Target,
  DatabaseZap,
  GraduationCap,
  Globe,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import DashboardShell from "@/components/dashboard/DashboardShell";
import LastPathTracker from "@/components/dashboard/LastPathTracker";
import { getCurrentUserPermissions, hasPermission } from "@/lib/permissions/require-permission";
import type { PermissionKey } from "@/lib/permissions/registry";

const ICON_CLASS = "h-5 w-5";

const NAV_ITEMS: {
  href: string;
  label: string;
  icon: ReactNode;
  permission: PermissionKey | null;
}[] = [
  {
    href: "/admin",
    label: "Pregled",
    icon: <LayoutDashboard className={ICON_CLASS} />,
    permission: "dashboard.view",
  },
  {
    href: "/admin/leads",
    label: "Leadi",
    icon: <Inbox className={ICON_CLASS} />,
    permission: "lead.view",
  },
  {
    href: "/admin/lead-intelligence",
    label: "Lead Intelligence",
    icon: <Radar className={ICON_CLASS} />,
    permission: "lead_intelligence.view",
  },
  {
    href: "/admin/lead-skrejp",
    label: "Lead skrejp",
    icon: <DatabaseZap className={ICON_CLASS} />,
    permission: "lead_intelligence.view",
  },
  {
    href: "/admin/promocije",
    label: "Promocije",
    icon: <Target className={ICON_CLASS} />,
    permission: "promotion.view",
  },
  {
    href: "/admin/prodajni-coach",
    label: "Prodajni coach",
    icon: <GraduationCap className={ICON_CLASS} />,
    permission: "promotion.view",
  },
  {
    href: "/admin/partnerji",
    label: "Partnerji",
    icon: <Users className={ICON_CLASS} />,
    permission: "partner.view",
  },
  {
    href: "/admin/provizije",
    label: "Provizije",
    icon: <Percent className={ICON_CLASS} />,
    permission: "commission.view",
  },
  {
    href: "/admin/podjetja",
    label: "Podjetja",
    icon: <Building2 className={ICON_CLASS} />,
    permission: "crm.view",
  },
  {
    href: "/admin/uporabniki",
    label: "Uporabniki",
    icon: <UserCog className={ICON_CLASS} />,
    permission: "users.manage",
  },
  {
    href: "/admin/vloge",
    label: "Vloge",
    icon: <ShieldCheck className={ICON_CLASS} />,
    permission: "roles.manage",
  },
  {
    href: "/admin/demo-strani",
    label: "Spletne strani in aplikacije",
    icon: <Globe className={ICON_CLASS} />,
    permission: "crm.view",
  },
];

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

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => item.permission === null || isLegacyAdmin || hasPermission(perms, item.permission)
  ).map(({ href, label, icon }) => ({ href, label, icon }));

  return (
    <DashboardShell
      title="Admin"
      navItems={visibleNavItems}
      userEmail={user.email ?? ""}
    >
      <LastPathTracker />
      {children}
    </DashboardShell>
  );
}
