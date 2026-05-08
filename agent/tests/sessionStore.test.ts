import { describe, it, expect } from 'vitest';
import {
  createSession,
  getFileRecord,
  upsertFileRecord,
  addLineRange,
  getSummary,
  getFilesRead,
  getNavigationTrace,
} from '../src/memory/sessionStore';

describe('sessionStore', () => {
  it('creates a session with unique id and empty state', () => {
    const s1 = createSession('/repo');
    const s2 = createSession('/repo');
    expect(s1.sessionId).toBeTruthy();
    expect(s2.sessionId).toBeTruthy();
    expect(s1.sessionId).not.toBe(s2.sessionId);
    expect(s1.files).toEqual({});
    expect(s1.navigationOrder).toEqual([]);
  });

  it('upsertFileRecord adds a new record immutably', () => {
    const original = createSession('/repo');
    const updated = upsertFileRecord(original, 'src/index.ts', { imports: ['./foo'], exports: ['bar'] });

    // original is unchanged
    expect(original.files['src/index.ts']).toBeUndefined();
    expect(original.navigationOrder).toEqual([]);

    // updated has the new record
    expect(updated.files['src/index.ts']).toBeDefined();
    expect(updated.files['src/index.ts']?.imports).toEqual(['./foo']);
    expect(updated.files['src/index.ts']?.exports).toEqual(['bar']);
    expect(updated.navigationOrder).toContain('src/index.ts');
  });

  it('upsertFileRecord merges fields on second call', () => {
    let session = createSession('/repo');
    session = upsertFileRecord(session, 'src/foo.ts', { imports: ['fs'] });
    session = upsertFileRecord(session, 'src/foo.ts', { summary: 'Utility module' });

    const record = getFileRecord(session, 'src/foo.ts');
    expect(record?.imports).toEqual(['fs']);
    expect(record?.summary).toBe('Utility module');
  });

  it('does not duplicate entries in navigationOrder', () => {
    let session = createSession('/repo');
    session = upsertFileRecord(session, 'src/a.ts', {});
    session = upsertFileRecord(session, 'src/a.ts', { summary: 'A' });
    expect(session.navigationOrder.filter((p) => p === 'src/a.ts').length).toBe(1);
  });

  it('addLineRange tracks read ranges immutably', () => {
    let session = createSession('/repo');
    session = upsertFileRecord(session, 'src/big.ts', {});
    const before = session;
    session = addLineRange(session, 'src/big.ts', 1, 50);
    session = addLineRange(session, 'src/big.ts', 100, 150);

    // before is unchanged
    expect(before.files['src/big.ts']?.linesRead).toEqual([]);
    expect(session.files['src/big.ts']?.linesRead).toEqual([[1, 50], [100, 150]]);
  });

  it('getSummary returns undefined when no summary set', () => {
    const session = createSession('/repo');
    expect(getSummary(session, 'anything.ts')).toBeUndefined();
  });

  it('getSummary returns the cached summary', () => {
    let session = createSession('/repo');
    session = upsertFileRecord(session, 'src/auth.ts', { summary: 'Auth middleware' });
    expect(getSummary(session, 'src/auth.ts')).toBe('Auth middleware');
  });

  it('getFilesRead returns files in navigation order', () => {
    let session = createSession('/repo');
    session = upsertFileRecord(session, 'src/a.ts', {});
    session = upsertFileRecord(session, 'src/b.ts', {});
    session = upsertFileRecord(session, 'src/c.ts', {});
    expect(getFilesRead(session)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  it('getNavigationTrace includes path and lastAccessed', () => {
    let session = createSession('/repo');
    session = upsertFileRecord(session, 'src/main.ts', {});
    const trace = getNavigationTrace(session);
    expect(trace).toHaveLength(1);
    expect(trace[0]?.path).toBe('src/main.ts');
    expect(typeof trace[0]?.lastAccessed).toBe('number');
  });
});
