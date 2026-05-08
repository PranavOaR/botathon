import type { ImportGraph } from './memory/importGraph';

export interface FileRecord {
  path: string;
  summary?: string;
  linesRead: Array<[number, number]>;
  imports: string[];
  exports: string[];
  lastAccessed: number;
}

export interface SessionState {
  sessionId: string;
  targetPath: string;
  files: Record<string, FileRecord>;
  navigationOrder: string[];
  importGraph: ImportGraph;
  startTime: number;
}

export type ToolName = 'tree' | 'read' | 'grep' | 'jump' | 'summarize';

export interface ToolOutput {
  content: string;
  metadata?: {
    /** Display path (relative to target root) — used as session key */
    filePath?: string;
    imports?: string[];
    exports?: string[];
    /** Actual [start, end] line range that was read */
    lineRange?: [number, number];
  };
}

export interface AgentEvent {
  type: 'tool_call' | 'tool_result' | 'final' | 'done' | 'error';
  tool?: string;
  input?: Record<string, unknown>;
  summary?: string;
  content?: string;
  iterationCount?: number;
  error?: string;
}

export interface AgentResponse {
  answer: string;
  navigationTrace: Array<{ tool: string; input: Record<string, unknown>; summary: string }>;
  filesRead: string[];
  iterationCount: number;
  sessionId: string;
}
