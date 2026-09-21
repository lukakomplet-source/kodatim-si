import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search } from "lucide-react";
import { cn } from "@urvis/lib/utils";
import { useTranslation } from "react-i18next";
import { useSEO } from "@urvis/hooks/useSEO";

const img1 = "/urvis-assets/1_(1)_1785240910679.jpg";
const img2 = "/urvis-assets/1_1785240910679.jpg";
const img3 = "/urvis-assets/2_(1)_1785240910679.jpg";
const img4 = "/urvis-assets/2_1785240910677.jpg";
const img5 = "/urvis-assets/3_(1)_1785240910677.jpg";
const img6 = "/urvis-assets/3_1785240910678.jpg";
const img7 = "/urvis-assets/4_(1)_1785240910678.jpg";
const img8 = "/urvis-assets/4_1785240910678.jpg";
const img9 = "/urvis-assets/5_(1)_1785240910678.jpg";
const img10 = "/urvis-assets/5_1785240910678.jpg";
const img11 = "/urvis-assets/6_(1)_1785240910679.jpg";
const img12 = "/urvis-assets/6_1785240910679.jpg";
const img13 = "/urvis-assets/7_1785240910679.jpg";
const img14 = "/urvis-assets/8_1785240767158.jpg";
const img15 = "/urvis-assets/9_1785240767158.jpg";
const img16 = "/urvis-assets/10_1785240767158.jpg";

// category keys match sl.json gallery.* keys; labels are translated via t()
const ALL_IMAGES = [
  { src: img1,  cat: "razlak" },
  { src: img2,  cat: "oprema" },
  { src: img3,  cat: "razlak" },
  { src: img4,  cat: "oprema" },
  { src: img5,  cat: "razlak" },
  { src: img6,  cat: "oprema" },
  { src: img7,  cat: "razlak" },
  { src: img8,  cat: "oprema" },
  { src: img9,  cat: "ba" },
  { src: img10, cat: "oprema" },
  { src: img11, cat: "razlak" },
  { src: img12, cat: "oprema" },
  { src: img13, cat: "razlak" },
  { src: img14, cat: "oprema" },
  { src: img15, cat: "oprema" },
  { src: img16, cat: "ba" },
];

// "all" = show all; others match img.cat
const CATEGORY_KEYS = ["all", "razlak", "oprema", "ba"] as const;

export default function Galerija() {
  const { t } = useTranslation();
  const [activeCat, setActiveCat] = useState<string>("all");
  const [lightbox, setLightbox] = useState<string | null>(null);

  useSEO({
    title: `${t("gallery.title")} | URVIS Razlakiranje Kovin`,
    description: "Galerija del in opreme podjetja URVIS Razlakiranje Kovin D.O.O.",
    canonical: `${(typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis')}/galerija`,
  });

  const filtered = activeCat === "all" ? ALL_IMAGES : ALL_IMAGES.filter(img => img.cat === activeCat);

  return (
    <div className="flex flex-col min-h-screen bg-background">

      <div className="container mx-auto px-6 md:px-12 pt-24 md:pt-32 pb-10 md:pb-16">
        <h1 className="text-4xl sm:text-5xl md:text-6xl mb-8 md:mb-12 text-center text-foreground uppercase">{t("gallery.title")}</h1>

        {/* Filters */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:justify-center gap-3 mb-10 md:mb-16">
          {CATEGORY_KEYS.map(key => (
            <button
              key={key}
              onClick={() => setActiveCat(key)}
              className={cn(
                "px-4 py-3 sm:px-6 sm:py-2 border text-sm font-bold uppercase tracking-widest transition-all touch-manipulation",
                activeCat === key
                  ? "bg-primary text-white border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:border-primary hover:text-foreground"
              )}
            >
              {t(`gallery.${key}`)}
            </button>
          ))}
        </div>

        {/* Masonry-like Grid */}
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
          <AnimatePresence>
            {filtered.map((img, i) => (
              <motion.div
                key={img.src + i}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
                className="relative group overflow-hidden bg-muted break-inside-avoid cursor-pointer"
                onClick={() => setLightbox(img.src)}
              >
                <img src={img.src} alt={`URVIS ${t(`gallery.${img.cat}`)}`} className="w-full h-auto object-cover" />
                <div className="absolute inset-0 bg-[#12151D]/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Search className="text-white w-8 h-8" />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#0D0F14]/95 backdrop-blur flex items-center justify-center p-4 md:p-12"
            onClick={() => setLightbox(null)}
          >
            <button
              className="absolute top-6 right-6 text-white/70 hover:text-white"
              onClick={() => setLightbox(null)}
            >
              <X className="w-10 h-10" />
            </button>
            <img
              src={lightbox}
              alt="Fullscreen view"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
