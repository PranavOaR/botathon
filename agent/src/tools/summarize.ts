import { readHandler } from './read';
import type { ToolOutput } from '../types';

export interface ToolDependencies {
  summarizeFile?: (content: string) => Promise<string>;
}

export const summarizeTool = {
  name: 'summarize',
  description:
    'Produce a concise natural-language summary of a file. Uses the first 150 lines. Returns cached result if the file was already summarized this session.',
  input_schema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Repo-relative path to the file to summarize',
      },
    },
    required: ['path'],
  },
};

/**
 * Summarize a file.
 *
 * @param displayPath - Already-resolved display path (repo-relative). Path resolution and
 *   cache lookup must be done by the caller before invoking this function.
 * @param targetPath  - Absolute root of the target repository.
 * @param cachedSummary - Existing summary from session, if any.
 * @param deps - Injected summarizer; required in production, injectable for tests.
 */
export async function summarizeHandler(
  displayPath: string,
  targetPath: string,
  cachedSummary: string | undefined,
  deps: ToolDependencies
): Promise<ToolOutput & { summary: string | undefined }> {
  if (cachedSummary !== undefined) {
    return {
      content: `Summary of ${displayPath} [cached]:\n\n${cachedSummary}`,
      summary: cachedSummary,
      metadata: { filePath: displayPath },
    };
  }

  // Read first 150 lines via readHandler (re-uses path security + line logic)
  const readResult = readHandler(
    { path: displayPath, start_line: 1, end_line: 150 },
    targetPath
  );

  if (!readResult.metadata?.filePath) {
    // readHandler returned an error (access denied, file not found, etc.)
    return { content: readResult.content, summary: undefined };
  }

  if (!deps.summarizeFile) {
    return {
      content: `Summarization not available in this context.`,
      summary: undefined,
    };
  }

  const summary = await deps.summarizeFile(readResult.content);
  return {
    content: `Summary of ${displayPath}:\n\n${summary}`,
    summary,
    metadata: { filePath: displayPath },
  };
}
