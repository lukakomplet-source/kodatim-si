import { Link } from "wouter";
import { useTranslation } from "react-i18next";
const logoImg = "/urvis-assets/urvis_logo_transparent.png";

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="bg-[#12151D] text-white/70 pt-20 pb-10 border-t border-white/5">
      <div className="container mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8 mb-16">

        {/* Brand */}
        <div>
          <Link href="/">
            <img src={logoImg} alt="URVIS Logo" className="h-12 mb-6" />
          </Link>
          <p className="text-sm leading-relaxed mb-6">{t("footer.desc")}</p>
          <div className="text-sm font-semibold text-white/90">{t("footer.exp")}</div>
        </div>

        {/* Storitve */}
        <div>
          <h4 className="text-white font-display uppercase tracking-widest text-lg mb-6 flex items-center gap-2">
            <span className="w-4 h-[2px] bg-primary inline-block"></span>
            {t("footer.services")}
          </h4>
          <ul className="space-y-3">
            <li>
              <Link href="/razlakiranje" className="hover:text-primary transition-colors inline-block">
                {t("footer.s1")}
              </Link>
            </li>
            <li>
              <Link href="/razlakiranje" className="hover:text-primary transition-colors inline-block">
                {t("footer.s2")}
              </Link>
            </li>
            <li>
              <Link href="/stabilizacija" className="hover:text-primary transition-colors inline-block">
                {t("footer.s3")}
              </Link>
            </li>
            <li>
              <Link href="/tehnologije" className="hover:text-primary transition-colors inline-block">
                {t("footer.s4")}
              </Link>
            </li>
          </ul>
        </div>

        {/* Kontakt */}
        <div>
          <h4 className="text-white font-display uppercase tracking-widest text-lg mb-6 flex items-center gap-2">
            <span className="w-4 h-[2px] bg-primary inline-block"></span>
            {t("footer.contact")}
          </h4>
          <address className="not-italic space-y-4 text-sm">
            <div>
              <strong className="block text-white/90 font-medium mb-1">{t("footer.head_office")}:</strong>
              Laze pri Dramljah 14 A<br />
              3222 Dramlje
            </div>
            <div>
              <strong className="block text-white/90 font-medium mb-1">{t("footer.branch")}:</strong>
              P.E. Eko Peč<br />
              Šentjur
            </div>
            <div className="pt-2">
              <a href="mailto:ekopec@urvis.si" className="text-white hover:text-primary transition-colors block mb-1">
                ekopec@urvis.si
              </a>
              <a href="tel:+38670638194" className="text-white hover:text-primary transition-colors block">
                +386 70 638 194
              </a>
            </div>
          </address>
        </div>

        {/* Navigacija */}
        <div>
          <h4 className="text-white font-display uppercase tracking-widest text-lg mb-6 flex items-center gap-2">
            <span className="w-4 h-[2px] bg-primary inline-block"></span>
            {t("footer.nav_title")}
          </h4>
          <ul className="space-y-3">
            <li><Link href="/o-podjetju" className="hover:text-white transition-colors">{t("footer.n1")}</Link></li>
            <li><Link href="/galerija" className="hover:text-white transition-colors">{t("footer.n2")}</Link></li>
            <li><Link href="/partnerji" className="hover:text-white transition-colors">{t("footer.n3")}</Link></li>
            <li><Link href="/kontakt" className="hover:text-white transition-colors">{t("footer.n4")}</Link></li>
            <li><Link href="/blog" className="hover:text-white transition-colors">Blog</Link></li>
          </ul>
        </div>

      </div>

      <div className="container mx-auto px-6 md:px-12 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-medium uppercase tracking-wider">
        <p>&copy; {new Date().getFullYear()} URVIS Razlakiranje Kovin D.O.O.</p>
        <p>{t("footer.rights")}</p>
      </div>
    </footer>
  );
}
