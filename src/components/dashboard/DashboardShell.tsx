"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

export default function DashboardShell({
  title,
  navItems,
  userEmail,
  children,
}: {
  title: string;
  navItems: NavItem[];
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/prijava");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-[#fbfbfd]">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-zinc-200 bg-white px-5 py-8 sm:flex">
        <Link href="/" className="flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-base font-bold text-white">
            K
          </span>
          <span className="text-lg font-semibold tracking-tight text-zinc-900">
            KodaTim<span className="text-accent">.si</span>
          </span>
        </Link>
        <p className="mt-2 px-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
          {title}
        </p>

        <nav className="mt-8 flex flex-1 flex-col gap-1.5">
          {navItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-medium transition ${
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-zinc-200 pt-5">
          <p className="truncate px-2 text-sm text-zinc-500">{userEmail}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-2 flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
          >
            <LogOut className="h-5 w-5" />
            Odjava
          </button>
        </div>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 sm:hidden">
          <span className="text-base font-semibold text-zinc-900">
            KodaTim<span className="text-accent">.si</span>
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm font-medium text-zinc-600"
          >
            Odjava
          </button>
        </header>
        <main className="px-6 py-10 sm:px-12 sm:py-14">{children}</main>
      </div>
    </div>
  );
}
