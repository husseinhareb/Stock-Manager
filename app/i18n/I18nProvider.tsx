import React, { createContext, useContext, useState } from 'react';
import I18n, { setLocale as setI18nLocale } from './index';

interface I18nContext {
  locale: string;
  setLocale: (l: string) => void;
}

const I18nContext = createContext<I18nContext | null>(null);

export const I18nProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [locale, setLocale] = useState<string>(I18n.locale);

  const changeLocale = (newLocale: string) => {
    setI18nLocale(newLocale);
    setLocale(newLocale);
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale: changeLocale }}>
      {children}
    </I18nContext.Provider>
  );
};

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
