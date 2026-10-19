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
  Mail,
  Activity,
  Factory,
  Workflow,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import DashboardShell from "@/components/dashboard/DashboardShell";
import LastPathTracker from "@/components/dashboard/LastPathTracker";
import { getCurrentUserPermissions, hasPermission } from "@/lib/permissions/require-permission";
import type { PermissionKey } from "@/lib/permissions/registry";

const ICON_CLASS = "h-5 w-5";

/**
 * Meni po korakih prodaje: najprej pregled (ekipa in »Danes zate«), nato
 * 1 najdi stranke → 2 stik → 3 prodaja → 4 izvedba → 5 partnerji, na koncu
 * nastavitve. Vrstni red je pot stranke, ne zgodovina nastanka razdelkov.
 */
const NAV_ITEMS: {
  href: string;
  label: string;
  icon: ReactNode;
  permission: PermissionKey | null;
  skupina?: string;
}[] = [
  {
    href: "/admin",
    label: "Pregled",
    icon: <LayoutDashboard className={ICON_CLASS} />,
    permission: "dashboard.view",
  },
  {
    skupina: "1 · Najdi stranke",
    href: "/admin/register-podjetij",
    label: "Register podjetij",
    icon: <Factory className={ICON_CLASS} />,
    permission: "crm.view",
  },
  {
    skupina: "1 · Najdi stranke",
    href: "/admin/lead-skrejp",
    label: "Lead skrejp",
    icon: <DatabaseZap className={ICON_CLASS} />,
    permission: "lead_intelligence.view",
  },
  {
    skupina: "1 · Najdi stranke",
    href: "/admin/lead-intelligence",
    label: "Baza leadov",
    icon: <Radar className={ICON_CLASS} />,
    permission: "lead_intelligence.view",
  },
  {
    skupina: "1 · Najdi stranke",
    href: "/admin/leads",
    label: "Leadi iz klepeta",
    icon: <Inbox className={ICON_CLASS} />,
    permission: "lead.view",
  },
  {
    skupina: "2 · Stik",
    href: "/admin/prodajna-ekipa",
    label: "Prodajna ekipa",
    icon: <Workflow className={ICON_CLASS} />,
    permission: "promotion.view",
  },
  {
    skupina: "2 · Stik",
    href: "/admin/e-posta",
    label: "E-pošta",
    icon: <Mail className={ICON_CLASS} />,
    permission: "promotion.view",
  },
  {
    skupina: "3 · Prodaja",
    href: "/admin/promocije",
    label: "Promocije",
    icon: <Target className={ICON_CLASS} />,
    permission: "promotion.view",
  },
  {
    skupina: "3 · Prodaja",
    href: "/admin/prodajni-coach",
    label: "Prodajni coach",
    icon: <GraduationCap className={ICON_CLASS} />,
    permission: "promotion.view",
  },
  {
    skupina: "4 · Izvedba",
    href: "/admin/demo-strani",
    label: "Spletne strani in aplikacije",
    icon: <Globe className={ICON_CLASS} />,
    permission: "crm.view",
  },
  {
    skupina: "5 · Partnerji",
    href: "/admin/partnerji",
    label: "Partnerji",
    icon: <Users className={ICON_CLASS} />,
    permission: "partner.view",
  },
  {
    skupina: "5 · Partnerji",
    href: "/admin/provizije",
    label: "Provizije",
    icon: <Percent className={ICON_CLASS} />,
    permission: "commission.view",
  },
  {
    skupina: "Nastavitve",
    href: "/admin/uporabniki",
    label: "Uporabniki",
    icon: <UserCog className={ICON_CLASS} />,
    permission: "users.manage",
  },
  {
    skupina: "Nastavitve",
    href: "/admin/vloge",
    label: "Vloge",
    icon: <ShieldCheck className={ICON_CLASS} />,
    permission: "roles.manage",
  },
  {
    skupina: "Nastavitve",
    href: "/admin/podjetja",
    label: "Podjetja",
    icon: <Building2 className={ICON_CLASS} />,
    permission: "crm.view",
  },
  {
    skupina: "Nastavitve",
    href: "/admin/nadzor",
    label: "Nadzor zbiralnikov",
    icon: <Activity className={ICON_CLASS} />,
    permission: "dashboard.view",
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
  ).map(({ href, label, icon, skupina }) => ({ href, label, icon, skupina }));

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
