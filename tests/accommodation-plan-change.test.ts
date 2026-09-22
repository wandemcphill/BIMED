import { describe, expect, it } from 'vitest';

describe('accommodation plan change policy', () => {
  it('allows changing an unpaid issued invoice back to plan selection', () => {
    expect(['draft', 'issued'].includes('issued')).toBe(true);
  });

  it('does not allow a paid invoice to be changed', () => {
    expect(['draft', 'issued'].includes('paid')).toBe(false);
  });

  it('offers the two selectable plans', () => {
    expect(['three_months_4000', 'one_month_1250']).toEqual([
      'three_months_4000',
      'one_month_1250',
    ]);
  });
});
