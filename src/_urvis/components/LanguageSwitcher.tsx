import { useState, useRef, useEffect } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS } from '@urvis/i18n';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const currentLang = SUPPORTED_LANGS.find(l => l.code === i18n.language) ?? SUPPORTED_LANGS[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={t('lang_select')}
        className="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors text-sm font-semibold uppercase tracking-widest py-2 px-2"
      >
        <Globe className="w-4 h-4" />
        <span className="hidden sm:inline">{currentLang.code.toUpperCase()}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-[#12151D] border border-white/10 shadow-2xl z-50 max-h-72 overflow-y-auto">
          <div className="grid grid-cols-2">
            {SUPPORTED_LANGS.map(lang => (
              <button
                key={lang.code}
                onClick={() => {
                  i18n.changeLanguage(lang.code);
                  localStorage.setItem('urvis_lang', lang.code);
                  setOpen(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs text-left hover:bg-white/5 transition-colors ${
                  i18n.language === lang.code ? 'text-primary font-bold' : 'text-white/60'
                }`}
              >
                <span className="w-3 shrink-0">
                  {i18n.language === lang.code && <Check className="w-3 h-3" />}
                </span>
                <span className="truncate">{lang.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
