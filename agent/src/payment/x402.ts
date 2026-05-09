import type { Request, Response, NextFunction, RequestHandler } from 'express';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentRequiredBody {
  error: string;
  price: string;
  currency: string;
  walletAddress: string;
  agentId: string;
}

interface PaymentVerifier {
  verify(
    paymentHeader: string,
    req: Request
  ): Promise<{ ok: true } | { ok: false; status: number; body: unknown }>;
}

// ─── Zynd verifier ────────────────────────────────────────────────────────────

/**
 * Default verifier implementation.
 * TODO: Replace with official Zynd SDK once API shape is confirmed.
 *
 * Current behaviour:
 * - If ZYND_API_KEY is not set → 503 (not configured)
 * - If set → POSTs to ZYND_VERIFY_ENDPOINT for verification
 */
function createZyndVerifier(): PaymentVerifier {
  return {
    async verify(paymentHeader, _req) {
      const zyndApiKey = process.env['ZYND_API_KEY'];
      if (!zyndApiKey) {
        return {
          ok: false,
          status: 503,
          body: { error: 'Zynd payment verification not configured' },
        };
      }

      // TODO: Replace URL and payload shape with official Zynd SDK / docs
      const verifyEndpoint =
        process.env['ZYND_VERIFY_ENDPOINT'] ??
        'https://api.zynd.ai/v1/payments/verify';

      try {
        const res = await fetch(verifyEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${zyndApiKey}`,
          },
          body: JSON.stringify({ payment: paymentHeader }),
        });

        if (res.ok) {
          return { ok: true };
        }

        const body = await res.json().catch(() => ({ error: res.statusText }));
        return { ok: false, status: 402, body };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[x402] Zynd verification network error:', message);
        return {
          ok: false,
          status: 503,
          body: { error: `Payment verification unavailable: ${message}` },
        };
      }
    },
  };
}

// ─── Middleware factory ────────────────────────────────────────────────────────

/**
 * Creates an x402 micropayment middleware.
 *
 * Feature-flagged via X402_ENABLED env var. When disabled (default), returns
 * a no-op pass-through — safe to wire unconditionally in server.ts.
 *
 * When enabled:
 * - Reads x-payment header from the request
 * - Returns 402 with payment details if header is missing
 * - Delegates to verifier if header is present
 * - Returns 402 or 503 based on verifier result
 */
export function createX402Middleware(
  verifier: PaymentVerifier = createZyndVerifier()
): RequestHandler {
  const enabled = process.env['X402_ENABLED'] === 'true';

  if (!enabled) {
    // No-op — all requests pass through
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  const price = process.env['X402_PRICE_USDC'] ?? '0.01';
  const walletAddress = process.env['X402_WALLET_ADDRESS'] ?? '';
  const agentId = process.env['ZYND_AGENT_ID'] ?? '';
  const paymentHeader = process.env['X402_PAYMENT_HEADER'] ?? 'x-payment';

  if (!walletAddress) {
    console.warn('[x402] X402_WALLET_ADDRESS is not set — payment responses will have empty wallet address');
  }
  if (!agentId) {
    console.warn('[x402] ZYND_AGENT_ID is not set — payment responses will have empty agentId');
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payment = req.headers[paymentHeader.toLowerCase()] as string | undefined;

      if (!payment) {
        const body: PaymentRequiredBody = {
          error: 'Payment required',
          price,
          currency: 'USDC',
          walletAddress,
          agentId,
        };
        res.status(402).json(body);
        return;
      }

      const result = await verifier.verify(payment, req);
      if (result.ok) {
        next();
        return;
      }

      res.status(result.status).json(result.body);
    } catch (err) {
      // Never crash on payment middleware failure
      const message = err instanceof Error ? err.message : String(err);
      console.error('[x402] Unexpected middleware error:', message);
      res.status(503).json({ error: 'Payment verification service error' });
    }
  };
}
