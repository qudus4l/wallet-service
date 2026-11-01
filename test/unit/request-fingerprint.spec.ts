import { requestFingerprint } from '../../src/common/idempotency/request-fingerprint';

describe('requestFingerprint', () => {
  const body = { sourceWalletId: 'a', destinationWalletId: 'b', amount: 100, narration: 'rent' };

  it('is independent of key order', () => {
    const reordered = {
      amount: 100,
      narration: 'rent',
      destinationWalletId: 'b',
      sourceWalletId: 'a',
    };
    expect(requestFingerprint('op', body)).toBe(requestFingerprint('op', reordered));
  });

  it('ignores absent optional fields', () => {
    expect(requestFingerprint('op', { amount: 1, narration: undefined })).toBe(
      requestFingerprint('op', { amount: 1 }),
    );
  });

  it('changes when any value changes', () => {
    expect(requestFingerprint('op', body)).not.toBe(
      requestFingerprint('op', { ...body, amount: 101 }),
    );
  });

  it('is scoped to the operation', () => {
    expect(requestFingerprint('POST /v1/transfers', body)).not.toBe(
      requestFingerprint('POST /v1/admin/wallets/x/deposits', body),
    );
  });
});
