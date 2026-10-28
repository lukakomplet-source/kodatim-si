"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  /**
   * Naslov skupine v meniju (npr. »1 · Najdi stranke«). Prikaže se nad prvo
   * postavko skupine; meni brez skupin izgleda kot prej.
   */
  skupina?: string;
  /** Druge poti, ki spadajo pod to točko (podstrani, zavihki), da je v meniju označena prava. */
  poti?: string[];
};

/** Seznam povezav z naslovi skupin — isti v stranskem in v mobilnem meniju. */
function NavSeznam({
  navItems,
  pathname,
  onIzbira,
}: {
  navItems: NavItem[];
  pathname: string;
  onIzbira?: () => void;
}) {
  // Pick the single longest (most specific) matching href as active — a
  // plain prefix check would keep e.g. "/admin" lit up on every nested
  // route, since "/admin/" prefixes all of them.
  const ujemanje = (item: NavItem) =>
    Math.max(
      -1,
      ...[item.href, ...(item.poti ?? [])]
        .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
        .map((href) => href.length),
    );
  const activeHref = navItems
    .map((item) => ({ href: item.href, d: ujemanje(item) }))
    .filter((x) => x.d >= 0)
    .sort((a, b) => b.d - a.d)[0]?.href;

  return (
    <>
      {navItems.map((item, i) => {
        const active = item.href === activeHref;
        const novaSkupina = item.skupina && item.skupina !== navItems[i - 1]?.skupina;
        return (
          <div key={item.href}>
            {novaSkupina ? (
              <p className="mb-1 mt-5 px-3.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                {item.skupina}
              </p>
            ) : null}
            <Link
              href={item.href}
              onClick={onIzbira}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] font-medium transition ${
                active
                  ? "bg-accent/10 text-accent"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          </div>
        );
      })}
    </>
  );
}

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
  // Mobilni meni; zapre se ob kliku na povezavo (NavSeznam → onIzbira).
  const [meniOdprt, setMeniOdprt] = useState(false);

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

        <nav className="mt-6 flex flex-1 flex-col gap-1">
          <NavSeznam navItems={navItems} pathname={pathname} />
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

      {/*
        min-w-0 is load-bearing: a flex item defaults to min-width:auto, so it
        refuses to shrink below its content. A wide table inside then stretched
        this whole column past the viewport and the PAGE scrolled sideways,
        carrying the cards and their buttons off-screen. With it, the column
        stays viewport-width and wide content scrolls inside its own box.
      */}
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 sm:hidden">
          <span className="text-base font-semibold text-zinc-900">
            KodaTim<span className="text-accent">.si</span>
          </span>
          <button
            type="button"
            onClick={() => setMeniOdprt(true)}
            aria-expanded={meniOdprt}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200"
          >
            <Menu className="h-4 w-4" />
            Meni
          </button>
        </header>

        {/* Mobilni meni: isti seznam po korakih kot ob strani. */}
        {meniOdprt ? (
          <div className="fixed inset-0 z-50 flex flex-col bg-white sm:hidden">
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
              <span className="text-base font-semibold text-zinc-900">{title}</span>
              <button
                type="button"
                onClick={() => setMeniOdprt(false)}
                className="flex items-center gap-1.5 text-sm font-medium text-zinc-700"
              >
                <X className="h-4 w-4" />
                Zapri
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-4 pb-6">
              <NavSeznam
                navItems={navItems}
                pathname={pathname}
                onIzbira={() => setMeniOdprt(false)}
              />
            </nav>
            <div className="border-t border-zinc-200 px-6 py-4">
              <p className="truncate text-sm text-zinc-500">{userEmail}</p>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-2 flex items-center gap-2 text-sm font-medium text-zinc-700"
              >
                <LogOut className="h-4 w-4" />
                Odjava
              </button>
            </div>
          </div>
        ) : null}
        <main className="px-6 py-10 sm:px-12 sm:py-14">{children}</main>
      </div>
    </div>
  );
}
