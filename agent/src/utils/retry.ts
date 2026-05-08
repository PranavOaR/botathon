const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function isRetryableError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) {
    return RETRYABLE_STATUS_CODES.has((err as { status: number }).status);
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryableError(err)) throw err;
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * Math.pow(2, attempt - 1)));
      }
    }
  }

  throw lastError;
}
