import fs from 'fs';
import path from 'path';
import { resolveWithinTarget } from './pathUtils';
import { getImports, getImportedBy } from '../memory/importGraph';
import type { ImportGraph } from '../memory/importGraph';
import type { ToolOutput } from '../types';

export interface JumpInput {
  symbol: string;
  from_file?: string;
}

export const jumpTool = {
  name: 'jump',
  description:
    'Find where a symbol (function, class, variable, type) is defined. If from_file is provided, prioritizes files known to be imported by that file. Returns file path, line number, and importers.',
  input_schema: {
    type: 'object' as const,
    properties: {
      symbol: {
        type: 'string',
        description: 'Name of the symbol to find (e.g. "verifyToken", "UserRepository")',
      },
      from_file: {
        type: 'string',
        description:
          'Repo-relative path of the file making the lookup. Used to prioritize files it already imports.',
      },
    },
    required: ['symbol'],
  },
};

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__']);
const SEARCHABLE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py']);
const MAX_FILE_SIZE_BYTES = 512 * 1024;

interface DefinitionHit {
  displayPath: string;
  lineNum: number;
  line: string;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildDefinitionPatterns(symbol: string): RegExp[] {
  const s = escapeRegex(symbol);
  return [
    // export function / export async function / export default function
    new RegExp(`\\bexport\\s+(?:async\\s+)?(?:default\\s+)?function\\s+${s}\\b`),
    // export const/let/var SYMBOL =
    new RegExp(`\\bexport\\s+(?:const|let|var)\\s+${s}\\s*[=:]`),
    // export class/interface/type/enum SYMBOL
    new RegExp(`\\bexport\\s+(?:class|interface|type|enum)\\s+${s}\\b`),
    // export { SYMBOL }  or  export { foo as SYMBOL }
    new RegExp(`\\bexport\\s*\\{[^}]*\\b${s}\\b[^}]*\\}`),
    // Python: def SYMBOL( / class SYMBOL
    new RegExp(`^\\s*(?:def|class)\\s+${s}\\b`),
  ];
}

export function jumpHandler(
  input: JumpInput,
  targetPath: string,
  importGraph: ImportGraph
): ToolOutput {
  const patterns = buildDefinitionPatterns(input.symbol);

  // Resolve from_file if provided
  let fromFileDisplayPath: string | undefined;
  if (input.from_file) {
    const r = resolveWithinTarget(targetPath, input.from_file);
    if (!r.ok) {
      return { content: `Access denied: from_file is outside the target repository.` };
    }
    fromFileDisplayPath = r.displayPath;
  }

  // Priority search: files imported by from_file
  const priorityFiles = fromFileDisplayPath
    ? getImports(importGraph, fromFileDisplayPath)
    : [];

  const priorityHits: DefinitionHit[] = [];
  for (const importedDisplayPath of priorityFiles) {
    const absPath = path.join(targetPath, importedDisplayPath);
    if (!fs.existsSync(absPath)) continue;
    searchFileForSymbol(absPath, targetPath, patterns, priorityHits);
  }

  if (priorityHits.length > 0) {
    return formatResult(input.symbol, priorityHits, targetPath, importGraph);
  }

  // Global fallback
  const allHits: DefinitionHit[] = [];
  searchDirForSymbol(targetPath, targetPath, patterns, allHits);

  if (allHits.length === 0) {
    return {
      content:
        `Symbol not found: ${input.symbol}\n` +
        `Try grep("${input.symbol}") to search all usages.`,
    };
  }

  return formatResult(input.symbol, allHits, targetPath, importGraph);
}

function formatResult(
  symbol: string,
  hits: DefinitionHit[],
  targetPath: string,
  importGraph: ImportGraph
): ToolOutput {
  const best = hits[0]!;
  const importedBy = getImportedBy(importGraph, best.displayPath);

  let content: string;

  if (hits.length > 1) {
    const list = hits.map((h) => `  - ${h.displayPath}:${h.lineNum}: ${h.line.trim()}`).join('\n');
    content = `Multiple possible definitions found:\n${list}\n\nBest match:\n`;
  } else {
    content = '';
  }

  content +=
    `Symbol: ${symbol}\n` +
    `Defined in: ${best.displayPath} (line ${best.lineNum})\n` +
    `Definition: ${best.line.trim()}`;

  if (importedBy.length > 0) {
    content += `\n\nImported by:\n${importedBy.map((f) => `  - ${f}`).join('\n')}`;
  }

  return { content };
}

function searchDirForSymbol(
  dirPath: string,
  targetRoot: string,
  patterns: RegExp[],
  results: DefinitionHit[]
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
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
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
  results: DefinitionHit[]
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
          break;
        }
      }
    }
  } catch {
    // skip unreadable files
  }
}
