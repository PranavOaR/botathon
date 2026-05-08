import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { summarizeHandler } from '../src/tools/summarize';
import { dispatchTool } from '../src/tools/index';
import { createSession, getFileRecord } from '../src/memory/sessionStore';

const FIXTURE_DIR = join(process.cwd(), 'test-fixtures-summarize');

beforeAll(() => {
  mkdirSync(join(FIXTURE_DIR, 'src'), { recursive: true });
  writeFileSync(
    join(FIXTURE_DIR, 'src', 'auth.ts'),
    'export function verifyToken(t: string) { return true }'
  );
});

afterAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

// ─── summarizeHandler — direct unit tests ─────────────────────────────────────

describe('summarizeHandler — basic behaviour', () => {
  it('calls summarizeFile with file content and returns the summary', async () => {
    const summarizeFile = vi.fn().mockResolvedValue('This file exports verifyToken.');
    const result = await summarizeHandler('src/auth.ts', FIXTURE_DIR, undefined, { summarizeFile });
    expect(summarizeFile).toHaveBeenCalledOnce();
    expect(result.content).toContain('This file exports verifyToken.');
    expect(result.summary).toBe('This file exports verifyToken.');
  });

  it('returns cached summary without calling summarizeFile', async () => {
    const summarizeFile = vi.fn();
    const result = await summarizeHandler('src/auth.ts', FIXTURE_DIR, 'cached text', {
      summarizeFile,
    });
    expect(summarizeFile).not.toHaveBeenCalled();
    expect(result.content).toContain('cached text');
  });

  it('cached output includes [cached] tag', async () => {
    const summarizeFile = vi.fn();
    const result = await summarizeHandler('src/auth.ts', FIXTURE_DIR, 'cached text', {
      summarizeFile,
    });
    expect(result.content).toContain('[cached]');
  });

  it('returns error for a missing file without calling summarizeFile', async () => {
    const summarizeFile = vi.fn();
    const result = await summarizeHandler('nonexistent.ts', FIXTURE_DIR, undefined, {
      summarizeFile,
    });
    expect(result.content).toMatch(/not found|not a file/i);
    expect(summarizeFile).not.toHaveBeenCalled();
  });

  it('returns fallback when no summarizeFile dep is provided', async () => {
    const result = await summarizeHandler('src/auth.ts', FIXTURE_DIR, undefined, {});
    expect(result.content).toContain('not available');
  });
});

// ─── dispatchTool — summarize integration ─────────────────────────────────────

describe('dispatchTool — summarize cache semantics', () => {
  it('first call invokes summarizeFile and stores summary in session', async () => {
    const summarizeFile = vi.fn().mockResolvedValue('auth file summary');
    const session = createSession(FIXTURE_DIR);
    const { updatedSession } = await dispatchTool('summarize', { path: 'src/auth.ts' }, session, {
      summarizeFile,
    });
    const record = getFileRecord(updatedSession, 'src/auth.ts');
    expect(record?.summary).toBe('auth file summary');
    expect(summarizeFile).toHaveBeenCalledTimes(1);
  });

  it('second call with same relative path returns [cached] without re-calling summarizeFile', async () => {
    const summarizeFile = vi.fn().mockResolvedValue('auth file summary');
    const session = createSession(FIXTURE_DIR);

    const { updatedSession: s1 } = await dispatchTool('summarize', { path: 'src/auth.ts' }, session, {
      summarizeFile,
    });
    const { output: out2 } = await dispatchTool('summarize', { path: 'src/auth.ts' }, s1, {
      summarizeFile,
    });

    expect(summarizeFile).toHaveBeenCalledTimes(1);
    expect(out2.content).toContain('[cached]');
  });

  it('second call with absolute path inside target also returns [cached]', async () => {
    const summarizeFile = vi.fn().mockResolvedValue('auth file summary');
    const session = createSession(FIXTURE_DIR);

    const { updatedSession: s1 } = await dispatchTool('summarize', { path: 'src/auth.ts' }, session, {
      summarizeFile,
    });

    const absolutePath = join(FIXTURE_DIR, 'src', 'auth.ts');
    const { output: out2 } = await dispatchTool('summarize', { path: absolutePath }, s1, {
      summarizeFile,
    });

    expect(summarizeFile).toHaveBeenCalledTimes(1);
    expect(out2.content).toContain('[cached]');
  });

  it('access-denied path does not call summarizeFile', async () => {
    const summarizeFile = vi.fn();
    const session = createSession(FIXTURE_DIR);
    const { output } = await dispatchTool('summarize', { path: '../../etc/passwd' }, session, {
      summarizeFile,
    });
    expect(output.content).toContain('Access denied');
    expect(summarizeFile).not.toHaveBeenCalled();
  });

  it('missing file does not call summarizeFile', async () => {
    const summarizeFile = vi.fn();
    const session = createSession(FIXTURE_DIR);
    const { output } = await dispatchTool('summarize', { path: 'src/missing.ts' }, session, {
      summarizeFile,
    });
    expect(output.content).toMatch(/not found|File not found/i);
    expect(summarizeFile).not.toHaveBeenCalled();
  });
});
