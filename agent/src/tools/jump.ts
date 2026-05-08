import fs from 'fs';
import path from 'path';
import { resolveWithinTarget } from './pathUtils';
import type { ToolOutput } from '../types';

export interface JumpInput {
  symbol: string;
  path?: string;
}

export const jumpTool = {
  name: 'jump',
  description:
    'Find where a symbol (function, class, variable, type) is defined in the codebase. Returns the file path and line number of the definition.',
  input_schema: {
    type: 'object' as const,
    properties: {
      symbol: {
        type: 'string',
        description: 'Name of the symbol to find (e.g. "verifyToken", "UserRepository")',
      },
      path: {
        type: 'string',
        description: 'Directory or file to search within (default: project root)',
      },
    },
    required: ['symbol'],
  },
};

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__']);
const SEARCHABLE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py']);
const MAX_FILE_SIZE_BYTES = 512 * 1024;

// Patterns that indicate a definition (not just a usage)
function buildDefinitionPatterns(symbol: string): RegExp[] {
  const s = escapeRegex(symbol);
  return [
    // function foo / async function foo / export function foo
    new RegExp(`\\bfunction\\s+${s}\\s*[(<]`),
    // const foo = / let foo = / var foo =
    new RegExp(`\\b(?:const|let|var)\\s+${s}\\s*=`),
    // export const foo =
    new RegExp(`\\bexport\\s+(?:const|let|var)\\s+${s}\\s*=`),
    // class Foo
    new RegExp(`\\bclass\\s+${s}\\b`),
    // interface Foo
    new RegExp(`\\binterface\\s+${s}\\b`),
    // type Foo =
    new RegExp(`\\btype\\s+${s}\\s*=`),
    // enum Foo
    new RegExp(`\\benum\\s+${s}\\b`),
    // Python: def foo / class Foo
    new RegExp(`^\\s*(?:def|class)\\s+${s}\\b`),
    // Arrow function: const foo = (...) => / const foo = async (...) =>
    new RegExp(`\\b${s}\\s*=\\s*(?:async\\s*)?(?:\\(|[a-zA-Z_$])`),
  ];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function jumpHandler(input: JumpInput, targetPath: string): ToolOutput {
  const searchPath = input.path ?? '.';
  const resolved = resolveWithinTarget(targetPath, searchPath);

  if (!resolved.ok) {
    return { content: `Access denied: path is outside the target directory.` };
  }

  if (!fs.existsSync(resolved.absolutePath)) {
    return { content: `Path not found: "${searchPath}"` };
  }

  const patterns = buildDefinitionPatterns(input.symbol);
  const results: Array<{ displayPath: string; lineNum: number; line: string }> = [];

  const stat = fs.statSync(resolved.absolutePath);
  if (stat.isDirectory()) {
    searchDirForSymbol(resolved.absolutePath, targetPath, patterns, results);
  } else if (stat.isFile()) {
    searchFileForSymbol(resolved.absolutePath, targetPath, patterns, results);
  }

  if (results.length === 0) {
    return { content: `No definition found for symbol: "${input.symbol}"` };
  }

  const lines = results.map(
    (r) => `${r.displayPath}:${r.lineNum}\n  ${r.line.trim()}`
  );
  return { content: `Definition(s) of "${input.symbol}":\n\n${lines.join('\n\n')}` };
}

function searchDirForSymbol(
  dirPath: string,
  targetRoot: string,
  patterns: RegExp[],
  results: Array<{ displayPath: string; lineNum: number; line: string }>
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      searchDirForSymbol(fullPath, targetRoot, patterns, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!SEARCHABLE_EXTS.has(ext)) continue;
      searchFileForSymbol(fullPath, targetRoot, patterns, results);
    }
  }
}

function searchFileForSymbol(
  filePath: string,
  targetRoot: string,
  patterns: RegExp[],
  results: Array<{ displayPath: string; lineNum: number; line: string }>
): void {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE_BYTES) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const displayPath = path.relative(targetRoot, filePath);
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      for (const pattern of patterns) {
        if (pattern.test(line)) {
          results.push({ displayPath, lineNum: i + 1, line });
          break; // only record each line once even if multiple patterns match
        }
      }
    }
  } catch {
    // skip unreadable files
  }
}
