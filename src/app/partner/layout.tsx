import { redirect } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import DashboardShell from "@/components/dashboard/DashboardShell";

const NAV_ITEMS = [
  {
    href: "/partner",
    label: "Pregled",
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
];

export default async function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/prijava?redirect=/partner");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "partner") {
    redirect("/admin");
  }

  return (
    <DashboardShell
      title="Partner"
      navItems={NAV_ITEMS}
      userEmail={user.email ?? ""}
    >
      {children}
    </DashboardShell>
  );
}
