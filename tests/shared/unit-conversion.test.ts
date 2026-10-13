import { describe, it, expect } from 'vitest';
import { familyOf, toBase, formatBase, formatQuantity } from '../../src/shared/unit-conversion';

describe('unit conversion (T-3, AC-14, AC-21)', () => {
  it('familyOf covers all seven units', () => {
    expect(familyOf('g')).toBe('mass');
    expect(familyOf('kg')).toBe('mass');
    expect(familyOf('ml')).toBe('volume');
    expect(familyOf('l')).toBe('volume');
    expect(familyOf('tsp')).toBe('spoon');
    expect(familyOf('tbsp')).toBe('spoon');
    expect(familyOf('piece')).toBe('piece');
  });

  it('toBase converts to g, ml, tsp and piece', () => {
    expect(toBase(2, 'kg')).toBe(2000);
    expect(toBase(1.5, 'l')).toBe(1500);
    expect(toBase(1, 'tbsp')).toBe(3);
    expect(toBase(4, 'tsp')).toBe(4);
    expect(toBase(3, 'piece')).toBe(3);
  });

  it('switches to the larger unit at fixed thresholds', () => {
    expect(formatBase(999, 'mass')).toEqual({ quantity: 999, unit: 'g' });
    expect(formatBase(1000, 'mass')).toEqual({ quantity: 1, unit: 'kg' });
    expect(formatBase(1500, 'mass')).toEqual({ quantity: 1.5, unit: 'kg' });
    expect(formatBase(1000, 'volume')).toEqual({ quantity: 1, unit: 'l' });
    expect(formatBase(750, 'volume')).toEqual({ quantity: 750, unit: 'ml' });
    expect(formatBase(2, 'spoon')).toEqual({ quantity: 2, unit: 'tsp' });
    expect(formatBase(3, 'spoon')).toEqual({ quantity: 1, unit: 'tbsp' });
    expect(formatBase(4, 'spoon')).toEqual({ quantity: 1.3, unit: 'tbsp' });
  });

  it('rounds to at most one decimal', () => {
    expect(formatBase(333.33, 'mass').quantity).toBe(333.3);
    expect(formatBase(0.04, 'mass').quantity).toBe(0);
    expect(formatBase(12.25, 'mass').quantity).toBe(12.3); // half up
  });

  it('does not show 1000 g after rounding but switches to kg', () => {
    expect(formatBase(999.96, 'mass')).toEqual({ quantity: 1, unit: 'kg' });
  });

  it('rounds pieces up to the next whole number, ignoring floating-point noise (AC-21)', () => {
    expect(formatBase(2.1, 'piece')).toEqual({ quantity: 3, unit: 'piece' });
    expect(formatBase(2.0000000001, 'piece')).toEqual({ quantity: 2, unit: 'piece' });
    expect(formatBase(0.2, 'piece')).toEqual({ quantity: 1, unit: 'piece' });
  });

  it('formatQuantity drops a trailing .0', () => {
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(1.5)).toBe('1.5');
    expect(formatQuantity(3.0)).toBe('3');
  });
});
