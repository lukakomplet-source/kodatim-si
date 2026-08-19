"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Calculator,
  Database,
  Lightbulb,
  LineChart,
  Sparkles,
  Store,
  PackageCheck,
  Target,
  TerminalSquare,
  TrendingUp,
  UserCog,
} from "lucide-react";

/**
 * The tab bar, and the one place that decides who sees what.
 *
 * Three audiences. A visitor gets the public analysis — that is the demo you can
 * show a prospect. A signed-in user additionally gets their own watches and
 * settings. An admin gets the development surface on top.
 *
 * Asked of the server rather than read from a cookie here, so the pages stay
 * cacheable. Hiding a link is presentation, not protection: every page behind
 * these tabs checks the role again for itself.
 */

const JAVNO = [
  { href: "/avtonet/analiza", label: "Analiza trga", icon: LineChart },
  { href: "/avtonet/trg", label: "Trg", icon: TrendingUp },
];

// Nastavitve is deliberately absent: account controls sit top right in the
// header, so the tabs hold only the places you actually work in.
//
// Oceni vozilo leads, because it is the question the product exists to answer
// ("what is this car worth here") — the watches and the market analysis are the
// data underneath it.
const UPORABNIK = [
  { href: "/avtonet/cenilnik", label: "Oceni vozilo", icon: Calculator },
  { href: "/avtonet/posli", label: "Posli", icon: Target },
  { href: "/avtonet/prodani", label: "Prodani", icon: PackageCheck },
  { href: "/avtonet", label: "Moja spremljanja", icon: Bell },
];

const UPORABNIK_ZA_JAVNIM = [{ href: "/avtonet/trgovci", label: "Trgovci", icon: Store }];

/** Same page, different name: for a user it is a suggestion box, for an admin an editor. */
const PREDLOGI = { href: "/avtonet/urejanje", label: "Predlogi", icon: Lightbulb };

const ADMIN = [
  { href: "/avtonet/baza", label: "Baza oglasov", icon: Database },
  { href: "/avtonet/pregled", label: "Research console", icon: TerminalSquare },
  { href: "/avtonet/urejanje", label: "AI urejanje", icon: Sparkles },
  { href: "/avtonet/uporabniki", label: "Uporabniki", icon: UserCog },
];

export function AvtonetNav() {
  const pathname = usePathname();
  const [dostop, setDostop] = useState<{ jeUporabnik: boolean; jeAdmin: boolean }>({
    jeUporabnik: false,
    jeAdmin: false,
  });

  useEffect(() => {
    let ustavljeno = false;
    void (async () => {
      try {
        const res = await fetch("/api/avtonet/dostop", { cache: "no-store" });
        if (!res.ok || ustavljeno) return;
        const data = (await res.json()) as { jeUporabnik?: boolean; jeAdmin?: boolean };
        if (!ustavljeno) {
          setDostop({ jeUporabnik: data.jeUporabnik === true, jeAdmin: data.jeAdmin === true });
        }
      } catch {
        // A failed probe means the public tabs only, which is the safe default.
      }
    })();
    return () => {
      ustavljeno = true;
    };
  }, []);

  const items = [
    ...(dostop.jeUporabnik ? UPORABNIK : []),
    ...JAVNO,
    ...(dostop.jeUporabnik ? UPORABNIK_ZA_JAVNIM : []),
    ...(dostop.jeUporabnik && !dostop.jeAdmin ? [PREDLOGI] : []),
    ...(dostop.jeAdmin ? ADMIN : []),
  ];

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
