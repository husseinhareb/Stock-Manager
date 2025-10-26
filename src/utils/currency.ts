// Currency utilities

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD' | 'CHF' | 'CNY' | 'BRL';

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: 'C$',
  AUD: 'A$',
  CHF: 'CHF',
  CNY: '¥',
  BRL: 'R$',
};

export const CURRENCY_INFO = [
  { code: 'USD' as CurrencyCode, symbol: '$', labelKey: 'settings.currencyOptions.usd' },
  { code: 'EUR' as CurrencyCode, symbol: '€', labelKey: 'settings.currencyOptions.eur' },
  { code: 'GBP' as CurrencyCode, symbol: '£', labelKey: 'settings.currencyOptions.gbp' },
  { code: 'JPY' as CurrencyCode, symbol: '¥', labelKey: 'settings.currencyOptions.jpy' },
  { code: 'CAD' as CurrencyCode, symbol: 'C$', labelKey: 'settings.currencyOptions.cad' },
  { code: 'AUD' as CurrencyCode, symbol: 'A$', labelKey: 'settings.currencyOptions.aud' },
  { code: 'CHF' as CurrencyCode, symbol: 'CHF', labelKey: 'settings.currencyOptions.chf' },
  { code: 'CNY' as CurrencyCode, symbol: '¥', labelKey: 'settings.currencyOptions.cny' },
  { code: 'BRL' as CurrencyCode, symbol: 'R$', labelKey: 'settings.currencyOptions.brl' },
];

/**
 * Get currency symbol for a given currency code
 */
export function getCurrencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code as CurrencyCode] ?? '$';
}

/**
 * Format amount with currency
 */
export function formatWithCurrency(amount: number, code: string): string {
  const symbol = getCurrencySymbol(code);
  return `${symbol}${amount.toFixed(2)}`;
}
