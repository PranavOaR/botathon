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

describe('summarizeHandler — basic behaviour', () => {
  it('calls summarizeFile with file content and returns the summary', async () => {
    const summarizeFile = vi.fn().mockResolvedValue('This file exports verifyToken.');
    const result = await summarizeHandler(
      { path: 'src/auth.ts' },
      FIXTURE_DIR,
      undefined,
      { summarizeFile }
    );
    expect(summarizeFile).toHaveBeenCalledOnce();
    expect(result.content).toContain('This file exports verifyToken.');
    expect(result.summary).toBe('This file exports verifyToken.');
  });

  it('returns the cached summary without calling summarizeFile', async () => {
    const summarizeFile = vi.fn();
    const result = await summarizeHandler(
      { path: 'src/auth.ts' },
      FIXTURE_DIR,
      'cached summary',
      { summarizeFile }
    );
    expect(summarizeFile).not.toHaveBeenCalled();
    expect(result.content).toContain('cached summary');
  });

  it('returns error for a missing file', async () => {
    const summarizeFile = vi.fn();
    const result = await summarizeHandler(
      { path: 'nonexistent.ts' },
      FIXTURE_DIR,
      undefined,
      { summarizeFile }
    );
    expect(result.content).toContain('not found');
    expect(summarizeFile).not.toHaveBeenCalled();
  });

  it('returns error for path traversal', async () => {
    const summarizeFile = vi.fn();
    const result = await summarizeHandler(
      { path: '../../etc/passwd' },
      FIXTURE_DIR,
      undefined,
      { summarizeFile }
    );
    expect(result.content).toContain('Access denied');
    expect(summarizeFile).not.toHaveBeenCalled();
  });

  it('returns fallback when no summarizeFile dep is provided', async () => {
    const result = await summarizeHandler(
      { path: 'src/auth.ts' },
      FIXTURE_DIR,
      undefined,
      {}
    );
    expect(result.content).toContain('not available');
  });
});

describe('dispatchTool — summarize integration', () => {
  it('stores the returned summary in the session', async () => {
    const session = createSession(FIXTURE_DIR);
    const summarizeFile = vi.fn().mockResolvedValue('auth file summary');
    const { updatedSession } = await dispatchTool(
      'summarize',
      { path: 'src/auth.ts' },
      session,
      { summarizeFile }
    );
    const record = getFileRecord(updatedSession, 'src/auth.ts');
    expect(record?.summary).toBe('auth file summary');
  });

  it('uses cached summary from session on second call', async () => {
    const session = createSession(FIXTURE_DIR);
    const summarizeFile = vi.fn().mockResolvedValue('auth file summary');

    const { updatedSession: s1 } = await dispatchTool(
      'summarize',
      { path: 'src/auth.ts' },
      session,
      { summarizeFile }
    );

    const { updatedSession: s2 } = await dispatchTool(
      'summarize',
      { path: 'src/auth.ts' },
      s1,
      { summarizeFile }
    );

    expect(summarizeFile).toHaveBeenCalledTimes(1); // not called again
    expect(getFileRecord(s2, 'src/auth.ts')?.summary).toBe('auth file summary');
  });
});
