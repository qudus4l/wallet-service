import { PasswordService } from '../../src/modules/auth/password.service';

describe('PasswordService.verify', () => {
  const service = new PasswordService();
  const logError = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

  beforeEach(() => logError.mockClear());

  it('accepts the right password and rejects a wrong one without logging a fault', async () => {
    const hash = await service.hash('the-right-password');
    await expect(service.verify(hash, 'the-right-password')).resolves.toBe(true);
    await expect(service.verify(hash, 'the-wrong-password')).resolves.toBe(false);
    expect(logError).not.toHaveBeenCalled();
  });

  it('rejects an unknown user even if the password matches the timing dummy', async () => {
    await expect(service.verify(undefined, 'timing-equaliser-not-a-real-password')).resolves.toBe(
      false,
    );
    expect(logError).not.toHaveBeenCalled();
  });

  it('fails the login and logs a fault for a corrupt hash, without logging the password', async () => {
    await expect(service.verify('not-an-argon2-hash', 'secret-attempt')).resolves.toBe(false);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0]?.[0]).not.toContain('secret-attempt');
  });
});
