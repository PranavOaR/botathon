import { treeHandler, treeTool } from './tree';
import { readHandler, readTool } from './read';
import { grepHandler, grepTool } from './grep';
import { jumpHandler, jumpTool } from './jump';
import { summarizeHandler, summarizeTool } from './summarize';
import type { ToolDependencies } from './summarize';
import { upsertFileRecord, addLineRange, getSummary } from '../memory/sessionStore';
import { addEdge } from '../memory/importGraph';
import { resolveLocalImport } from './importResolver';
import type { SessionState, ToolOutput } from '../types';

export type { ToolDependencies };

export interface DispatchResult {
  output: ToolOutput;
  updatedSession: SessionState;
}

export const toolSchemas = [treeTool, readTool, grepTool, jumpTool, summarizeTool];

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  session: SessionState,
  deps: ToolDependencies = {}
): Promise<DispatchResult> {
  switch (name) {
    case 'tree': {
      const output = treeHandler(
        input as unknown as Parameters<typeof treeHandler>[0],
        session.targetPath
      );
      return { output, updatedSession: session };
    }

    case 'read': {
      const output = readHandler(
        input as unknown as Parameters<typeof readHandler>[0],
        session.targetPath
      );
      let updatedSession = session;
      if (output.metadata?.filePath) {
        const { filePath, imports = [], exports: expts = [], lineRange } = output.metadata;
        updatedSession = upsertFileRecord(updatedSession, filePath, { imports, exports: expts });

        // Wire importGraph edges for all resolved local imports
        let graph = updatedSession.importGraph;
        for (const rawImport of imports) {
          const resolved = resolveLocalImport(filePath, rawImport, session.targetPath);
          if (resolved) {
            graph = addEdge(graph, filePath, resolved);
          }
        }
        updatedSession = { ...updatedSession, importGraph: graph };

        if (lineRange) {
          updatedSession = addLineRange(updatedSession, filePath, lineRange[0], lineRange[1]);
        }
      }
      return { output, updatedSession };
    }

    case 'grep': {
      const output = grepHandler(
        input as unknown as Parameters<typeof grepHandler>[0],
        session.targetPath
      );
      return { output, updatedSession: session };
    }

    case 'jump': {
      const output = jumpHandler(
        input as unknown as Parameters<typeof jumpHandler>[0],
        session.targetPath
      );
      return { output, updatedSession: session };
    }

    case 'summarize': {
      const summarizeInput = input as unknown as Parameters<typeof summarizeHandler>[0];
      const cached = getSummary(session, summarizeInput.path);
      const result = await summarizeHandler(summarizeInput, session.targetPath, cached, deps);

      let updatedSession = session;
      if (result.summary !== undefined && result.metadata?.filePath) {
        updatedSession = upsertFileRecord(updatedSession, result.metadata.filePath, {
          summary: result.summary,
        });
      }
      return { output: result, updatedSession };
    }

    default:
      return {
        output: {
          content: `Unknown tool: "${name}". Available tools: tree, read, grep, jump, summarize`,
        },
        updatedSession: session,
      };
  }
}

export function isKnownTool(name: string): boolean {
  return ['tree', 'read', 'grep', 'jump', 'summarize'].includes(name);
}
