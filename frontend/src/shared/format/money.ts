/**
 * Money as returned by the API (Technical Specs 1.6): the amount is a decimal *string*,
 * never a JSON number, so it is never turned into a float on the client.
 */
export interface Money {
  amount: string;
  currency: string;
}

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

/** Formats money with `Intl` (en-CA → `$117.42`, fr-CA → `117,42 $`) without parsing to float. */
export function formatMoney(money: Money, locale: string): string {
  if (!DECIMAL_PATTERN.test(money.amount)) {
    throw new Error(`Invalid money amount: ${money.amount}`);
  }
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency });
  // Intl.NumberFormat accepts decimal strings (ES2023), keeping full precision.
  return formatter.format(money.amount as `${number}`);
}
