import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { jumpHandler } from '../src/tools/jump';

const FIXTURE_DIR = join(process.cwd(), 'test-fixtures-jump');

beforeAll(() => {
  mkdirSync(join(FIXTURE_DIR, 'src'), { recursive: true });
  writeFileSync(
    join(FIXTURE_DIR, 'src', 'utils.ts'),
    [
      'export function verifyToken(token: string): boolean {',
      '  return token.length > 0',
      '}',
      '',
      'export const MAX_RETRIES = 3',
      '',
      'export class TokenCache {',
      '  private store = new Map<string, boolean>()',
      '}',
      '',
      'export interface AuthConfig {',
      '  secret: string',
      '}',
      '',
      'export type UserId = string',
      '',
      'export enum Role { Admin = "admin", User = "user" }',
    ].join('\n')
  );
  writeFileSync(
    join(FIXTURE_DIR, 'src', 'handlers.ts'),
    [
      "import { verifyToken } from './utils'",
      '',
      'export const handleLogin = async (req: Request) => {',
      '  return verifyToken(req.headers.get("token") ?? "")',
      '}',
    ].join('\n')
  );
});

afterAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

describe('jump tool — symbol lookup', () => {
  it('finds a function definition', () => {
    const result = jumpHandler({ symbol: 'verifyToken' }, FIXTURE_DIR);
    expect(result.content).toContain('utils.ts');
    expect(result.content).toContain('verifyToken');
  });

  it('includes line number in result', () => {
    const result = jumpHandler({ symbol: 'verifyToken' }, FIXTURE_DIR);
    expect(result.content).toMatch(/utils\.ts:\d+/);
  });

  it('finds a const variable definition', () => {
    const result = jumpHandler({ symbol: 'MAX_RETRIES' }, FIXTURE_DIR);
    expect(result.content).toContain('utils.ts');
    expect(result.content).toContain('MAX_RETRIES');
  });

  it('finds a class definition', () => {
    const result = jumpHandler({ symbol: 'TokenCache' }, FIXTURE_DIR);
    expect(result.content).toContain('utils.ts');
    expect(result.content).toContain('TokenCache');
  });

  it('finds an interface definition', () => {
    const result = jumpHandler({ symbol: 'AuthConfig' }, FIXTURE_DIR);
    expect(result.content).toContain('utils.ts');
    expect(result.content).toContain('AuthConfig');
  });

  it('finds a type alias', () => {
    const result = jumpHandler({ symbol: 'UserId' }, FIXTURE_DIR);
    expect(result.content).toContain('utils.ts');
    expect(result.content).toContain('UserId');
  });

  it('finds an enum definition', () => {
    const result = jumpHandler({ symbol: 'Role' }, FIXTURE_DIR);
    expect(result.content).toContain('utils.ts');
    expect(result.content).toContain('Role');
  });

  it('finds an arrow function const', () => {
    const result = jumpHandler({ symbol: 'handleLogin' }, FIXTURE_DIR);
    expect(result.content).toContain('handlers.ts');
  });

  it('returns "No definition found" for unknown symbol', () => {
    const result = jumpHandler({ symbol: 'doesNotExistXyz' }, FIXTURE_DIR);
    expect(result.content).toContain('No definition found');
  });
});

describe('jump tool — path scoping', () => {
  it('restricts search to a specific file', () => {
    const result = jumpHandler({ symbol: 'verifyToken', path: 'src/utils.ts' }, FIXTURE_DIR);
    expect(result.content).toContain('utils.ts');
  });

  it('rejects path traversal', () => {
    const result = jumpHandler({ symbol: 'foo', path: '../../' }, FIXTURE_DIR);
    expect(result.content).toContain('Access denied');
  });

  it('returns not found for non-existent path', () => {
    const result = jumpHandler({ symbol: 'foo', path: 'nonexistent' }, FIXTURE_DIR);
    expect(result.content).toContain('not found');
  });
});
