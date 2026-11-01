import { maskName } from '../../src/modules/wallets/wallets.service';

describe('maskName', () => {
  it.each([
    ['Ada Lovelace', 'Ada L.'],
    ['  ada   byron   lovelace ', 'ada L.'],
    ['Cher', 'Cher'],
  ])('%p → %p', (input, expected) => {
    expect(maskName(input)).toBe(expected);
  });
});
