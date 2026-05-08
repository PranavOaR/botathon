import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { treeHandler } from '../src/tools/tree';
import { readHandler } from '../src/tools/read';

const FIXTURE_DIR = join(process.cwd(), 'test-fixtures');

beforeAll(() => {
  mkdirSync(join(FIXTURE_DIR, 'src'), { recursive: true });
  mkdirSync(join(FIXTURE_DIR, 'node_modules', 'some-pkg'), { recursive: true });

  writeFileSync(
    join(FIXTURE_DIR, 'src', 'index.ts'),
    `import { foo } from './foo'\nimport express from 'express'\n\nexport const bar = 42\nexport function baz() { return 'hello' }`
  );
  writeFileSync(
    join(FIXTURE_DIR, 'src', 'foo.ts'),
    `export function foo() { return 'hello' }\nexport const FOO_CONST = 'foo'`
  );
  writeFileSync(join(FIXTURE_DIR, 'README.md'), '# Test Fixture\nThis is a test.');
  writeFileSync(join(FIXTURE_DIR, 'node_modules', 'some-pkg', 'index.js'), 'module.exports = {}');
});

afterAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

describe('tree tool', () => {
  it('returns directory structure', () => {
    const result = treeHandler({ path: FIXTURE_DIR });
    expect(result.content).toContain('src/');
    expect(result.content).toContain('index.ts');
    expect(result.content).toContain('README.md');
  });

  it('skips node_modules', () => {
    const result = treeHandler({ path: FIXTURE_DIR });
    expect(result.content).not.toContain('node_modules');
    expect(result.content).not.toContain('some-pkg');
  });

  it('returns error message for nonexistent path', () => {
    const result = treeHandler({ path: '/nonexistent/path/xyz123' });
    expect(result.content).toContain('not found');
  });

  it('returns error message for a file path', () => {
    const result = treeHandler({ path: join(FIXTURE_DIR, 'README.md') });
    expect(result.content).toContain('Not a directory');
  });

  it('respects depth limit — depth 1 hides files inside subdirs', () => {
    const result = treeHandler({ path: FIXTURE_DIR, depth: 1 });
    expect(result.content).toContain('src/');
    expect(result.content).not.toContain('index.ts');
  });

  it('applies filter to filenames', () => {
    const result = treeHandler({ path: FIXTURE_DIR, filter: '.md' });
    expect(result.content).toContain('README.md');
    // index.ts should not show (filter only matches .md, and dirs pass through)
    expect(result.content).not.toContain('index.ts');
  });
});

describe('read tool', () => {
  it('reads file and adds line numbers', () => {
    const result = readHandler({ path: join(FIXTURE_DIR, 'src', 'index.ts') });
    expect(result.content).toContain('     1 |');
    expect(result.content).toContain('import');
  });

  it('includes file metadata header', () => {
    const result = readHandler({ path: join(FIXTURE_DIR, 'src', 'index.ts') });
    expect(result.content).toContain('// File:');
    expect(result.content).toContain('TypeScript');
  });

  it('extracts imports (local and external)', () => {
    const result = readHandler({ path: join(FIXTURE_DIR, 'src', 'index.ts') });
    expect(result.metadata?.imports).toContain('./foo');
    expect(result.metadata?.imports).toContain('express');
  });

  it('extracts exported symbols', () => {
    const result = readHandler({ path: join(FIXTURE_DIR, 'src', 'index.ts') });
    expect(result.metadata?.exports).toContain('bar');
    expect(result.metadata?.exports).toContain('baz');
  });

  it('returns structured error for missing file', () => {
    const result = readHandler({ path: '/nonexistent/file.ts' });
    expect(result.content).toContain('File not found');
    expect(result.metadata).toBeUndefined();
  });

  it('reads only the specified line range', () => {
    const result = readHandler({ path: join(FIXTURE_DIR, 'src', 'index.ts'), start_line: 1, end_line: 1 });
    expect(result.content).toContain("./foo");
    // Line 4 (export const bar) should NOT be in the slice
    expect(result.content).not.toContain('export const bar');
  });

  it('reads from a start line to end of file when end_line is omitted', () => {
    const result = readHandler({ path: join(FIXTURE_DIR, 'src', 'index.ts'), start_line: 4 });
    expect(result.content).toContain('export const bar');
    expect(result.content).not.toContain('import { foo }');
  });
});

describe('read tool — export parsing from foo.ts', () => {
  it('extracts exports from foo.ts', () => {
    const result = readHandler({ path: join(FIXTURE_DIR, 'src', 'foo.ts') });
    expect(result.metadata?.exports).toContain('foo');
    expect(result.metadata?.exports).toContain('FOO_CONST');
  });
});
