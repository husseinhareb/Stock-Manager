import * as Localization from 'expo-localization';
import I18n from 'i18n-js';

// load your JSON translations
import en from './en.json';
import es from './es.json';
// import fr from './fr.json';

I18n.translations = { en, es /*, fr */ };
I18n.fallbacks = true;

// expo‑localization v14+
I18n.locale = Localization.locales[0]?.languageTag ?? 'en';

// helper
export function t(scope: string, config?: I18n.TranslateOptions) {
  return I18n.t(scope, config);
}
// change at runtime
export function setLocale(newLocale: string) {
  I18n.locale = newLocale;
}

export default I18n;
