import { useState, useEffect } from "react";
import { Link, useRoute } from "wouter";
import { Menu, X } from "lucide-react";
import { useTranslation } from "react-i18next";
const logoImg = "/urvis-assets/urvis_logo_transparent.png";
import { cn } from "@urvis/lib/utils";
import { Button } from "@urvis/components/ui/button";
import { LanguageSwitcher } from "@urvis/components/LanguageSwitcher";

function useNavLinks() {
  const { t } = useTranslation();
  return [
    { href: "/", label: t("nav.home") },
    { href: "/o-podjetju", label: t("nav.about") },
    { href: "/tehnologije", label: t("nav.technologies") },
    { href: "/razlakiranje", label: t("nav.razlakiranje") },
    { href: "/stabilizacija", label: t("nav.stabilizacija") },
    { href: "/galerija", label: t("nav.gallery") },
    { href: "/partnerji", label: t("nav.partners") },
    { href: "/blog", label: "Blog" },
  ];
}

export function Navbar() {
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isHome] = useRoute("/");
  const navLinks = useNavLinks();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 60);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  const transparent = isHome && !scrolled;

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b",
          transparent
            ? "bg-transparent border-transparent py-4 md:py-5"
            : scrolled
            ? "bg-[#12151D] border-white/10 py-3 shadow-lg"
            : "bg-[#12151D]/90 backdrop-blur-md border-white/10 py-4 md:py-5"
        )}
      >
        <div className="container mx-auto px-5 md:px-12 flex items-center justify-between">
          <Link href="/">
            <img
              src={logoImg}
              alt="URVIS Logo"
              className="h-10 md:h-16 object-contain hover:opacity-80 transition-opacity"
            />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-6">
            {navLinks.map((link) => (
              <NavLink key={link.href} href={link.href} scrolled={scrolled}>
                {link.label}
              </NavLink>
            ))}
            <LanguageSwitcher />
            <Link href="/kontakt">
              <Button className="bg-primary hover:bg-primary/90 text-white font-medium uppercase tracking-wider h-11 px-6 rounded-none transition-transform hover:scale-[1.02]">
                {t("nav.contact")}
              </Button>
            </Link>
          </nav>

          {/* Mobile right side */}
          <div className="lg:hidden flex items-center gap-3">
            <LanguageSwitcher />
            <button
              className="text-white p-2.5 -mr-1 touch-manipulation"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Odpri meni"
            >
              <Menu className="w-7 h-7" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay — rendered as sibling to header so z-index is never clipped */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[200] flex flex-col animate-in fade-in duration-200"
          style={{ backgroundColor: "#12151D" }}
        >
          {/* Overlay header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <img src={logoImg} alt="URVIS Logo" className="h-9 object-contain" />
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="text-white p-2.5 -mr-1 touch-manipulation"
              aria-label="Zapri meni"
            >
              <X className="w-7 h-7" />
            </button>
          </div>

          {/* Nav links */}
          <nav className="flex flex-col px-5 pt-6 pb-4 gap-1 overflow-y-auto flex-1">
            {navLinks.map((link) => (
              <MobileNavLink
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </MobileNavLink>
            ))}
          </nav>

          {/* Bottom bar: CTA */}
          <div className="px-5 pb-8 pt-4 border-t border-white/10 shrink-0">
            <Link href="/kontakt" onClick={() => setMobileMenuOpen(false)}>
              <Button className="w-full bg-primary hover:bg-primary/90 text-white rounded-none h-14 text-base uppercase tracking-wider">
                {t("hero.cta1")}
              </Button>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

function NavLink({
  href,
  children,
  scrolled,
}: {
  href: string;
  children: React.ReactNode;
  scrolled: boolean;
}) {
  const [isActive] = useRoute(href);

  return (
    <Link
      href={href}
      className={cn(
        "relative text-sm font-semibold uppercase tracking-widest transition-colors py-2 group",
        isActive
          ? "text-primary"
          : scrolled
          ? "text-white/80 hover:text-white"
          : "text-white/90 hover:text-white"
      )}
    >
      {children}
      <span
        className={cn(
          "absolute -bottom-1 left-0 h-[2px] bg-primary transition-all duration-300",
          isActive ? "w-full" : "w-0 group-hover:w-full"
        )}
      />
    </Link>
  );
}

function MobileNavLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  const [isActive] = useRoute(href);

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center min-h-[52px] text-2xl font-display uppercase tracking-wider transition-colors border-l-2 pl-4 touch-manipulation",
        isActive
          ? "text-primary border-primary"
          : "text-white/80 border-transparent hover:text-white hover:border-white/20"
      )}
    >
      {children}
    </Link>
  );
}
