import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../src/utils/retry';

function makeError(status: number): Error & { status: number } {
  const err = new Error(`HTTP ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

describe('withRetry', () => {
  it('returns the result when the fn succeeds immediately', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, 3, 0);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and succeeds on second attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(makeError(429))
      .mockResolvedValue('ok');
    const result = await withRetry(fn, 3, 0);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 500, 502, 503, 504', async () => {
    for (const status of [500, 502, 503, 504]) {
      const fn = vi.fn()
        .mockRejectedValueOnce(makeError(status))
        .mockResolvedValue('ok');
      await withRetry(fn, 3, 0);
      expect(fn).toHaveBeenCalledTimes(2);
    }
  });

  it('does NOT retry on 400, 401, 403 — throws immediately', async () => {
    for (const status of [400, 401, 403]) {
      const fn = vi.fn().mockRejectedValue(makeError(status));
      await expect(withRetry(fn, 3, 0)).rejects.toMatchObject({ status });
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it('throws after exhausting all retries', async () => {
    const err = makeError(429);
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, 3, 0)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-HTTP errors', async () => {
    const err = new Error('network failure');
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, 3, 0)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
