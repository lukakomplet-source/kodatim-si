import type { Metadata } from "next";

/**
 * Home for client demo sites parked on our domain.
 *
 * `(demo)` is a route group: it shapes the folder, not the URL, so
 * `src/app/(demo)/keramika/page.tsx` is served at `kodatim.si/keramika` —
 * exactly the short link a client is meant to open.
 *
 * The one rule that must hold for every demo: NOINDEX. A client's draft site
 * sitting on the agency domain would otherwise be crawled, compete with the
 * agency's own pages, and — worse — could be found by that client's
 * competitors before the site is even live. Declaring it here means a new demo
 * inherits the protection instead of relying on someone remembering it.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
