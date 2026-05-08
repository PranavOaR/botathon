import fs from 'fs';
import path from 'path';
import { resolveWithinTarget } from './pathUtils';
import { CONFIG } from '../config';
import type { ToolOutput } from '../types';

export interface GrepInput {
  pattern: string;
  directory?: string;       // default "."
  file_extension?: string;  // e.g. ".ts", ".py"
  case_sensitive?: boolean; // default false
  max_results?: number;     // default 30, max 100
}

export const grepTool = {
  name: 'grep',
  description:
    'Search for a pattern across files in the codebase. Returns matching lines with file paths and line numbers. Defaults to case-insensitive search.',
  input_schema: {
    type: 'object' as const,
    properties: {
      pattern: {
        type: 'string',
        description: 'Search pattern (regex, falls back to literal if invalid regex)',
      },
      directory: {
        type: 'string',
        description: 'Directory to search within (default: project root ".")',
      },
      file_extension: {
        type: 'string',
        description: 'Only search files with this extension, e.g. ".ts" or ".py"',
      },
      case_sensitive: {
        type: 'boolean',
        description: 'Whether the search is case-sensitive (default: false)',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of matching lines to return (default: 30, max: 100)',
      },
    },
    required: ['pattern'],
  },
};

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__']);
const DEFAULT_MAX_RESULTS = 30;
const MAX_RESULTS_CEILING = 100;

type Matcher = (line: string) => boolean;

function buildMatcher(pattern: string, caseSensitive: boolean): Matcher {
  const flags = caseSensitive ? '' : 'i';
  try {
    const regex = new RegExp(pattern, flags);
    return (line: string) => regex.test(line);
  } catch {
    // Fallback: literal string search
    const needle = caseSensitive ? pattern : pattern.toLowerCase();
    return (line: string) => (caseSensitive ? line : line.toLowerCase()).includes(needle);
  }
}

export function grepHandler(input: GrepInput, targetPath: string): ToolOutput {
  const dir = input.directory ?? '.';
  const resolved = resolveWithinTarget(targetPath, dir);

  if (!resolved.ok) {
    return { content: `Access denied: directory is outside the target repository.` };
  }

  if (!fs.existsSync(resolved.absolutePath)) {
    return { content: `Directory not found: "${dir}"` };
  }

  const stat = fs.statSync(resolved.absolutePath);
  if (!stat.isDirectory()) {
    return { content: `"${dir}" is a file, not a directory. Use a directory path.` };
  }

  const caseSensitive = input.case_sensitive ?? false;
  const maxResults = Math.min(input.max_results ?? DEFAULT_MAX_RESULTS, MAX_RESULTS_CEILING);
  const matcher = buildMatcher(input.pattern, caseSensitive);

  // Normalize extension: accept "ts" or ".ts"
  let ext: string | undefined;
  if (input.file_extension) {
    ext = input.file_extension.startsWith('.') ? input.file_extension : `.${input.file_extension}`;
  }

  const matches: string[] = [];
  searchDir(resolved.absolutePath, targetPath, matcher, ext ?? null, maxResults, matches);

  const dirDisplay = resolved.displayPath === '.' ? '.' : resolved.displayPath;

  if (matches.length === 0) {
    return { content: `No matches for "${input.pattern}" under ${dirDisplay}.` };
  }

  const truncated = matches.length >= maxResults;
  const header = `Found ${matches.length}${truncated ? '+' : ''} result(s) for "${input.pattern}":\n`;
  const footer = truncated
    ? `\nShowing first ${maxResults} results. Refine pattern or directory to narrow the search.`
    : '';
  return { content: header + '\n' + matches.join('\n') + footer };
}

function searchDir(
  dirPath: string,
  targetRoot: string,
  matcher: Matcher,
  ext: string | null,
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
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      searchDir(fullPath, targetRoot, matcher, ext, maxResults, matches);
    } else if (entry.isFile()) {
      const fileExt = path.extname(entry.name);
      if (CONFIG.binaryExtensions.has(fileExt)) continue;
      if (ext !== null && fileExt !== ext) continue;
      searchFile(fullPath, targetRoot, matcher, maxResults, matches);
    }
  }
}

function searchFile(
  filePath: string,
  targetRoot: string,
  matcher: Matcher,
  maxResults: number,
  matches: string[]
): void {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > CONFIG.maxFileSizeKb * 1024) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const displayPath = path.relative(targetRoot, filePath);
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= maxResults) return;
      const line = lines[i] ?? '';
      if (matcher(line)) {
        matches.push(`${displayPath}:${i + 1}: ${line}`);
      }
    }
  } catch {
    // skip unreadable files
  }
}
