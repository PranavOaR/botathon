import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emitInvestigationCompleted } from '../src/workflows/superplane';
import type { InvestigationPayload } from '../src/workflows/superplane';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SAMPLE_PAYLOAD: InvestigationPayload = {
  sessionId: 'test-session-id',
  query: 'How does auth work?',
  targetPath: '/tmp/repo',
  filesRead: ['src/auth.ts', 'src/middleware.ts'],
  iterationCount: 3,
  timestamp: '2026-05-10T00:00:00.000Z',
};

// ─── Disabled ─────────────────────────────────────────────────────────────────

describe('emitInvestigationCompleted — disabled', () => {
  beforeEach(() => {
    delete process.env['SUPERPLANE_ENABLED'];
  });

  it('returns "disabled" when SUPERPLANE_ENABLED is not set', async () => {
    const result = await emitInvestigationCompleted(SAMPLE_PAYLOAD);
    expect(result).toBe('disabled');
  });

  it('returns "disabled" when SUPERPLANE_ENABLED is "false"', async () => {
    process.env['SUPERPLANE_ENABLED'] = 'false';
    const result = await emitInvestigationCompleted(SAMPLE_PAYLOAD);
    expect(result).toBe('disabled');
  });

  it('does not call fetch when disabled', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await emitInvestigationCompleted(SAMPLE_PAYLOAD);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ─── Not configured ───────────────────────────────────────────────────────────

describe('emitInvestigationCompleted — enabled but not configured', () => {
  beforeEach(() => {
    process.env['SUPERPLANE_ENABLED'] = 'true';
    delete process.env['SUPERPLANE_API_TOKEN'];
    delete process.env['SUPERPLANE_CANVAS_ID'];
  });

  afterEach(() => {
    delete process.env['SUPERPLANE_ENABLED'];
    delete process.env['SUPERPLANE_API_TOKEN'];
    delete process.env['SUPERPLANE_CANVAS_ID'];
  });

  it('returns "not_configured" when token and canvas ID are missing', async () => {
    const result = await emitInvestigationCompleted(SAMPLE_PAYLOAD);
    expect(result).toBe('not_configured');
  });

  it('returns "not_configured" when only token is missing', async () => {
    process.env['SUPERPLANE_CANVAS_ID'] = 'canvas-123';
    const result = await emitInvestigationCompleted(SAMPLE_PAYLOAD);
    expect(result).toBe('not_configured');
  });

  it('returns "not_configured" when only canvas ID is missing', async () => {
    process.env['SUPERPLANE_API_TOKEN'] = 'sp-token';
    const result = await emitInvestigationCompleted(SAMPLE_PAYLOAD);
    expect(result).toBe('not_configured');
  });

  it('logs a warning when not configured', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await emitInvestigationCompleted(SAMPLE_PAYLOAD);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SUPERPLANE_API_TOKEN'));
    warnSpy.mockRestore();
  });

  it('does not call fetch when not configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await emitInvestigationCompleted(SAMPLE_PAYLOAD);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ─── Fully configured — successful emit ───────────────────────────────────────

describe('emitInvestigationCompleted — configured, successful emit', () => {
  beforeEach(() => {
    process.env['SUPERPLANE_ENABLED'] = 'true';
    process.env['SUPERPLANE_API_TOKEN'] = 'sp-token-abc';
    process.env['SUPERPLANE_CANVAS_ID'] = 'canvas-xyz';
    process.env['SUPERPLANE_ENDPOINT'] = 'https://api.superplane.test/v1/events';
  });

  afterEach(() => {
    delete process.env['SUPERPLANE_ENABLED'];
    delete process.env['SUPERPLANE_API_TOKEN'];
    delete process.env['SUPERPLANE_CANVAS_ID'];
    delete process.env['SUPERPLANE_ENDPOINT'];
    vi.restoreAllMocks();
  });

  it('returns "emitted" on successful POST', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    const result = await emitInvestigationCompleted(SAMPLE_PAYLOAD);
    expect(result).toBe('emitted');
  });

  it('POSTs to the configured endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    await emitInvestigationCompleted(SAMPLE_PAYLOAD);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.superplane.test/v1/events',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('sends Authorization header with Bearer token', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    await emitInvestigationCompleted(SAMPLE_PAYLOAD);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sp-token-abc');
  });

  it('sends correct event body shape', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    await emitInvestigationCompleted(SAMPLE_PAYLOAD);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe('filemind.investigation.completed');
    expect(body.canvasId).toBe('canvas-xyz');
    expect(body.payload.sessionId).toBe(SAMPLE_PAYLOAD.sessionId);
    expect(body.payload.query).toBe(SAMPLE_PAYLOAD.query);
  });

  it('returns "failed" when response is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: vi.fn().mockResolvedValue('Server error'),
    } as unknown as Response);

    const result = await emitInvestigationCompleted(SAMPLE_PAYLOAD);
    expect(result).toBe('failed');
  });
});

// ─── Network failure ──────────────────────────────────────────────────────────

describe('emitInvestigationCompleted — network failure', () => {
  beforeEach(() => {
    process.env['SUPERPLANE_ENABLED'] = 'true';
    process.env['SUPERPLANE_API_TOKEN'] = 'sp-token-abc';
    process.env['SUPERPLANE_CANVAS_ID'] = 'canvas-xyz';
  });

  afterEach(() => {
    delete process.env['SUPERPLANE_ENABLED'];
    delete process.env['SUPERPLANE_API_TOKEN'];
    delete process.env['SUPERPLANE_CANVAS_ID'];
    vi.restoreAllMocks();
  });

  it('returns "failed" when fetch throws a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network down'));

    const result = await emitInvestigationCompleted(SAMPLE_PAYLOAD);
    expect(result).toBe('failed');
  });

  it('does not throw even when fetch rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

    await expect(emitInvestigationCompleted(SAMPLE_PAYLOAD)).resolves.not.toThrow();
  });

  it('logs a warning on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Timeout'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await emitInvestigationCompleted(SAMPLE_PAYLOAD);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Network error'));
    warnSpy.mockRestore();
  });
});
