import { Mail, MapPin, Phone, User } from "lucide-react";

const STORITVE_LINKS = [
  { href: "/resitve", label: "Rešitve" },
  { href: "/reference", label: "Reference" },
  { href: "/cenik", label: "Cenik" },
  { href: "/blog", label: "Blog" },
];

const PODJETJE_LINKS = [
  { href: "/o-nas", label: "O nas" },
  { href: "/cenik#proces", label: "Kako delamo" },
  { href: "/partnerji", label: "Partnerski program" },
  { href: "/kontakt", label: "Kontakt" },
];

export default function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-white py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-sm font-bold text-white">
                K
              </span>
              <span className="text-lg font-semibold tracking-tight text-zinc-900">
                KodaTim<span className="text-accent">.si</span>
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-zinc-500">
              Razvojna agencija, ki vaš projekt pelje od ideje do delujoče
              rešitve.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Storitve</h3>
            <ul className="mt-4 flex flex-col gap-3">
              {STORITVE_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-zinc-500 transition hover:text-zinc-900"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Podjetje</h3>
            <ul className="mt-4 flex flex-col gap-3">
              {PODJETJE_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-zinc-500 transition hover:text-zinc-900"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs leading-relaxed text-zinc-400">
              Davčna številka: SI97304999
              <br />
              Matična številka: 9853707000
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Kontakt</h3>
            <ul className="mt-4 flex flex-col gap-3 text-sm text-zinc-500">
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                <span>
                  Kompletko d.o.o.
                  <br />
                  Parmova ulica 4
                  <br />
                  3212 Vojnik
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 flex-shrink-0 text-accent" />
                <a href="tel:+38640199051" className="hover:text-zinc-900">
                  +386 40 199 051
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 flex-shrink-0 text-accent" />
                <a
                  href="mailto:info@kodatim.si"
                  className="hover:text-zinc-900"
                >
                  info@kodatim.si
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <User className="h-4 w-4 flex-shrink-0 text-accent" />
                <span>Luka Komplet, direktor</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-zinc-200 pt-8 sm:flex-row">
          <p className="text-xs text-zinc-400">
            © {new Date().getFullYear()} Kompletko d.o.o. Vse pravice
            pridržane.
          </p>
        </div>
      </div>
    </footer>
  );
}
