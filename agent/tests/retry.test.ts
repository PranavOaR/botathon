import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../src/utils/retry';

function makeStatusError(status: number): Error & { status: number } {
  const err = new Error(`HTTP ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

function makeStatusCodeError(statusCode: number): Error & { statusCode: number } {
  const err = new Error(`HTTP ${statusCode}`) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

function makeResponseError(status: number): Error & { response: { status: number } } {
  const err = new Error(`HTTP ${status}`) as Error & { response: { status: number } };
  err.response = { status };
  return err;
}

describe('withRetry — success path', () => {
  it('returns result when fn succeeds immediately', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    expect(await withRetry(fn, 3, 0)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('withRetry — err.status', () => {
  it('retries on 429 via status', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(makeStatusError(429))
      .mockResolvedValue('ok');
    expect(await withRetry(fn, 3, 0)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 500 via status', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(makeStatusError(500))
      .mockResolvedValue('ok');
    expect(await withRetry(fn, 3, 0)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on any 5xx via status', async () => {
    for (const code of [501, 502, 503, 504, 599]) {
      const fn = vi.fn()
        .mockRejectedValueOnce(makeStatusError(code))
        .mockResolvedValue('ok');
      await withRetry(fn, 3, 0);
      expect(fn).toHaveBeenCalledTimes(2);
    }
  });

  it('does not retry 400 via status', async () => {
    const fn = vi.fn().mockRejectedValue(makeStatusError(400));
    await expect(withRetry(fn, 3, 0)).rejects.toMatchObject({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry 401 via status', async () => {
    const fn = vi.fn().mockRejectedValue(makeStatusError(401));
    await expect(withRetry(fn, 3, 0)).rejects.toMatchObject({ status: 401 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry 403 via status', async () => {
    const fn = vi.fn().mockRejectedValue(makeStatusError(403));
    await expect(withRetry(fn, 3, 0)).rejects.toMatchObject({ status: 403 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('withRetry — err.statusCode', () => {
  it('retries on 429 via statusCode', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(makeStatusCodeError(429))
      .mockResolvedValue('ok');
    expect(await withRetry(fn, 3, 0)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 503 via statusCode', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(makeStatusCodeError(503))
      .mockResolvedValue('ok');
    expect(await withRetry(fn, 3, 0)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry 403 via statusCode', async () => {
    const fn = vi.fn().mockRejectedValue(makeStatusCodeError(403));
    await expect(withRetry(fn, 3, 0)).rejects.toMatchObject({ statusCode: 403 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('withRetry — err.response.status', () => {
  it('retries on 500 via response.status', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(makeResponseError(500))
      .mockResolvedValue('ok');
    expect(await withRetry(fn, 3, 0)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 via response.status', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(makeResponseError(429))
      .mockResolvedValue('ok');
    expect(await withRetry(fn, 3, 0)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry 403 via response.status', async () => {
    const fn = vi.fn().mockRejectedValue(makeResponseError(403));
    await expect(withRetry(fn, 3, 0)).rejects.toMatchObject({ response: { status: 403 } });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('withRetry — exhaustion and non-HTTP errors', () => {
  it('throws last error after exhausting all attempts', async () => {
    const err = makeStatusError(429);
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, 3, 0)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry plain Error with no status', async () => {
    const err = new Error('network failure');
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, 3, 0)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
