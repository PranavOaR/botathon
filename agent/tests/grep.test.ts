import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { grepHandler } from '../src/tools/grep';

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
  writeFileSync(join(FIXTURE_DIR, 'README.md'), '# Grep Fixture\nverifyToken is used here too.');
});

afterAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

describe('grep tool — basic search', () => {
  it('finds a simple pattern across files', () => {
    const result = grepHandler({ pattern: 'verifyToken' }, FIXTURE_DIR);
    expect(result.content).toContain('auth.ts');
    expect(result.content).toContain('index.ts');
  });

  it('returns match count in header', () => {
    const result = grepHandler({ pattern: 'verifyToken' }, FIXTURE_DIR);
    expect(result.content).toMatch(/Found \d+/);
  });

  it('returns no matches message when pattern not found', () => {
    const result = grepHandler({ pattern: 'DOES_NOT_EXIST_XYZ' }, FIXTURE_DIR);
    expect(result.content).toContain('No matches found');
  });

  it('returns error for invalid regex', () => {
    const result = grepHandler({ pattern: '[invalid(' }, FIXTURE_DIR);
    expect(result.content).toContain('Invalid regex');
  });

  it('includes line numbers in output', () => {
    const result = grepHandler({ pattern: 'signToken' }, FIXTURE_DIR);
    // Line numbers are padded and followed by "|"
    expect(result.content).toMatch(/\d+ \|/);
  });
});

describe('grep tool — path scoping', () => {
  it('restricts search to specified subdirectory', () => {
    const result = grepHandler({ pattern: 'verifyToken', path: 'src' }, FIXTURE_DIR);
    expect(result.content).toContain('src/auth.ts');
  });

  it('rejects path traversal', () => {
    const result = grepHandler({ pattern: 'foo', path: '../../' }, FIXTURE_DIR);
    expect(result.content).toContain('Access denied');
  });

  it('returns not found for non-existent path', () => {
    const result = grepHandler({ pattern: 'foo', path: 'nonexistent' }, FIXTURE_DIR);
    expect(result.content).toContain('not found');
  });
});

describe('grep tool — file_pattern filter', () => {
  it('filters by *.ts — excludes .md files', () => {
    const result = grepHandler({ pattern: 'verifyToken', file_pattern: '*.ts' }, FIXTURE_DIR);
    expect(result.content).not.toContain('README.md');
    expect(result.content).toContain('auth.ts');
  });

  it('filters by *.md — only .md files', () => {
    const result = grepHandler({ pattern: 'verifyToken', file_pattern: '*.md' }, FIXTURE_DIR);
    expect(result.content).toContain('README.md');
    expect(result.content).not.toContain('auth.ts');
  });
});

describe('grep tool — max_results', () => {
  it('truncates results and appends "+" to count when max_results is hit', () => {
    const result = grepHandler({ pattern: 'verifyToken', max_results: 1 }, FIXTURE_DIR);
    expect(result.content).toMatch(/Found 1\+/);
  });

  it('does not append "+" when results are under the limit', () => {
    const result = grepHandler({ pattern: 'signToken', max_results: 50 }, FIXTURE_DIR);
    expect(result.content).not.toMatch(/Found \d+\+/);
  });
});
