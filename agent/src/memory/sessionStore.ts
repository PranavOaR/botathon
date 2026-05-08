import { randomUUID } from 'crypto';
import { createImportGraph } from './importGraph';
import type { FileRecord, SessionState } from '../types';

export function createSession(targetPath: string): SessionState {
  return {
    sessionId: randomUUID(),
    targetPath,
    files: {},
    navigationOrder: [],
    importGraph: createImportGraph(),
    startTime: Date.now(),
  };
}

export function getFileRecord(session: SessionState, filePath: string): FileRecord | undefined {
  return session.files[filePath];
}

export function upsertFileRecord(
  session: SessionState,
  filePath: string,
  updates: Partial<Omit<FileRecord, 'path'>>
): SessionState {
  const existing: FileRecord = session.files[filePath] ?? {
    path: filePath,
    linesRead: [],
    imports: [],
    exports: [],
    lastAccessed: Date.now(),
  };

  const updated: FileRecord = { ...existing, ...updates, lastAccessed: Date.now() };

  const navigationOrder = session.navigationOrder.includes(filePath)
    ? session.navigationOrder
    : [...session.navigationOrder, filePath];

  return {
    ...session,
    files: { ...session.files, [filePath]: updated },
    navigationOrder,
  };
}

export function addLineRange(
  session: SessionState,
  filePath: string,
  start: number,
  end: number
): SessionState {
  const record = session.files[filePath];
  if (!record) return session;
  return upsertFileRecord(session, filePath, {
    linesRead: [...record.linesRead, [start, end]],
  });
}

export function getSummary(session: SessionState, filePath: string): string | undefined {
  return session.files[filePath]?.summary;
}

export function getFilesRead(session: SessionState): string[] {
  return [...session.navigationOrder];
}

export function getNavigationTrace(
  session: SessionState
): Array<{ path: string; lastAccessed: number }> {
  return session.navigationOrder.map((p) => ({
    path: p,
    lastAccessed: session.files[p]?.lastAccessed ?? 0,
  }));
}
