import type { Request, Response, NextFunction, RequestHandler } from 'express';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaymentVerifier {
  verify(
    paymentHeader: string,
    req: Request
  ): Promise<{ ok: true } | { ok: false; status: number; body: unknown }>;
}

interface PaymentRequiredBody {
  error: string;
  provider: 'zynd';
  price: string;
  currency: string;
  walletAddress: string;
  agentId: string;
  paymentHeader: string;
}

// ─── Zynd verifier ────────────────────────────────────────────────────────────

/**
 * Default verifier implementation.
 * TODO: Replace with official Zynd SDK once API shape is confirmed.
 *
 * Current behaviour:
 * - If ZYND_API_KEY is not set -> 503 (not configured)
 * - If set -> POSTs to ZYND_VERIFY_ENDPOINT for verification
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
 * - Returns 503 if X402_WALLET_ADDRESS or ZYND_AGENT_ID is not configured
 * - Reads payment header from the request
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

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Per-request config read — allows env to change between factory time and request time
      const price = process.env['X402_PRICE_USDC'] ?? '0.01';
      const walletAddress = process.env['X402_WALLET_ADDRESS'] ?? '';
      const agentId = process.env['ZYND_AGENT_ID'] ?? '';
      const paymentHeaderName = (process.env['X402_PAYMENT_HEADER'] ?? 'x-payment').toLowerCase();

      // Misconfiguration check — return 503 rather than a misleading 402
      if (!walletAddress) {
        res.status(503).json({
          error: 'Payment gateway misconfigured: X402_WALLET_ADDRESS is required when X402_ENABLED=true',
        });
        return;
      }
      if (!agentId) {
        res.status(503).json({
          error: 'Payment gateway misconfigured: ZYND_AGENT_ID is required when X402_ENABLED=true',
        });
        return;
      }

      const payment = req.headers[paymentHeaderName] as string | undefined;

      if (!payment) {
        const body: PaymentRequiredBody = {
          error: 'Payment required',
          provider: 'zynd',
          price,
          currency: 'USDC',
          walletAddress,
          agentId,
          paymentHeader: paymentHeaderName,
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
