import { redirect } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  Percent,
  Users,
  Inbox,
  Radar,
  Target,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import DashboardShell from "@/components/dashboard/DashboardShell";

const ICON_CLASS = "h-5 w-5";

const NAV_ITEMS = [
  {
    href: "/admin",
    label: "Pregled",
    icon: <LayoutDashboard className={ICON_CLASS} />,
  },
  { href: "/admin/leads", label: "Leadi", icon: <Inbox className={ICON_CLASS} /> },
  {
    href: "/admin/lead-intelligence",
    label: "Lead Intelligence",
    icon: <Radar className={ICON_CLASS} />,
  },
  {
    href: "/admin/promocije",
    label: "Promocije",
    icon: <Target className={ICON_CLASS} />,
  },
  {
    href: "/admin/partnerji",
    label: "Partnerji",
    icon: <Users className={ICON_CLASS} />,
  },
  {
    href: "/admin/provizije",
    label: "Provizije",
    icon: <Percent className={ICON_CLASS} />,
  },
  {
    href: "/admin/podjetja",
    label: "Podjetja",
    icon: <Building2 className={ICON_CLASS} />,
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

  if (profile?.role !== "admin") {
    redirect("/partner");
  }

  return (
    <DashboardShell
      title="Admin"
      navItems={NAV_ITEMS}
      userEmail={user.email ?? ""}
    >
      {children}
    </DashboardShell>
  );
}
