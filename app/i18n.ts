// app/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as RNLocalize from 'react-native-localize';
import en from './locales/en.json';
import es from './locales/es.json';

const locales = RNLocalize.getLocales();
const language = locales[0]?.languageCode ?? 'en';

i18n
  .use(initReactI18next)
  .init({
    lng: language,
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
