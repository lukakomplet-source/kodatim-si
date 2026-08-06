"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Remembers the admin screen you were last on, so returning — from a phone,
 * the next morning, whatever — can offer to pick it back up.
 *
 * Deliberately not a redirect: being thrown somewhere you did not ask for is
 * worse than one click. The overview page offers it as a link instead.
 */
export default function LastPathTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // The overview itself is where the offer is shown; recording it would make
    // the card point at the page you are already on.
    if (!pathname || pathname === "/admin") return;

    const timer = setTimeout(() => {
      void fetch("/api/admin/ui-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "last-path", value: { path: pathname, at: Date.now() } }),
      }).catch(() => {
        // Not worth surfacing — this is a convenience, not the work itself.
      });
    }, 1200);

    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
