// Utility functions for the app

/**
 * Sanitize input to only allow integers
 */
export function sanitizeInt(text: string): string {
  return text.replace(/[^0-9]/g, '');
}

/**
 * Sanitize input to only allow decimal numbers
 */
export function sanitizeDecimal(text: string): string {
  return text.replace(/[^0-9.]/g, '');
}

/**
 * Format currency with symbol
 */
export function formatCurrency(amount: number, symbol: string = '$'): string {
  return `${symbol}${amount.toFixed(2)}`;
}

/**
 * Parse integer safely, return 0 if invalid
 */
export function parseIntSafe(value: string, defaultValue: number = 0): number {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse float safely, return 0 if invalid
 */
export function parseFloatSafe(value: string, defaultValue: number = 0): number {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Validate quantity input
 */
export function isValidQuantity(value: string): boolean {
  const num = parseInt(value, 10);
  return !isNaN(num) && num > 0;
}

/**
 * Validate price input
 */
export function isValidPrice(value: string): boolean {
  const num = parseFloat(value);
  return !isNaN(num) && num >= 0;
}
