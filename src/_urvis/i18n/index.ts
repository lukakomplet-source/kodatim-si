import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import sl from './locales/sl.json';
import en from './locales/en.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import nl from './locales/nl.json';
import pl from './locales/pl.json';
import cs from './locales/cs.json';
import sk from './locales/sk.json';
import hu from './locales/hu.json';
import ro from './locales/ro.json';
import bg from './locales/bg.json';
import hr from './locales/hr.json';
import da from './locales/da.json';
import sv from './locales/sv.json';
import fi from './locales/fi.json';
import et from './locales/et.json';
import lv from './locales/lv.json';
import lt from './locales/lt.json';
import el from './locales/el.json';
import ga from './locales/ga.json';
import mt from './locales/mt.json';

const COUNTRY_TO_LANG: Record<string, string> = {
  SI: 'sl',
  AT: 'de', DE: 'de', LI: 'de', LU: 'de', CH: 'de',
  FR: 'fr', MC: 'fr',
  IT: 'it', SM: 'it', VA: 'it',
  ES: 'es',
  PT: 'pt',
  NL: 'nl', BE: 'nl',
  PL: 'pl',
  CZ: 'cs',
  SK: 'sk',
  HU: 'hu',
  RO: 'ro',
  BG: 'bg',
  HR: 'hr',
  DK: 'da',
  SE: 'sv',
  FI: 'fi',
  EE: 'et',
  LV: 'lv',
  LT: 'lt',
  GR: 'el', CY: 'el',
  IE: 'en', GB: 'en', US: 'en', AU: 'en', CA: 'en',
  MT: 'mt',
};

export const SUPPORTED_LANGS = [
  { code: 'sl', name: 'Slovenščina', flag: '🇸🇮' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
  { code: 'cs', name: 'Čeština', flag: '🇨🇿' },
  { code: 'sk', name: 'Slovenčina', flag: '🇸🇰' },
  { code: 'hu', name: 'Magyar', flag: '🇭🇺' },
  { code: 'ro', name: 'Română', flag: '🇷🇴' },
  { code: 'bg', name: 'Български', flag: '🇧🇬' },
  { code: 'hr', name: 'Hrvatski', flag: '🇭🇷' },
  { code: 'da', name: 'Dansk', flag: '🇩🇰' },
  { code: 'sv', name: 'Svenska', flag: '🇸🇪' },
  { code: 'fi', name: 'Suomi', flag: '🇫🇮' },
  { code: 'et', name: 'Eesti', flag: '🇪🇪' },
  { code: 'lv', name: 'Latviešu', flag: '🇱🇻' },
  { code: 'lt', name: 'Lietuvių', flag: '🇱🇹' },
  { code: 'el', name: 'Ελληνικά', flag: '🇬🇷' },
  { code: 'ga', name: 'Gaeilge', flag: '🇮🇪' },
  { code: 'mt', name: 'Malti', flag: '🇲🇹' },
];

async function detectLang(): Promise<string> {
  const saved = localStorage.getItem('urvis_lang');
  if (saved && SUPPORTED_LANGS.find(l => l.code === saved)) return saved;
  try {
    const res = await fetch('https://ipapi.co/json/', {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json();
    const lang = COUNTRY_TO_LANG[data.country_code as string];
    if (lang) return lang;
  } catch {
    // fallback to browser
  }
  const browser = navigator.language.split('-')[0];
  return SUPPORTED_LANGS.find(l => l.code === browser) ? browser : 'sl';
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      sl: { translation: sl },
      en: { translation: en },
      de: { translation: de },
      fr: { translation: fr },
      it: { translation: it },
      es: { translation: es },
      pt: { translation: pt },
      nl: { translation: nl },
      pl: { translation: pl },
      cs: { translation: cs },
      sk: { translation: sk },
      hu: { translation: hu },
      ro: { translation: ro },
      bg: { translation: bg },
      hr: { translation: hr },
      da: { translation: da },
      sv: { translation: sv },
      fi: { translation: fi },
      et: { translation: et },
      lv: { translation: lv },
      lt: { translation: lt },
      el: { translation: el },
      ga: { translation: ga },
      mt: { translation: mt },
    },
    lng: 'sl',
    fallbackLng: 'sl',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: 'urvis_lang',
      caches: ['localStorage'],
    },
  });

// Async IP detection — runs after initial render, browser only (this module
// also loads during Next.js SSR, where localStorage/navigator don't exist).
if (typeof window !== 'undefined') {
  detectLang().then(lang => {
    if (lang !== i18n.language) {
      i18n.changeLanguage(lang);
      localStorage.setItem('urvis_lang', lang);
    }
  });
}

export function setLang(code: string) {
  i18n.changeLanguage(code);
  localStorage.setItem('urvis_lang', code);
}

export default i18n;
