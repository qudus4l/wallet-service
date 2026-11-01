import { bigintTransformer } from '../../src/database/bigint.transformer';

describe('bigintTransformer', () => {
  it('converts driver strings to numbers', () => {
    expect(bigintTransformer.from('150000')).toBe(150000);
    expect(bigintTransformer.from('-42')).toBe(-42);
  });

  it('preserves null', () => {
    expect(bigintTransformer.from(null)).toBeNull();
  });

  it('refuses values that would lose precision', () => {
    expect(() => bigintTransformer.from('9007199254740993')).toThrow(RangeError);
  });

  it('writes numbers unchanged', () => {
    expect(bigintTransformer.to(5)).toBe(5);
  });
});
