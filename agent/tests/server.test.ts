import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';
import { clearCompletedSessionsForTests } from '../src/routes/sessionStore';
import type { AgentRunner } from '../src/routes/query';
import type { AgentResponse } from '../src/types';

const fakeResponse: AgentResponse = {
  answer: 'Auth uses JWTs.',
  navigationTrace: [],
  filesRead: ['src/middleware.ts'],
  iterationCount: 2,
  sessionId: 'test-session-1',
};

const fakeRunner: AgentRunner = {
  async run(_query, _targetPath, onEvent) {
    onEvent?.({ type: 'tool_call', tool: 'tree', input: { path: '/' } });
    onEvent?.({ type: 'tool_result', tool: 'tree', summary: './src' });
    onEvent?.({ type: 'final', content: fakeResponse.answer });
    onEvent?.({ type: 'done', iterationCount: fakeResponse.iterationCount });
    return fakeResponse;
  },
};

function app() {
  return createApp({ agentRunner: fakeRunner });
}

beforeEach(() => {
  clearCompletedSessionsForTests();
});

// ─── GET /health ──────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200', async () => {
    const res = await request(app()).get('/health');
    expect(res.status).toBe(200);
  });

  it('body has status: "ok"', async () => {
    const res = await request(app()).get('/health');
    expect(res.body.status).toBe('ok');
  });

  it('body has uptime as a number', async () => {
    const res = await request(app()).get('/health');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('body has timestamp as ISO string', async () => {
    const res = await request(app()).get('/health');
    expect(res.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── POST /query ──────────────────────────────────────────────────────────────

describe('POST /query — success', () => {
  it('returns 200', async () => {
    const res = await request(app())
      .post('/query')
      .send({ query: 'How does auth work?', targetPath: '/tmp' });
    expect(res.status).toBe(200);
  });

  it('returns full AgentResponse', async () => {
    const res = await request(app())
      .post('/query')
      .send({ query: 'How does auth work?', targetPath: '/tmp' });
    expect(res.body.answer).toBe(fakeResponse.answer);
    expect(res.body.sessionId).toBe(fakeResponse.sessionId);
    expect(res.body.iterationCount).toBe(fakeResponse.iterationCount);
    expect(Array.isArray(res.body.filesRead)).toBe(true);
  });

  it('stores session so GET /sessions/:id returns it', async () => {
    const instance = app();
    await request(instance)
      .post('/query')
      .send({ query: 'How does auth work?', targetPath: '/tmp' });

    const res2 = await request(instance).get(`/sessions/${fakeResponse.sessionId}`);
    expect(res2.status).toBe(200);
    expect(res2.body.sessionId).toBe(fakeResponse.sessionId);
  });
});

describe('POST /query — validation errors', () => {
  it('returns 400 when query is missing', async () => {
    const res = await request(app())
      .post('/query')
      .send({ targetPath: '/tmp' });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('returns 400 when targetPath is missing', async () => {
    const res = await request(app())
      .post('/query')
      .send({ query: 'hello' });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('returns 400 when query is empty string', async () => {
    const res = await request(app())
      .post('/query')
      .send({ query: '', targetPath: '/tmp' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is empty', async () => {
    const res = await request(app()).post('/query').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /query — agent runtime error', () => {
  it('returns 500 JSON when runner throws', async () => {
    const throwingRunner: AgentRunner = {
      async run() {
        throw new Error('Anthropic API down');
      },
    };
    const res = await request(createApp({ agentRunner: throwingRunner }))
      .post('/query')
      .send({ query: 'hello', targetPath: '/tmp' });
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Anthropic API down');
  });
});

// ─── GET /sessions/:id ────────────────────────────────────────────────────────

describe('GET /sessions/:id', () => {
  it('returns 404 with error for unknown session id', async () => {
    const res = await request(app()).get('/sessions/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Session not found');
  });

  it('returns stored response after POST /query', async () => {
    const instance = app();
    await request(instance)
      .post('/query')
      .send({ query: 'hello', targetPath: '/tmp' });

    const res = await request(instance).get(`/sessions/${fakeResponse.sessionId}`);
    expect(res.status).toBe(200);
    expect(res.body.answer).toBe(fakeResponse.answer);
  });
});

// ─── GET /query/stream ────────────────────────────────────────────────────────

describe('GET /query/stream — validation', () => {
  it('returns 400 JSON when query param is missing', async () => {
    const res = await request(app()).get('/query/stream?targetPath=/tmp');
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('returns 400 JSON when targetPath param is missing', async () => {
    const res = await request(app()).get('/query/stream?query=hello');
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('returns 400 JSON when both params are missing', async () => {
    const res = await request(app()).get('/query/stream');
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });
});

describe('GET /query/stream — success', () => {
  it('returns 200', async () => {
    const res = await request(app()).get(
      '/query/stream?query=hello&targetPath=/tmp'
    );
    expect(res.status).toBe(200);
  });

  it('Content-Type includes text/event-stream', async () => {
    const res = await request(app()).get(
      '/query/stream?query=hello&targetPath=/tmp'
    );
    expect(res.headers['content-type']).toContain('text/event-stream');
  });

  it('Cache-Control includes no-cache', async () => {
    const res = await request(app()).get(
      '/query/stream?query=hello&targetPath=/tmp'
    );
    expect(res.headers['cache-control']).toContain('no-cache');
  });

  it('X-Accel-Buffering is "no"', async () => {
    const res = await request(app()).get(
      '/query/stream?query=hello&targetPath=/tmp'
    );
    expect(res.headers['x-accel-buffering']).toBe('no');
  });

  it('response body contains SSE data: lines', async () => {
    const res = await request(app()).get(
      '/query/stream?query=hello&targetPath=/tmp'
    );
    expect(res.text).toContain('data:');
  });

  it('response includes tool_call event', async () => {
    const res = await request(app()).get(
      '/query/stream?query=hello&targetPath=/tmp'
    );
    expect(res.text).toContain('"type":"tool_call"');
  });

  it('response includes final event', async () => {
    const res = await request(app()).get(
      '/query/stream?query=hello&targetPath=/tmp'
    );
    expect(res.text).toContain('"type":"final"');
  });

  it('response includes done event', async () => {
    const res = await request(app()).get(
      '/query/stream?query=hello&targetPath=/tmp'
    );
    expect(res.text).toContain('"type":"done"');
  });
});

describe('GET /query/stream — agent error after headers sent', () => {
  it('sends SSE error event and ends response cleanly', async () => {
    const errorRunner: AgentRunner = {
      async run(_q, _t, onEvent) {
        onEvent?.({ type: 'tool_call', tool: 'tree', input: { path: '/' } });
        throw new Error('mid-stream failure');
      },
    };
    const res = await request(createApp({ agentRunner: errorRunner })).get(
      '/query/stream?query=hello&targetPath=/tmp'
    );
    // Headers were already sent, so we get 200 with SSE error event
    expect(res.status).toBe(200);
    expect(res.text).toContain('"type":"error"');
    expect(res.text).toContain('mid-stream failure');
  });
});

// ─── 404 catch-all ────────────────────────────────────────────────────────────

describe('unknown routes', () => {
  it('returns 404 JSON for unknown GET route', async () => {
    const res = await request(app()).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(typeof res.body.error).toBe('string');
  });
});
