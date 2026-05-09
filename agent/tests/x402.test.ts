import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createX402Middleware } from '../src/payment/x402';
import type { PaymentVerifier } from '../src/payment/x402';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMocks() {
  const req = {
    headers: {} as Record<string, string>,
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as unknown as NextFunction;

  return { req, res, next };
}

// ─── Disabled middleware ───────────────────────────────────────────────────────

describe('createX402Middleware — disabled (default)', () => {
  beforeEach(() => {
    delete process.env['X402_ENABLED'];
  });

  it('passes every request through (calls next)', async () => {
    const { req, res, next } = makeMocks();
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('does not call res.status or res.json when disabled', async () => {
    const { req, res, next } = makeMocks();
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('passes through even when payment header is absent', async () => {
    const { req, res, next } = makeMocks();
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ─── Enabled, missing payment header ─────────────────────────────────────────

describe('createX402Middleware — enabled, no payment header', () => {
  beforeEach(() => {
    process.env['X402_ENABLED'] = 'true';
    process.env['X402_PRICE_USDC'] = '0.01';
    process.env['X402_WALLET_ADDRESS'] = '0xABC';
    process.env['ZYND_AGENT_ID'] = 'agent-123';
    // ZYND_API_KEY intentionally unset so verifier returns 503
  });

  afterEach(() => {
    delete process.env['X402_ENABLED'];
    delete process.env['X402_PRICE_USDC'];
    delete process.env['X402_WALLET_ADDRESS'];
    delete process.env['ZYND_AGENT_ID'];
  });

  it('returns 402 when x-payment header is missing', async () => {
    const { req, res, next } = makeMocks();
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(402);
  });

  it('response body includes error field', async () => {
    const { req, res, next } = makeMocks();
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(typeof body.error).toBe('string');
    expect(body.error).toContain('Payment required');
  });

  it('response body includes price, currency, walletAddress, agentId', async () => {
    const { req, res, next } = makeMocks();
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.price).toBe('0.01');
    expect(body.currency).toBe('USDC');
    expect(body.walletAddress).toBe('0xABC');
    expect(body.agentId).toBe('agent-123');
  });

  it('response body includes provider: "zynd"', async () => {
    const { req, res, next } = makeMocks();
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.provider).toBe('zynd');
  });

  it('response body includes paymentHeader field', async () => {
    const { req, res, next } = makeMocks();
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(typeof body.paymentHeader).toBe('string');
    expect(body.paymentHeader.length).toBeGreaterThan(0);
  });

  it('does not call next when payment header is missing', async () => {
    const { req, res, next } = makeMocks();
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── Enabled, missing wallet address → 503 ───────────────────────────────────

describe('createX402Middleware — enabled, missing wallet address', () => {
  beforeEach(() => {
    process.env['X402_ENABLED'] = 'true';
    process.env['ZYND_AGENT_ID'] = 'agent-123';
    delete process.env['X402_WALLET_ADDRESS'];
  });

  afterEach(() => {
    delete process.env['X402_ENABLED'];
    delete process.env['ZYND_AGENT_ID'];
    delete process.env['X402_WALLET_ADDRESS'];
  });

  it('returns 503 when X402_WALLET_ADDRESS is missing', async () => {
    const { req, res, next } = makeMocks();
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('503 body explains wallet address is required', async () => {
    const { req, res, next } = makeMocks();
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error.toLowerCase()).toMatch(/misconfigured|required/);
    expect(body.error.toLowerCase()).toContain('wallet');
  });

  it('returns 503 even when payment header is present', async () => {
    const { req, res, next } = makeMocks();
    (req as unknown as { headers: Record<string, string> }).headers['x-payment'] = 'some-token';
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('does not call next', async () => {
    const { req, res, next } = makeMocks();
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── Enabled, missing agent ID → 503 ─────────────────────────────────────────

describe('createX402Middleware — enabled, missing agent ID', () => {
  beforeEach(() => {
    process.env['X402_ENABLED'] = 'true';
    process.env['X402_WALLET_ADDRESS'] = '0xABC';
    delete process.env['ZYND_AGENT_ID'];
  });

  afterEach(() => {
    delete process.env['X402_ENABLED'];
    delete process.env['X402_WALLET_ADDRESS'];
    delete process.env['ZYND_AGENT_ID'];
  });

  it('returns 503 when ZYND_AGENT_ID is missing', async () => {
    const { req, res, next } = makeMocks();
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('503 body explains agent ID is required', async () => {
    const { req, res, next } = makeMocks();
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error.toLowerCase()).toMatch(/misconfigured|required/);
  });

  it('does not call next', async () => {
    const { req, res, next } = makeMocks();
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── Enabled, payment header present but Zynd not configured ─────────────────

describe('createX402Middleware — enabled, payment header present, Zynd not configured', () => {
  beforeEach(() => {
    process.env['X402_ENABLED'] = 'true';
    process.env['X402_WALLET_ADDRESS'] = '0xABC';
    process.env['ZYND_AGENT_ID'] = 'agent-123';
    delete process.env['ZYND_API_KEY'];
  });

  afterEach(() => {
    delete process.env['X402_ENABLED'];
    delete process.env['X402_WALLET_ADDRESS'];
    delete process.env['ZYND_AGENT_ID'];
  });

  it('returns 503 when ZYND_API_KEY is not set', async () => {
    const { req, res, next } = makeMocks();
    (req as unknown as { headers: Record<string, string> }).headers['x-payment'] = 'fake-token';
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('response body has error about configuration', async () => {
    const { req, res, next } = makeMocks();
    (req as unknown as { headers: Record<string, string> }).headers['x-payment'] = 'fake-token';
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(typeof body.error).toBe('string');
    expect(body.error.toLowerCase()).toContain('not configured');
  });
});

// ─── Custom payment header ────────────────────────────────────────────────────

describe('createX402Middleware — custom payment header', () => {
  beforeEach(() => {
    process.env['X402_ENABLED'] = 'true';
    process.env['X402_WALLET_ADDRESS'] = '0xABC';
    process.env['ZYND_AGENT_ID'] = 'agent-123';
    process.env['X402_PAYMENT_HEADER'] = 'x-custom-pay';
  });

  afterEach(() => {
    delete process.env['X402_ENABLED'];
    delete process.env['X402_WALLET_ADDRESS'];
    delete process.env['ZYND_AGENT_ID'];
    delete process.env['X402_PAYMENT_HEADER'];
  });

  it('reads payment from the custom header name', async () => {
    const { req, res, next } = makeMocks();
    (req as unknown as { headers: Record<string, string> }).headers['x-custom-pay'] = 'valid-token';

    const verifier: PaymentVerifier = {
      verify: vi.fn().mockResolvedValue({ ok: true as const }),
    };

    const middleware = createX402Middleware(verifier);
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 402 when custom header is absent', async () => {
    const { req, res, next } = makeMocks();
    // x-payment is present but x-custom-pay is not
    (req as unknown as { headers: Record<string, string> }).headers['x-payment'] = 'some-token';

    const middleware = createX402Middleware();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(402);
  });

  it('402 body paymentHeader field reflects custom header name', async () => {
    const { req, res, next } = makeMocks();
    const middleware = createX402Middleware();
    await middleware(req, res, next);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.paymentHeader).toBe('x-custom-pay');
  });
});

// ─── Custom verifier ──────────────────────────────────────────────────────────

describe('createX402Middleware — custom verifier', () => {
  beforeEach(() => {
    process.env['X402_ENABLED'] = 'true';
    process.env['X402_WALLET_ADDRESS'] = '0xABC';
    process.env['ZYND_AGENT_ID'] = 'agent-123';
  });

  afterEach(() => {
    delete process.env['X402_ENABLED'];
    delete process.env['X402_WALLET_ADDRESS'];
    delete process.env['ZYND_AGENT_ID'];
  });

  it('calls next when custom verifier returns ok: true', async () => {
    const { req, res, next } = makeMocks();
    (req as unknown as { headers: Record<string, string> }).headers['x-payment'] = 'valid-token';

    const verifier: PaymentVerifier = {
      verify: vi.fn().mockResolvedValue({ ok: true as const }),
    };

    const middleware = createX402Middleware(verifier);
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 402 when custom verifier returns ok: false with status 402', async () => {
    const { req, res, next } = makeMocks();
    (req as unknown as { headers: Record<string, string> }).headers['x-payment'] = 'bad-token';

    const verifier: PaymentVerifier = {
      verify: vi.fn().mockResolvedValue({
        ok: false as const,
        status: 402,
        body: { error: 'Invalid payment' },
      }),
    };

    const middleware = createX402Middleware(verifier);
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(next).not.toHaveBeenCalled();
  });

  it('never throws even when verifier rejects', async () => {
    const { req, res, next } = makeMocks();
    (req as unknown as { headers: Record<string, string> }).headers['x-payment'] = 'token';

    const verifier: PaymentVerifier = {
      verify: vi.fn().mockRejectedValue(new Error('Network down')),
    };

    const middleware = createX402Middleware(verifier);
    await expect(middleware(req, res, next)).resolves.not.toThrow();
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
