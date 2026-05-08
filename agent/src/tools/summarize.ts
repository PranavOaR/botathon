import fs from 'fs';
import { resolveWithinTarget } from './pathUtils';
import type { ToolOutput } from '../types';

export interface SummarizeInput {
  path: string;
}

export interface ToolDependencies {
  summarizeFile?: (content: string) => Promise<string>;
}

export const summarizeTool = {
  name: 'summarize',
  description:
    'Produce a concise natural-language summary of a file. Useful for quickly understanding what a file does without reading every line.',
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

const MAX_FILE_SIZE_BYTES = 512 * 1024;

export async function summarizeHandler(
  input: SummarizeInput,
  targetPath: string,
  cachedSummary: string | undefined,
  deps: ToolDependencies
): Promise<ToolOutput & { summary: string | undefined }> {
  if (cachedSummary) {
    return {
      content: `Summary of ${input.path}:\n\n${cachedSummary}`,
      summary: cachedSummary,
      metadata: { filePath: input.path },
    };
  }

  const resolved = resolveWithinTarget(targetPath, input.path);
  if (!resolved.ok) {
    return {
      content: `Access denied: path is outside the target directory.`,
      summary: undefined,
    };
  }

  if (!fs.existsSync(resolved.absolutePath)) {
    return { content: `File not found: "${input.path}"`, summary: undefined };
  }

  const stat = fs.statSync(resolved.absolutePath);
  if (stat.isDirectory()) {
    return { content: `"${input.path}" is a directory, not a file.`, summary: undefined };
  }

  if (stat.size > MAX_FILE_SIZE_BYTES) {
    return { content: `File too large to summarize: "${input.path}"`, summary: undefined };
  }

  let fileContent: string;
  try {
    fileContent = fs.readFileSync(resolved.absolutePath, 'utf8');
  } catch {
    return { content: `Could not read file: "${input.path}"`, summary: undefined };
  }

  if (!deps.summarizeFile) {
    return {
      content: `Summarization not available in this context.`,
      summary: undefined,
    };
  }

  const summary = await deps.summarizeFile(fileContent);
  return {
    content: `Summary of ${input.path}:\n\n${summary}`,
    summary,
    metadata: { filePath: resolved.displayPath },
  };
}
