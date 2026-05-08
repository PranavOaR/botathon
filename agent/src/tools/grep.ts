import fs from 'fs';
import path from 'path';
import { resolveWithinTarget } from './pathUtils';
import type { ToolOutput } from '../types';

export interface GrepInput {
  pattern: string;
  path?: string;
  file_pattern?: string;
  max_results?: number;
}

export const grepTool = {
  name: 'grep',
  description:
    'Search for a regex pattern across files in the codebase. Returns matching lines with file paths and line numbers.',
  input_schema: {
    type: 'object' as const,
    properties: {
      pattern: {
        type: 'string',
        description: 'Regular expression pattern to search for',
      },
      path: {
        type: 'string',
        description: 'Directory or file to search within (default: project root)',
      },
      file_pattern: {
        type: 'string',
        description: 'Glob-style filter on filenames, e.g. "*.ts" (default: all files)',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of matching lines to return (default: 50)',
      },
    },
    required: ['pattern'],
  },
};

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__']);
const MAX_FILE_SIZE_BYTES = 512 * 1024;
const DEFAULT_MAX_RESULTS = 50;

export function grepHandler(input: GrepInput, targetPath: string): ToolOutput {
  const searchPath = input.path ?? '.';
  const resolved = resolveWithinTarget(targetPath, searchPath);

  if (!resolved.ok) {
    return { content: `Access denied: path is outside the target directory.` };
  }

  if (!fs.existsSync(resolved.absolutePath)) {
    return { content: `Path not found: "${searchPath}"` };
  }

  let regex: RegExp;
  try {
    regex = new RegExp(input.pattern);
  } catch {
    return { content: `Invalid regex pattern: "${input.pattern}"` };
  }

  const fileFilter = input.file_pattern ? buildFileFilter(input.file_pattern) : null;
  const maxResults = input.max_results ?? DEFAULT_MAX_RESULTS;
  const matches: string[] = [];

  searchDir(resolved.absolutePath, targetPath, regex, fileFilter, maxResults, matches);

  if (matches.length === 0) {
    return { content: `No matches found for pattern: ${input.pattern}` };
  }

  const truncated = matches.length >= maxResults;
  const lines = matches.slice(0, maxResults);
  const header = `Found ${lines.length}${truncated ? '+' : ''} match(es) for /${input.pattern}/:\n`;
  return { content: header + lines.join('\n') };
}

function searchDir(
  dirPath: string,
  targetRoot: string,
  regex: RegExp,
  fileFilter: ((name: string) => boolean) | null,
  maxResults: number,
  matches: string[]
): void {
  if (matches.length >= maxResults) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (matches.length >= maxResults) return;
    if (entry.isSymbolicLink()) continue;

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      searchDir(fullPath, targetRoot, regex, fileFilter, maxResults, matches);
    } else if (entry.isFile()) {
      if (fileFilter && !fileFilter(entry.name)) continue;
      searchFile(fullPath, targetRoot, regex, maxResults, matches);
    }
  }
}

function searchFile(
  filePath: string,
  targetRoot: string,
  regex: RegExp,
  maxResults: number,
  matches: string[]
): void {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE_BYTES) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const displayPath = path.relative(targetRoot, filePath);
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= maxResults) return;
      const line = lines[i] ?? '';
      if (regex.test(line)) {
        const lineNum = String(i + 1).padStart(4, ' ');
        matches.push(`${displayPath}:${lineNum} | ${line}`);
      }
    }
  } catch {
    // skip unreadable files
  }
}

function buildFileFilter(pattern: string): (name: string) => boolean {
  // Convert glob-style pattern to regex: "*.ts" → /^.*\.ts$/
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(`^${escaped}$`);
  return (name: string) => regex.test(name);
}
