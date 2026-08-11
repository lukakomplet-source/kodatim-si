import { Car } from "lucide-react";
import { AvtonetNav } from "./AvtonetNav";
import { UporabnikMeni } from "./UporabnikMeni";

/**
 * The SBN Auto shell: brand, navigation, and the frame every screen sits in.
 *
 * Two audiences share these pages and the navigation is what separates them. A
 * client opening the demo sees the product — Moja spremljanja and Analiza trga.
 * An admin additionally sees the development centre, where the scraper's live
 * log and the AI editor live. That split is deliberate: a person looking for a
 * car has no use for page counters and checkpoints, and putting them on the
 * front page made the product look like a scraper with a UI bolted on.
 */

export const metadata = { title: "SBN Auto — spremljanje trga vozil" };

export default function AvtonetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fbfbfd]">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white">
                <Car className="h-5 w-5" />
              </span>
              <div className="leading-tight">
                <p className="text-[15px] font-semibold text-zinc-900">SBN Auto</p>
                <p className="text-[11px] uppercase tracking-wide text-zinc-400">Slovenski trg vozil</p>
              </div>
            </div>

            {/* Account controls live here, not in the tab strip: they are things
                you reach for once, not places you work in. */}
            <UporabnikMeni />
          </div>
          <AvtonetNav />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-10">{children}</div>

      <footer className="mx-auto max-w-6xl px-5 pb-10 text-xs text-zinc-400 sm:px-6">
        Podatki so zbrani z Avto.net ob upoštevanju njihovega <code>robots.txt</code> (10 s med zahtevki).
        Demo pripravil KodaTim.si.
      </footer>
    </div>
  );
}
