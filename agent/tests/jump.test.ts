import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { jumpHandler, jumpTool } from '../src/tools/jump';
import { createImportGraph, addEdge } from '../src/memory/importGraph';
import { dispatchTool } from '../src/tools/index';
import { createSession } from '../src/memory/sessionStore';

const FIXTURE_DIR = join(process.cwd(), 'test-fixtures-jump');

beforeAll(() => {
  mkdirSync(join(FIXTURE_DIR, 'src', 'utils'), { recursive: true });

  writeFileSync(
    join(FIXTURE_DIR, 'src', 'utils', 'jwt.ts'),
    [
      "import { createHmac } from 'crypto'",
      '',
      'export interface JwtPayload {',
      '  userId: string',
      '}',
      '',
      'export function verifyToken(token: string): JwtPayload | null {',
      '  return null',
      '}',
      '',
      'export const MAX_AGE = 3600',
      '',
      'export class TokenCache {',
      '  private store = new Map<string, boolean>()',
      '}',
      '',
      'export type UserId = string',
      '',
      'export enum Role { Admin = "admin", User = "user" }',
    ].join('\n')
  );

  writeFileSync(
    join(FIXTURE_DIR, 'src', 'middleware.ts'),
    [
      "import { verifyToken } from './utils/jwt'",
      '',
      'export function authenticate(header: string | undefined) {',
      '  return header ? verifyToken(header) : null',
      '}',
    ].join('\n')
  );
});

afterAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

// ─── schema verification ──────────────────────────────────────────────────────

describe('jumpTool schema', () => {
  it('exposes symbol and from_file', () => {
    const props = jumpTool.input_schema.properties;
    expect(props).toHaveProperty('symbol');
    expect(props).toHaveProperty('from_file');
  });

  it('does NOT expose path', () => {
    const props = jumpTool.input_schema.properties as Record<string, unknown>;
    expect(props).not.toHaveProperty('path');
  });

  it('only requires symbol', () => {
    expect(jumpTool.input_schema.required).toEqual(['symbol']);
  });
});

// ─── basic symbol lookup (no graph) ──────────────────────────────────────────

describe('jump tool — basic symbol lookup', () => {
  const emptyGraph = createImportGraph();

  it('finds an exported function definition', () => {
    const result = jumpHandler({ symbol: 'verifyToken' }, FIXTURE_DIR, emptyGraph);
    expect(result.content).toContain('Defined in:');
    expect(result.content).toContain('jwt.ts');
    expect(result.content).toContain('verifyToken');
  });

  it('output includes "Symbol:", "Defined in:", "Definition:"', () => {
    const result = jumpHandler({ symbol: 'verifyToken' }, FIXTURE_DIR, emptyGraph);
    expect(result.content).toContain('Symbol: verifyToken');
    expect(result.content).toMatch(/Defined in:.*jwt\.ts/);
    expect(result.content).toContain('Definition:');
  });

  it('includes line number in "Defined in:"', () => {
    const result = jumpHandler({ symbol: 'verifyToken' }, FIXTURE_DIR, emptyGraph);
    expect(result.content).toMatch(/Defined in:.*\(line \d+\)/);
  });

  it('finds an exported const', () => {
    const result = jumpHandler({ symbol: 'MAX_AGE' }, FIXTURE_DIR, emptyGraph);
    expect(result.content).toContain('Defined in:');
    expect(result.content).toContain('jwt.ts');
  });

  it('finds an exported class', () => {
    const result = jumpHandler({ symbol: 'TokenCache' }, FIXTURE_DIR, emptyGraph);
    expect(result.content).toContain('TokenCache');
    expect(result.content).toContain('Defined in:');
  });

  it('finds an exported interface', () => {
    const result = jumpHandler({ symbol: 'JwtPayload' }, FIXTURE_DIR, emptyGraph);
    expect(result.content).toContain('JwtPayload');
  });

  it('finds an exported type alias', () => {
    const result = jumpHandler({ symbol: 'UserId' }, FIXTURE_DIR, emptyGraph);
    expect(result.content).toContain('UserId');
  });

  it('finds an exported enum', () => {
    const result = jumpHandler({ symbol: 'Role' }, FIXTURE_DIR, emptyGraph);
    expect(result.content).toContain('Role');
  });

  it('returns "Symbol not found" for unknown symbol', () => {
    const result = jumpHandler({ symbol: 'doesNotExistXyz' }, FIXTURE_DIR, emptyGraph);
    expect(result.content).toContain('Symbol not found: doesNotExistXyz');
  });

  it('suggests grep("symbol") when not found', () => {
    const result = jumpHandler({ symbol: 'doesNotExistXyz' }, FIXTURE_DIR, emptyGraph);
    expect(result.content).toContain('Try grep("doesNotExistXyz")');
  });
});

// ─── from_file + importGraph priority ─────────────────────────────────────────

describe('jump tool — from_file + importGraph', () => {
  it('prefers imported files when from_file is provided', () => {
    // Manually build the graph: middleware imports jwt
    let graph = createImportGraph();
    graph = addEdge(graph, 'src/middleware.ts', 'src/utils/jwt.ts');

    const result = jumpHandler(
      { symbol: 'verifyToken', from_file: 'src/middleware.ts' },
      FIXTURE_DIR,
      graph
    );
    expect(result.content).toMatch(/Defined in:.*jwt\.ts/);
    expect(result.content).toContain('Symbol: verifyToken');
  });

  it('includes "Imported by:" section showing the importing file', async () => {
    // Use dispatchTool to read middleware and populate graph, then jump
    let session = createSession(FIXTURE_DIR);
    const { updatedSession } = await dispatchTool('read', { path: 'src/middleware.ts' }, session);
    session = updatedSession;

    const { output } = await dispatchTool(
      'jump',
      { symbol: 'verifyToken', from_file: 'src/middleware.ts' },
      session
    );
    expect(output.content).toContain('Defined in:');
    expect(output.content).toMatch(/Imported by:/);
    expect(output.content).toContain('src/middleware.ts');
  });

  it('after read populates importGraph edge middleware→jwt', async () => {
    let session = createSession(FIXTURE_DIR);
    const { updatedSession } = await dispatchTool('read', { path: 'src/middleware.ts' }, session);
    session = updatedSession;

    // importGraph should have the edge
    const { getImports } = await import('../src/memory/importGraph');
    const imports = getImports(session.importGraph, 'src/middleware.ts');
    expect(imports).toContain('src/utils/jwt.ts');
  });
});

// ─── path security ────────────────────────────────────────────────────────────

describe('jump tool — path security', () => {
  const emptyGraph = createImportGraph();

  it('rejects from_file with path traversal', () => {
    const result = jumpHandler({ symbol: 'foo', from_file: '../../etc/passwd' }, FIXTURE_DIR, emptyGraph);
    expect(result.content).toContain('Access denied');
  });
});
