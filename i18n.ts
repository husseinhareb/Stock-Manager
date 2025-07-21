// app/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import en from './app/locales/en.json';
import es from './app/locales/es.json';
import ar from './app/locales/ar.json';
import fr from './app/locales/fr.json';

const locales = Localization.getLocales();
const language = locales[0]?.languageCode ?? 'en';

i18n
  .use(initReactI18next)
  .init({
    lng: language,
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      es: { translation: es },
      ar: { translation: ar },
      fr: { translation: fr },

    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
