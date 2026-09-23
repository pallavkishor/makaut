import {
  MAX_PRICE_PAISE,
  formatPaise,
  paiseToRupeeInput,
  rupeesToPaise,
} from './money';

describe('rupeesToPaise', () => {
  it('converts whole rupees', () => {
    expect(rupeesToPaise('499')).toEqual({ ok: true, paise: 49900 });
  });

  it('converts a single decimal place', () => {
    expect(rupeesToPaise('19.9')).toEqual({ ok: true, paise: 1990 });
  });

  it('converts two decimal places without floating point drift', () => {
    // 19.99 * 100 is 1998.9999999999998 in binary floating point.
    expect(rupeesToPaise('19.99')).toEqual({ ok: true, paise: 1999 });
    expect(rupeesToPaise('1.10')).toEqual({ ok: true, paise: 110 });
    expect(rupeesToPaise('8.29')).toEqual({ ok: true, paise: 829 });
  });

  it('tolerates grouping separators and a rupee sign', () => {
    expect(rupeesToPaise('₹1,499.00')).toEqual({ ok: true, paise: 149900 });
  });

  it('accepts zero, for a free plan', () => {
    expect(rupeesToPaise('0')).toEqual({ ok: true, paise: 0 });
  });

  it('rejects more than two decimal places rather than rounding', () => {
    expect(rupeesToPaise('19.999')).toEqual({
      ok: false,
      error: 'Price cannot be finer than paise (two decimal places)',
    });
  });

  it('rejects blank and non-numeric input', () => {
    expect(rupeesToPaise('  ')).toEqual({ ok: false, error: 'Price is required' });
    expect(rupeesToPaise('free').ok).toBe(false);
    expect(rupeesToPaise('-5').ok).toBe(false);
  });

  it('rejects a price above the accepted ceiling', () => {
    const result = rupeesToPaise('10000000');

    expect(result.ok).toBe(false);
  });

  it('always yields an integer', () => {
    for (const input of ['0.01', '0.1', '7', '7.07', '123456.78']) {
      const result = rupeesToPaise(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Number.isInteger(result.paise)).toBe(true);
      }
    }
  });
});

describe('formatPaise', () => {
  it('renders minor units as rupees with two decimals', () => {
    expect(formatPaise(1999)).toBe('₹19.99');
    expect(formatPaise(0)).toBe('₹0.00');
    expect(formatPaise(49900)).toBe('₹499.00');
  });

  it('groups with the Indian convention', () => {
    expect(formatPaise(100000000)).toBe('₹10,00,000.00');
    expect(formatPaise(12345678)).toBe('₹1,23,456.78');
  });

  it('names any other currency instead of assuming a symbol', () => {
    expect(formatPaise(1999, 'USD')).toBe('19.99 USD');
  });
});

describe('round trip', () => {
  it('survives paise -> input -> paise', () => {
    for (const paise of [0, 1, 99, 1999, 49900, MAX_PRICE_PAISE]) {
      const result = rupeesToPaise(paiseToRupeeInput(paise));

      expect(result).toEqual({ ok: true, paise });
    }
  });
});
