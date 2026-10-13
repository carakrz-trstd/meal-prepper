import { describe, it, expect } from 'vitest';
import { formatShoppingText } from '../../src/shared/shopping-text';

describe('formatShoppingText (T-13, AC-22)', () => {
  it('writes one line per entry: <quantity> <unit> <name>', () => {
    expect(
      formatShoppingText([
        { name: 'Flour', quantity: 1.5, unit: 'kg' },
        { name: 'Onion', quantity: 3, unit: 'piece' },
      ]),
    ).toBe('1.5 kg Flour\n3 piece Onion');
  });
  it('an empty list gives an empty string', () => {
    expect(formatShoppingText([])).toBe('');
  });
});
