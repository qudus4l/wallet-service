import { E164_PATTERN, normalizeEmail, normalizePhone } from '../../src/common/identity';

describe('identity normalisation', () => {
  it('trims and lowercases emails', () => {
    expect(normalizeEmail('  Ada.Lovelace@Example.COM ')).toBe('ada.lovelace@example.com');
  });

  it('strips phone formatting to E.164', () => {
    const phone = normalizePhone('+234 (801) 234-5678');
    expect(phone).toBe('+2348012345678');
    expect(E164_PATTERN.test(phone)).toBe(true);
  });

  it('rejects numbers without a country code', () => {
    expect(E164_PATTERN.test(normalizePhone('08012345678'))).toBe(false);
  });
});
