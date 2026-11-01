import { withTransientRetry } from '../../src/common/retry';

const pgError = (code: string) => Object.assign(new Error(code), { code });

describe('withTransientRetry', () => {
  it('retries deadlocks and serialization failures, then succeeds', async () => {
    const fn = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(pgError('40P01'))
      .mockRejectedValueOnce(pgError('40001'))
      .mockResolvedValue('ok');
    await expect(withTransientRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry other errors', async () => {
    const fn = jest.fn<Promise<string>, []>().mockRejectedValue(pgError('23505'));
    await expect(withTransientRetry(fn)).rejects.toThrow('23505');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retry budget', async () => {
    const fn = jest.fn<Promise<string>, []>().mockRejectedValue(pgError('40P01'));
    await expect(withTransientRetry(fn, 2)).rejects.toThrow('40P01');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('unwraps TypeORM QueryFailedError driver errors', async () => {
    const wrapped = Object.assign(new Error('query failed'), { driverError: { code: '40P01' } });
    const fn = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(wrapped)
      .mockResolvedValue('ok');
    await expect(withTransientRetry(fn)).resolves.toBe('ok');
  });
});
