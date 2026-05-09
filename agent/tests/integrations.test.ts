import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';

// The integrations route reads env vars per-request (inside the handler),
// so we can create fresh apps after setting up env vars in beforeEach.
// The x402 middleware reads X402_ENABLED at createApp() time, so apps
// created after env setup correctly pick up the flag.

function makeApp() {
  return createApp();
}

// ─── Default state (no env vars set) ──────────────────────────────────────────

describe('GET /integrations/status — defaults', () => {
  beforeEach(() => {
    delete process.env['APIFY_API_TOKEN'];
    delete process.env['APIFY_ACTOR_ID'];
    delete process.env['GITHUB_TOKEN'];
    delete process.env['X402_ENABLED'];
    delete process.env['X402_WALLET_ADDRESS'];
    delete process.env['ZYND_AGENT_ID'];
    delete process.env['SUPERPLANE_ENABLED'];
    delete process.env['SUPERPLANE_API_TOKEN'];
    delete process.env['SUPERPLANE_CANVAS_ID'];
  });

  it('returns 200', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.status).toBe(200);
  });

  it('response has apify, zynd, superplane keys', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body).toHaveProperty('apify');
    expect(res.body).toHaveProperty('zynd');
    expect(res.body).toHaveProperty('superplane');
  });

  it('apify.configured is false when tokens missing', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.apify.configured).toBe(false);
  });

  it('apify.mode is github_fallback when not configured', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.apify.mode).toBe('github_fallback');
  });

  it('zynd.enabled is false by default', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.zynd.enabled).toBe(false);
  });

  it('zynd.configured is false by default', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.zynd.configured).toBe(false);
  });

  it('superplane.enabled is false by default', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.superplane.enabled).toBe(false);
  });

  it('superplane.configured is false by default', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.superplane.configured).toBe(false);
  });

  it('does not leak secret token values', async () => {
    process.env['APIFY_API_TOKEN'] = 'secret-apify-token';
    process.env['ZYND_API_KEY'] = 'secret-zynd-key';
    process.env['SUPERPLANE_API_TOKEN'] = 'secret-superplane-token';

    const res = await request(makeApp()).get('/integrations/status');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('secret-apify-token');
    expect(body).not.toContain('secret-zynd-key');
    expect(body).not.toContain('secret-superplane-token');

    delete process.env['APIFY_API_TOKEN'];
    delete process.env['ZYND_API_KEY'];
    delete process.env['SUPERPLANE_API_TOKEN'];
  });
});

// ─── Apify configured ─────────────────────────────────────────────────────────

describe('GET /integrations/status — apify configured', () => {
  beforeEach(() => {
    delete process.env['X402_ENABLED'];
    process.env['APIFY_API_TOKEN'] = 'apify_api_test';
    process.env['APIFY_ACTOR_ID'] = 'user/my-actor';
  });

  afterEach(() => {
    delete process.env['APIFY_API_TOKEN'];
    delete process.env['APIFY_ACTOR_ID'];
  });

  it('apify.configured is true', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.apify.configured).toBe(true);
  });

  it('apify.mode is "apify"', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.apify.mode).toBe('apify');
  });

  it('apify.hasApiToken is true', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.apify.hasApiToken).toBe(true);
  });

  it('apify.hasActorId is true', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.apify.hasActorId).toBe(true);
  });
});

// ─── Zynd enabled and configured ─────────────────────────────────────────────

describe('GET /integrations/status — zynd enabled + configured', () => {
  beforeEach(() => {
    delete process.env['X402_ENABLED'];
    process.env['X402_WALLET_ADDRESS'] = '0xTestWallet';
    process.env['ZYND_AGENT_ID'] = 'agent-xyz';
    process.env['X402_PRICE_USDC'] = '0.05';
  });

  afterEach(() => {
    delete process.env['X402_ENABLED'];
    delete process.env['X402_WALLET_ADDRESS'];
    delete process.env['ZYND_AGENT_ID'];
    delete process.env['X402_PRICE_USDC'];
  });

  it('zynd.enabled is false when X402_ENABLED not set', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.zynd.enabled).toBe(false);
  });

  it('zynd.enabled is true when X402_ENABLED=true', async () => {
    process.env['X402_ENABLED'] = 'true';
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.zynd.enabled).toBe(true);
  });

  it('zynd.configured is true when enabled with wallet and agentId', async () => {
    process.env['X402_ENABLED'] = 'true';
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.zynd.configured).toBe(true);
  });

  it('zynd.walletAddress is exposed (it is public info)', async () => {
    process.env['X402_ENABLED'] = 'true';
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.zynd.walletAddress).toBe('0xTestWallet');
  });

  it('zynd.price reflects env var', async () => {
    process.env['X402_ENABLED'] = 'true';
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.zynd.price).toBe('0.05');
  });

  it('zynd.currency is USDC', async () => {
    process.env['X402_ENABLED'] = 'true';
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.zynd.currency).toBe('USDC');
  });
});

// ─── Zynd enabled but missing wallet ─────────────────────────────────────────

describe('GET /integrations/status — zynd enabled, missing wallet', () => {
  beforeEach(() => {
    process.env['X402_ENABLED'] = 'true';
    process.env['ZYND_AGENT_ID'] = 'agent-xyz';
    delete process.env['X402_WALLET_ADDRESS'];
  });

  afterEach(() => {
    delete process.env['X402_ENABLED'];
    delete process.env['ZYND_AGENT_ID'];
  });

  it('zynd.enabled is true', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.zynd.enabled).toBe(true);
  });

  it('zynd.configured is false when wallet missing', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.zynd.configured).toBe(false);
  });
});

// ─── Route is public when x402 is enabled ────────────────────────────────────

describe('GET /integrations/status — public even when x402 enabled', () => {
  beforeEach(() => {
    process.env['X402_ENABLED'] = 'true';
    process.env['X402_WALLET_ADDRESS'] = '0xWallet';
    process.env['ZYND_AGENT_ID'] = 'agent-xyz';
  });

  afterEach(() => {
    delete process.env['X402_ENABLED'];
    delete process.env['X402_WALLET_ADDRESS'];
    delete process.env['ZYND_AGENT_ID'];
  });

  it('returns 200 without any payment header', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.status).toBe(200);
  });

  it('does not return 402', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.status).not.toBe(402);
  });
});

// ─── Superplane configured ────────────────────────────────────────────────────

describe('GET /integrations/status — superplane configured', () => {
  beforeEach(() => {
    delete process.env['X402_ENABLED'];
    process.env['SUPERPLANE_ENABLED'] = 'true';
    process.env['SUPERPLANE_API_TOKEN'] = 'sp-token';
    process.env['SUPERPLANE_CANVAS_ID'] = 'canvas-123';
  });

  afterEach(() => {
    delete process.env['SUPERPLANE_ENABLED'];
    delete process.env['SUPERPLANE_API_TOKEN'];
    delete process.env['SUPERPLANE_CANVAS_ID'];
  });

  it('superplane.enabled is true', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.superplane.enabled).toBe(true);
  });

  it('superplane.configured is true', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.superplane.configured).toBe(true);
  });

  it('superplane.hasApiToken is true', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.superplane.hasApiToken).toBe(true);
  });

  it('superplane.hasCanvasId is true', async () => {
    const res = await request(makeApp()).get('/integrations/status');
    expect(res.body.superplane.hasCanvasId).toBe(true);
  });
});
