import { treeHandler, treeTool } from './tree';
import { readHandler, readTool } from './read';
import type { SessionState, ToolOutput } from '../types';

type ToolFn = (input: Record<string, unknown>, session: SessionState) => ToolOutput;

const TOOL_HANDLERS: Record<string, ToolFn> = {
  tree: (input) => treeHandler(input as Parameters<typeof treeHandler>[0]),
  read: (input) => readHandler(input as Parameters<typeof readHandler>[0]),
};

export const toolSchemas = [treeTool, readTool];

export function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  session: SessionState
): ToolOutput {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return { content: `Unknown tool: "${name}". Available tools: ${Object.keys(TOOL_HANDLERS).join(', ')}` };
  }
  return handler(input, session);
}

export function isKnownTool(name: string): boolean {
  return name in TOOL_HANDLERS;
}
