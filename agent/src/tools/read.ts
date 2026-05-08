import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config';
import type { ToolOutput } from '../types';

interface ReadInput {
  path: string;
  start_line?: number;
  end_line?: number;
}

const TS_IMPORT_RE = /import\s+.*?\s+from\s+['"](.+?)['"]/g;
const TS_REQUIRE_RE = /require\(['"](.+?)['"]\)/g;
const TS_EXPORT_RE = /export\s+(?:default\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(\w+)/g;
const PY_IMPORT_RE = /^import\s+(\S+)/gm;
const PY_FROM_RE = /^from\s+(\S+)\s+import/gm;

function parseImportsExports(
  content: string,
  filePath: string
): { imports: string[]; exports: string[] } {
  const ext = path.extname(filePath);
  const imports: string[] = [];
  const exports: string[] = [];

  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    for (const m of content.matchAll(TS_IMPORT_RE)) if (m[1]) imports.push(m[1]);
    for (const m of content.matchAll(TS_REQUIRE_RE)) if (m[1]) imports.push(m[1]);
    for (const m of content.matchAll(TS_EXPORT_RE)) if (m[1]) exports.push(m[1]);
  } else if (ext === '.py') {
    for (const m of content.matchAll(PY_IMPORT_RE)) if (m[1]) imports.push(m[1]);
    for (const m of content.matchAll(PY_FROM_RE)) if (m[1]) imports.push(m[1]);
  }

  return {
    imports: [...new Set(imports)],
    exports: [...new Set(exports)],
  };
}

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath);
  const langMap: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript (React)', '.js': 'JavaScript',
    '.jsx': 'JavaScript (React)', '.py': 'Python', '.go': 'Go', '.rs': 'Rust',
    '.java': 'Java', '.md': 'Markdown', '.json': 'JSON', '.yaml': 'YAML',
    '.yml': 'YAML', '.toml': 'TOML', '.sh': 'Shell',
  };
  return langMap[ext] ?? (ext.slice(1).toUpperCase() || 'Text');
}

export function readHandler(input: ReadInput): ToolOutput {
  const filePath = path.resolve(input.path);

  if (!fs.existsSync(filePath)) {
    return {
      content: `File not found: ${input.path}. Check the tree output for the correct path.`,
    };
  }

  let rawContent: string;
  try {
    rawContent = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return { content: `Cannot read file: ${input.path} — binary or encoding error. Skip this file.` };
  }

  const fileSizeKb = Buffer.byteLength(rawContent, 'utf-8') / 1024;
  const allLines = rawContent.split('\n');
  const totalLines = allLines.length;

  // Large file with no line range specified — return first 100 lines
  if (!input.start_line && !input.end_line && fileSizeKb > CONFIG.maxFileSizeKb) {
    const slice = allLines.slice(0, 100);
    const numbered = formatLines(slice, 1);
    const { imports, exports } = parseImportsExports(rawContent, filePath);
    return {
      content: [
        `// File: ${input.path} (lines 1-100 of ${totalLines})`,
        `// Size: ${fileSizeKb.toFixed(1)}kb | Language: ${detectLanguage(filePath)}`,
        `// ⚠ Large file — showing first 100 lines. Use start_line/end_line to read specific sections.`,
        '',
        numbered,
      ].join('\n'),
      metadata: { filePath: input.path, imports, exports },
    };
  }

  const startLine = Math.max(1, input.start_line ?? 1);
  const endLine = Math.min(totalLines, input.end_line ?? totalLines);
  const slice = allLines.slice(startLine - 1, endLine);
  const numbered = formatLines(slice, startLine);
  const { imports, exports } = parseImportsExports(rawContent, filePath);

  return {
    content: [
      `// File: ${input.path} (lines ${startLine}-${endLine} of ${totalLines})`,
      `// Size: ${fileSizeKb.toFixed(1)}kb | Language: ${detectLanguage(filePath)}`,
      '',
      numbered,
    ].join('\n'),
    metadata: { filePath: input.path, imports, exports },
  };
}

function formatLines(lines: string[], startAt: number): string {
  return lines
    .map((line, i) => `${String(startAt + i).padStart(6)} | ${line}`)
    .join('\n');
}

export const readTool = {
  name: 'read',
  description:
    "Read a file's contents. ALWAYS specify line ranges when you know which section is relevant — do not read entire large files. After reading, the tool auto-extracts imports and exports for the import graph.",
  input_schema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read',
      },
      start_line: {
        type: 'number',
        description: 'First line to read (1-indexed). Omit to read from beginning.',
      },
      end_line: {
        type: 'number',
        description: 'Last line to read (inclusive). Omit to read to end.',
      },
    },
    required: ['path'],
  },
};
