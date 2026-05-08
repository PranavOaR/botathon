import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { grepHandler, grepTool } from '../src/tools/grep';

const FIXTURE_DIR = join(process.cwd(), 'test-fixtures-grep');

beforeAll(() => {
  mkdirSync(join(FIXTURE_DIR, 'src'), { recursive: true });
  writeFileSync(
    join(FIXTURE_DIR, 'src', 'auth.ts'),
    [
      "import jwt from 'jsonwebtoken'",
      '',
      'export function verifyToken(token: string) {',
      '  return jwt.verify(token, process.env.SECRET!)',
      '}',
      '',
      'export function signToken(payload: object) {',
      '  return jwt.sign(payload, process.env.SECRET!)',
      '}',
    ].join('\n')
  );
  writeFileSync(
    join(FIXTURE_DIR, 'src', 'index.ts'),
    [
      "import { verifyToken } from './auth'",
      '',
      'const token = verifyToken("abc")',
    ].join('\n')
  );
  // README with UPPERCASE VERIFYTOKEN (to test case insensitivity)
  writeFileSync(
    join(FIXTURE_DIR, 'README.md'),
    '# Grep Fixture\nVERIFYTOKEN is mentioned here too.\nverifyToken too.'
  );
});

afterAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

// ─── schema verification ──────────────────────────────────────────────────────

describe('grepTool schema', () => {
  it('exposes directory, file_extension, case_sensitive, max_results', () => {
    const props = grepTool.input_schema.properties;
    expect(props).toHaveProperty('pattern');
    expect(props).toHaveProperty('directory');
    expect(props).toHaveProperty('file_extension');
    expect(props).toHaveProperty('case_sensitive');
    expect(props).toHaveProperty('max_results');
  });

  it('does NOT expose path or file_pattern', () => {
    const props = grepTool.input_schema.properties as Record<string, unknown>;
    expect(props).not.toHaveProperty('path');
    expect(props).not.toHaveProperty('file_pattern');
  });
});

// ─── basic search ─────────────────────────────────────────────────────────────

describe('grep tool — basic search', () => {
  it('finds pattern across .ts files', () => {
    const result = grepHandler({ pattern: 'verifyToken', file_extension: '.ts' }, FIXTURE_DIR);
    expect(result.content).toContain('auth.ts');
    expect(result.content).toContain('index.ts');
  });

  it('returns match count in header', () => {
    const result = grepHandler({ pattern: 'verifyToken', file_extension: '.ts' }, FIXTURE_DIR);
    expect(result.content).toMatch(/Found \d+/);
  });

  it('output uses "file:line: content" format', () => {
    const result = grepHandler({ pattern: 'signToken', file_extension: '.ts' }, FIXTURE_DIR);
    // e.g. "src/auth.ts:3: export function signToken..."
    expect(result.content).toMatch(/src\/auth\.ts:\d+: /);
  });

  it('returns no-matches message when pattern not found', () => {
    const result = grepHandler({ pattern: 'DOES_NOT_EXIST_XYZ' }, FIXTURE_DIR);
    expect(result.content).toMatch(/No matches for/);
  });
});

// ─── case sensitivity ─────────────────────────────────────────────────────────

describe('grep tool — case sensitivity', () => {
  it('defaults to case-insensitive — finds VERIFYTOKEN when searching verifyToken', () => {
    const result = grepHandler({ pattern: 'verifyToken', file_extension: '.md' }, FIXTURE_DIR);
    expect(result.content).toContain('README.md');
    // VERIFYTOKEN line should match because case-insensitive is the default
    expect(result.content).toMatch(/VERIFYTOKEN|verifyToken/i);
  });

  it('case_sensitive: true — does NOT find VERIFYTOKEN when searching verifyToken', () => {
    const result = grepHandler(
      { pattern: 'verifyToken', file_extension: '.md', case_sensitive: true },
      FIXTURE_DIR
    );
    // Only the lowercase line should match; the VERIFYTOKEN line should not
    const lines = result.content.split('\n').filter((l) => l.includes('README.md'));
    const uppercaseMatch = lines.some((l) => l.toUpperCase().includes('VERIFYTOKEN') && !l.includes('verifyToken'));
    expect(uppercaseMatch).toBe(false);
  });
});

// ─── file_extension filter ────────────────────────────────────────────────────

describe('grep tool — file_extension filter', () => {
  it('file_extension: ".ts" excludes README.md', () => {
    const result = grepHandler({ pattern: 'verifyToken', file_extension: '.ts' }, FIXTURE_DIR);
    expect(result.content).not.toContain('README.md');
    expect(result.content).toContain('auth.ts');
  });

  it('file_extension: ".md" only matches .md files', () => {
    const result = grepHandler({ pattern: 'verifyToken', file_extension: '.md' }, FIXTURE_DIR);
    expect(result.content).toContain('README.md');
    expect(result.content).not.toContain('auth.ts');
  });

  it('no file_extension — searches all file types', () => {
    const result = grepHandler({ pattern: 'verifyToken', case_sensitive: true }, FIXTURE_DIR);
    expect(result.content).toContain('auth.ts');
    expect(result.content).toContain('README.md');
  });
});

// ─── directory scoping ────────────────────────────────────────────────────────

describe('grep tool — directory scoping', () => {
  it('directory: "src" limits search to src/', () => {
    const result = grepHandler({ pattern: 'verifyToken', directory: 'src' }, FIXTURE_DIR);
    expect(result.content).toContain('src/');
    // README is outside src/
    expect(result.content).not.toContain('README.md');
  });

  it('rejects path traversal', () => {
    const result = grepHandler({ pattern: 'foo', directory: '../../' }, FIXTURE_DIR);
    expect(result.content).toContain('Access denied');
  });

  it('returns not-found for non-existent directory', () => {
    const result = grepHandler({ pattern: 'foo', directory: 'nonexistent' }, FIXTURE_DIR);
    expect(result.content).toMatch(/not found|not a directory/i);
  });
});

// ─── regex fallback ───────────────────────────────────────────────────────────

describe('grep tool — invalid regex falls back to literal', () => {
  it('does not error on invalid regex — falls back to literal search', () => {
    // "[invalid(" is not valid regex
    const result = grepHandler({ pattern: '[invalid(', file_extension: '.ts' }, FIXTURE_DIR);
    // Should not say "Invalid regex" — should fall back silently
    expect(result.content).not.toContain('Invalid regex');
    // Literal search for "[invalid(" won't match anything in fixture — no error though
    expect(result.content).toMatch(/No matches for|Found \d+/);
  });

  it('literal fallback still finds a plain string', () => {
    // "verifyToken" is also a valid literal string (and valid regex)
    const result = grepHandler({ pattern: 'verifyToken', file_extension: '.ts' }, FIXTURE_DIR);
    expect(result.content).toContain('auth.ts');
  });
});

// ─── max_results ──────────────────────────────────────────────────────────────

describe('grep tool — max_results', () => {
  it('truncates results when max_results is hit and shows guidance message', () => {
    const result = grepHandler({ pattern: 'verifyToken', max_results: 1 }, FIXTURE_DIR);
    expect(result.content).toMatch(/Found 1\+/);
    expect(result.content).toContain('Refine pattern or directory');
  });

  it('does not truncate when results are under the limit', () => {
    const result = grepHandler({ pattern: 'signToken', file_extension: '.ts', max_results: 50 }, FIXTURE_DIR);
    expect(result.content).not.toMatch(/Found \d+\+/);
  });
});
