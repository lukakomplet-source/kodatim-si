"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Database, LineChart, Sparkles, TerminalSquare } from "lucide-react";

/**
 * The tab bar, and the one place that decides who sees the development centre.
 *
 * Admin status is asked of the server rather than read from a cookie here, so
 * the pages themselves stay cacheable — the same trick the research panel uses.
 * A visitor simply never receives the admin tabs; the pages behind them check
 * the role again, because hiding a link is presentation, not protection.
 */

const JAVNI = [
  { href: "/avtonet", label: "Moja spremljanja", icon: Bell },
  { href: "/avtonet/analiza", label: "Analiza trga", icon: LineChart },
];

const ADMIN = [
  { href: "/avtonet/baza", label: "Baza oglasov", icon: Database },
  { href: "/avtonet/pregled", label: "Research console", icon: TerminalSquare },
  { href: "/avtonet/urejanje", label: "AI urejanje", icon: Sparkles },
];

export function AvtonetNav() {
  const pathname = usePathname();
  const [jeAdmin, setJeAdmin] = useState(false);

  useEffect(() => {
    let ustavljeno = false;
    void (async () => {
      try {
        const res = await fetch("/api/avtonet/raziskava", { cache: "no-store" });
        if (!res.ok || ustavljeno) return;
        const data = (await res.json()) as { jeAdmin?: boolean };
        if (!ustavljeno) setJeAdmin(data.jeAdmin === true);
      } catch {
        // A failed probe means "no admin tabs", which is the safe default.
      }
    })();
    return () => {
      ustavljeno = true;
    };
  }, []);

  const items = jeAdmin ? [...JAVNI, ...ADMIN] : JAVNI;

  // The longest matching href wins, so "/avtonet" does not stay lit on every
  // nested route — the same rule the admin sidebar uses.
  const aktiven = items
    .map((i) => i.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === aktiven;
        return (
          <Link
            key={href}
            href={href}
            className={`flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "border-accent text-accent"
                : "border-transparent text-zinc-500 hover:border-zinc-200 hover:text-zinc-900"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
