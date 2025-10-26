// i18n configuration
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './src/locales/ar.json';
import en from './src/locales/en.json';
import es from './src/locales/es.json';
import fr from './src/locales/fr.json';

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
