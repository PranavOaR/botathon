import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs, { writeFileSync, mkdirSync, rmSync, symlinkSync, unlinkSync } from 'fs';
import { join } from 'path';
import { treeHandler } from '../src/tools/tree';
import { readHandler } from '../src/tools/read';
import { dispatchTool } from '../src/tools/index';
import { createSession, getFileRecord } from '../src/memory/sessionStore';

const FIXTURE_DIR = join(process.cwd(), 'test-fixtures');

beforeAll(() => {
  mkdirSync(join(FIXTURE_DIR, 'src'), { recursive: true });
  mkdirSync(join(FIXTURE_DIR, 'node_modules', 'some-pkg'), { recursive: true });

  writeFileSync(
    join(FIXTURE_DIR, 'src', 'index.ts'),
    [
      "import { foo } from './foo'",
      "import express from 'express'",
      '',
      'export const bar = 42',
      "export function baz() { return 'hello' }",
    ].join('\n')
  );
  writeFileSync(
    join(FIXTURE_DIR, 'src', 'foo.ts'),
    ["export function foo() { return 'hello' }", "export const FOO_CONST = 'foo'"].join('\n')
  );
  writeFileSync(join(FIXTURE_DIR, 'README.md'), '# Test Fixture\nThis is a test.');
  writeFileSync(join(FIXTURE_DIR, 'node_modules', 'some-pkg', 'index.js'), 'module.exports = {}');
});

afterAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

// ─── tree tool ────────────────────────────────────────────────────────────────

describe('tree tool — basic listing', () => {
  it('"/" resolves to target root and lists contents', () => {
    const result = treeHandler({ path: '/' }, FIXTURE_DIR);
    expect(result.content).toContain('src/');
    expect(result.content).toContain('README.md');
    expect(result.content).not.toContain('/Users'); // no machine paths
  });

  it('"." resolves to target root', () => {
    const result = treeHandler({ path: '.' }, FIXTURE_DIR);
    expect(result.content).toContain('src/');
    expect(result.content).toContain('README.md');
  });

  it('"src" resolves inside target root', () => {
    const result = treeHandler({ path: 'src' }, FIXTURE_DIR);
    expect(result.content).toContain('index.ts');
    expect(result.content).toContain('foo.ts');
  });

  it('skips node_modules', () => {
    const result = treeHandler({ path: '.' }, FIXTURE_DIR);
    expect(result.content).not.toContain('node_modules');
    expect(result.content).not.toContain('some-pkg');
  });

  it('respects depth limit — depth 1 hides files inside subdirs', () => {
    const result = treeHandler({ path: '.' }, FIXTURE_DIR);
    const depth1 = treeHandler({ path: '.', depth: 1 }, FIXTURE_DIR);
    expect(result.content).toContain('index.ts'); // depth 3 shows it
    expect(depth1.content).toContain('src/');    // dir shows
    expect(depth1.content).not.toContain('index.ts'); // file inside does not
  });

  it('applies filter to filenames', () => {
    const result = treeHandler({ path: '.', filter: '.md' }, FIXTURE_DIR);
    expect(result.content).toContain('README.md');
    expect(result.content).not.toContain('index.ts');
  });

  it('returns error for a path that is a file, not a directory', () => {
    const result = treeHandler({ path: 'README.md' }, FIXTURE_DIR);
    expect(result.content).toContain('Not a directory');
  });

  it('returns error for a nonexistent subdirectory', () => {
    const result = treeHandler({ path: 'does-not-exist' }, FIXTURE_DIR);
    expect(result.content).toContain('not found');
  });
});

describe('tree tool — path security', () => {
  it('rejects "../../" path traversal', () => {
    const result = treeHandler({ path: '../../' }, FIXTURE_DIR);
    expect(result.content).toContain('Access denied');
  });

  it('rejects absolute path outside target', () => {
    const result = treeHandler({ path: '/tmp' }, FIXTURE_DIR);
    expect(result.content).toContain('Access denied');
  });

  it('allows absolute path that equals target root', () => {
    const result = treeHandler({ path: FIXTURE_DIR }, FIXTURE_DIR);
    expect(result.content).toContain('src/');
  });
});

// ─── read tool ────────────────────────────────────────────────────────────────

describe('read tool — basic reading', () => {
  it('reads file with line numbers and header', () => {
    const result = readHandler({ path: 'src/index.ts' }, FIXTURE_DIR);
    expect(result.content).toContain('// File:');
    expect(result.content).toContain('TypeScript');
    expect(result.content).toContain('     1 |');
    expect(result.content).toContain('import');
  });

  it('extracts imports (local and external)', () => {
    const result = readHandler({ path: 'src/index.ts' }, FIXTURE_DIR);
    expect(result.metadata?.imports).toContain('./foo');
    expect(result.metadata?.imports).toContain('express');
  });

  it('extracts exported symbols', () => {
    const result = readHandler({ path: 'src/index.ts' }, FIXTURE_DIR);
    expect(result.metadata?.exports).toContain('bar');
    expect(result.metadata?.exports).toContain('baz');
  });

  it('extracts exports from foo.ts', () => {
    const result = readHandler({ path: 'src/foo.ts' }, FIXTURE_DIR);
    expect(result.metadata?.exports).toContain('foo');
    expect(result.metadata?.exports).toContain('FOO_CONST');
  });

  it('returns structured error for missing file — no metadata', () => {
    const result = readHandler({ path: 'nonexistent.ts' }, FIXTURE_DIR);
    expect(result.content).toContain('File not found');
    expect(result.metadata).toBeUndefined();
  });

  it('reads only the specified line range', () => {
    const result = readHandler({ path: 'src/index.ts', start_line: 1, end_line: 1 }, FIXTURE_DIR);
    expect(result.content).toContain('./foo');
    expect(result.content).not.toContain('export const bar');
  });

  it('reads from start_line to end of file when end_line is omitted', () => {
    const result = readHandler({ path: 'src/index.ts', start_line: 4 }, FIXTURE_DIR);
    expect(result.content).toContain('export const bar');
    expect(result.content).not.toContain("import { foo }");
  });
});

describe('read tool — line range metadata', () => {
  it('records [1, totalLines] when no range is specified', () => {
    const result = readHandler({ path: 'src/index.ts' }, FIXTURE_DIR);
    expect(result.metadata?.lineRange).toBeDefined();
    expect(result.metadata?.lineRange?.[0]).toBe(1);
    expect(result.metadata?.lineRange?.[1]).toBeGreaterThanOrEqual(5); // file has 5 lines
  });

  it('records [start, totalLines] when only start_line is specified', () => {
    const result = readHandler({ path: 'src/index.ts', start_line: 3 }, FIXTURE_DIR);
    expect(result.metadata?.lineRange?.[0]).toBe(3);
    expect(result.metadata?.lineRange?.[1]).toBeGreaterThanOrEqual(5);
  });

  it('records [1, end] when only end_line is specified', () => {
    const result = readHandler({ path: 'src/index.ts', end_line: 2 }, FIXTURE_DIR);
    expect(result.metadata?.lineRange?.[0]).toBe(1);
    expect(result.metadata?.lineRange?.[1]).toBe(2);
  });

  it('records [start, end] when both are specified', () => {
    const result = readHandler({ path: 'src/index.ts', start_line: 2, end_line: 3 }, FIXTURE_DIR);
    expect(result.metadata?.lineRange).toEqual([2, 3]);
  });
});

describe('read tool — path security', () => {
  it('rejects "../../.env" path traversal', () => {
    const result = readHandler({ path: '../../.env' }, FIXTURE_DIR);
    expect(result.content).toContain('Access denied');
    expect(result.metadata).toBeUndefined();
  });

  it('rejects absolute path outside target', () => {
    const result = readHandler({ path: '/etc/passwd' }, FIXTURE_DIR);
    expect(result.content).toContain('Access denied');
  });

  it('allows reading via absolute path inside target', () => {
    const result = readHandler({ path: join(FIXTURE_DIR, 'src', 'foo.ts') }, FIXTURE_DIR);
    expect(result.content).toContain('foo');
    expect(result.content).not.toContain('Access denied');
  });
});

// ─── dispatchTool session updates ─────────────────────────────────────────────

describe('dispatchTool — session updates after read', () => {
  it('adds file to session with imports and exports', async () => {
    const session = createSession(FIXTURE_DIR);
    const { updatedSession } = await dispatchTool('read', { path: 'src/index.ts' }, session);
    const record = getFileRecord(updatedSession, 'src/index.ts');
    expect(record).toBeDefined();
    expect(record?.imports).toContain('./foo');
    expect(record?.exports).toContain('bar');
  });

  it('records [1, totalLines] line range in session when no range specified', async () => {
    const session = createSession(FIXTURE_DIR);
    const { updatedSession } = await dispatchTool('read', { path: 'src/index.ts' }, session);
    const record = getFileRecord(updatedSession, 'src/index.ts');
    expect(record?.linesRead[0]?.[0]).toBe(1);
    expect(record?.linesRead[0]?.[1]).toBeGreaterThanOrEqual(5);
  });

  it('records partial range in session when start_line only specified', async () => {
    const session = createSession(FIXTURE_DIR);
    const { updatedSession } = await dispatchTool('read', { path: 'src/index.ts', start_line: 3 }, session);
    const record = getFileRecord(updatedSession, 'src/index.ts');
    expect(record?.linesRead[0]?.[0]).toBe(3);
  });

  it('records partial range in session when end_line only specified', async () => {
    const session = createSession(FIXTURE_DIR);
    const { updatedSession } = await dispatchTool('read', { path: 'src/index.ts', end_line: 2 }, session);
    const record = getFileRecord(updatedSession, 'src/index.ts');
    expect(record?.linesRead[0]?.[0]).toBe(1);
    expect(record?.linesRead[0]?.[1]).toBe(2);
  });

  it('adds file to navigationOrder after read', async () => {
    const session = createSession(FIXTURE_DIR);
    const { updatedSession } = await dispatchTool('read', { path: 'src/foo.ts' }, session);
    expect(updatedSession.navigationOrder).toContain('src/foo.ts');
  });

  it('does not update session on access-denied read', async () => {
    const session = createSession(FIXTURE_DIR);
    const { updatedSession } = await dispatchTool('read', { path: '../../.env' }, session);
    expect(updatedSession.navigationOrder).toHaveLength(0);
  });

  it('does not update session for tree calls', async () => {
    const session = createSession(FIXTURE_DIR);
    const { updatedSession } = await dispatchTool('tree', { path: '.' }, session);
    expect(updatedSession.navigationOrder).toHaveLength(0);
    expect(Object.keys(updatedSession.files)).toHaveLength(0);
  });

  it('original session is not mutated', async () => {
    const session = createSession(FIXTURE_DIR);
    await dispatchTool('read', { path: 'src/index.ts' }, session);
    expect(session.navigationOrder).toHaveLength(0); // original unchanged
  });
});

// ─── symlink escape prevention ────────────────────────────────────────────────

describe('symlink escape prevention', () => {
  const fileSymlink = join(FIXTURE_DIR, 'passwd-link');
  const dirSymlink = join(FIXTURE_DIR, 'tmp-link');

  beforeAll(() => {
    try { symlinkSync('/etc/passwd', fileSymlink); } catch { /* skip if unsupported */ }
    try { symlinkSync('/tmp', dirSymlink); } catch { /* skip if unsupported */ }
  });

  afterAll(() => {
    try { unlinkSync(fileSymlink); } catch { /* ignore */ }
    try { unlinkSync(dirSymlink); } catch { /* ignore */ }
  });

  it('read blocks a file symlink pointing outside targetPath', () => {
    try {
      if (!fs.lstatSync(fileSymlink).isSymbolicLink()) return;
      if (!fs.existsSync(fileSymlink)) return;
    } catch {
      return; // symlink creation failed on this OS (e.g. Windows without privilege)
    }
    const result = readHandler({ path: 'passwd-link' }, FIXTURE_DIR);
    expect(result.content).toContain('Access denied');
    expect(result.metadata).toBeUndefined();
  });

  it('tree blocks a directory symlink pointing outside targetPath', () => {
    try {
      if (!fs.lstatSync(dirSymlink).isSymbolicLink()) return;
      if (!fs.existsSync(dirSymlink)) return;
    } catch {
      return; // symlink creation failed on this OS (e.g. Windows without privilege)
    }
    const result = treeHandler({ path: 'tmp-link' }, FIXTURE_DIR);
    expect(result.content).toContain('Access denied');
  });

  it('read returns "File not found" for genuinely missing files — not "Access denied"', () => {
    const result = readHandler({ path: 'genuinely-missing.ts' }, FIXTURE_DIR);
    expect(result.content).toContain('File not found');
    expect(result.content).not.toContain('Access denied');
  });

  it('read still works for normal files after symlinks are present in the fixture', () => {
    const result = readHandler({ path: 'src/index.ts' }, FIXTURE_DIR);
    expect(result.content).toContain('import');
    expect(result.content).not.toContain('Access denied');
  });
});

// ─── read tool — line range clamping ──────────────────────────────────────────

describe('read tool — line range clamping', () => {
  // src/index.ts has 5 lines

  it('clamps start_line > totalLines to [totalLines, totalLines]', () => {
    const result = readHandler({ path: 'src/index.ts', start_line: 9999 }, FIXTURE_DIR);
    const [start, end] = result.metadata!.lineRange!;
    expect(start).toBeGreaterThanOrEqual(1);
    expect(end).toBe(start); // both clamped to totalLines
  });

  it('clamps end_line < 1 to [1, 1]', () => {
    const result = readHandler({ path: 'src/index.ts', end_line: -5 }, FIXTURE_DIR);
    expect(result.metadata?.lineRange).toEqual([1, 1]);
  });

  it('clamps start > end to [start, start] after individual clamping', () => {
    const result = readHandler({ path: 'src/index.ts', start_line: 3, end_line: 1 }, FIXTURE_DIR);
    const [start, end] = result.metadata!.lineRange!;
    expect(start).toBeGreaterThanOrEqual(1);
    expect(end).toBe(start); // deterministic: end elevated to start
  });

  it('floors non-integer line numbers', () => {
    const result = readHandler({ path: 'src/index.ts', start_line: 1.9, end_line: 2.7 }, FIXTURE_DIR);
    expect(result.metadata?.lineRange).toEqual([1, 2]);
  });

  it('displayed header matches the actual clamped range', () => {
    const result = readHandler({ path: 'src/index.ts', start_line: 9999 }, FIXTURE_DIR);
    const [start, end] = result.metadata!.lineRange!;
    expect(result.content).toContain(`lines ${start}-${end}`);
  });
});
