export const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

export const THREE_DECIMAL_CURRENCIES = new Set([
  'bhd', 'jod', 'kwd', 'omr', 'tnd'
]);

export function convertToSubunit(amount: number, currency: string): number {
  const code = currency.toLowerCase();
  
  if (ZERO_DECIMAL_CURRENCIES.has(code)) {
    return Math.round(amount);
  }
  
  if (THREE_DECIMAL_CURRENCIES.has(code)) {
    return Math.round(amount * 1000);
  }
  
  return Math.round(amount * 100);
}
