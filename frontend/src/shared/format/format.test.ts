import { describe, expect, it } from 'vitest';

import { formatInstant, formatStayDate } from './dates';
import { formatMoney } from './money';

// Intl may use narrow no-break spaces; normalize them for readable assertions.
const normalizeSpaces = (value: string) => value.replace(/[\u00a0\u202f]/g, ' ');

describe('formatMoney (Technical Specs 1.6, 4.1)', () => {
  it('formats CAD in en-CA and fr-CA', () => {
    const money = { amount: '117.42', currency: 'CAD' };
    expect(formatMoney(money, 'en-CA')).toBe('$117.42');
    expect(normalizeSpaces(formatMoney(money, 'fr-CA'))).toBe('117,42 $');
  });

  it('keeps decimal precision without float conversion', () => {
    expect(formatMoney({ amount: '0.30', currency: 'CAD' }, 'en-CA')).toBe('$0.30');
    expect(formatMoney({ amount: '-14.42', currency: 'CAD' }, 'en-CA')).toBe('-$14.42');
  });

  it('rejects an amount that is not a decimal string', () => {
    expect(() => formatMoney({ amount: '1e3', currency: 'CAD' }, 'en-CA')).toThrow();
    expect(() => formatMoney({ amount: 'abc', currency: 'CAD' }, 'en-CA')).toThrow();
  });
});

describe('formatInstant', () => {
  it('shows a UTC instant in the property timezone', () => {
    // 05:00 UTC on Nov 2 is 01:00 AST (America/Halifax, UTC-4) on Nov 2.
    const text = normalizeSpaces(formatInstant('2026-11-02T05:00:12Z', 'en-CA', 'America/Halifax'));
    expect(text).toContain('Nov 2, 2026');
    expect(text).toContain('1:00');
  });
});

describe('formatStayDate', () => {
  it('never shifts a property-local stay date', () => {
    expect(formatStayDate('2026-11-14', 'en-CA')).toBe('Nov 14, 2026');
    expect(normalizeSpaces(formatStayDate('2026-11-14', 'fr-CA'))).toBe('14 nov. 2026');
  });

  it('rejects a value that is not YYYY-MM-DD', () => {
    expect(() => formatStayDate('2026-11-14T00:00:00Z', 'en-CA')).toThrow();
  });
});
