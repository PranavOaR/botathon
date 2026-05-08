import { treeHandler, treeTool } from './tree';
import { readHandler, readTool } from './read';
import { upsertFileRecord, addLineRange } from '../memory/sessionStore';
import type { SessionState, ToolOutput } from '../types';

export interface DispatchResult {
  output: ToolOutput;
  updatedSession: SessionState;
}

type ToolFn = (input: Record<string, unknown>, targetPath: string) => ToolOutput;

const TOOL_HANDLERS: Record<string, ToolFn> = {
  tree: (input, targetPath) =>
    treeHandler(input as unknown as Parameters<typeof treeHandler>[0], targetPath),
  read: (input, targetPath) =>
    readHandler(input as unknown as Parameters<typeof readHandler>[0], targetPath),
};

export const toolSchemas = [treeTool, readTool];

export function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  session: SessionState
): DispatchResult {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return {
      output: {
        content: `Unknown tool: "${name}". Available tools: ${Object.keys(TOOL_HANDLERS).join(', ')}`,
      },
      updatedSession: session,
    };
  }

  const output = handler(input, session.targetPath);

  // Update session if read returned file metadata
  let updatedSession = session;
  if (name === 'read' && output.metadata?.filePath) {
    const { filePath, imports = [], exports: expts = [], lineRange } = output.metadata;
    updatedSession = upsertFileRecord(updatedSession, filePath, {
      imports,
      exports: expts,
    });
    if (lineRange) {
      updatedSession = addLineRange(updatedSession, filePath, lineRange[0], lineRange[1]);
    }
  }

  return { output, updatedSession };
}

export function isKnownTool(name: string): boolean {
  return name in TOOL_HANDLERS;
}
