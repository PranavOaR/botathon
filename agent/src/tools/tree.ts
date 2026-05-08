import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config';
import { resolveWithinTarget } from './pathUtils';
import type { ToolOutput } from '../types';

const MAX_TREE_ENTRIES = 500;

interface TreeInput {
  path: string;
  depth?: number;
  filter?: string;
}

export function treeHandler(input: TreeInput, targetPath: string): ToolOutput {
  const resolved = resolveWithinTarget(targetPath, input.path);
  if (!resolved.ok) {
    return { content: resolved.error };
  }

  const { absolutePath, displayPath } = resolved;
  const maxDepth = Math.min(input.depth ?? 3, CONFIG.maxTreeDepth);

  if (!fs.existsSync(absolutePath)) {
    return { content: `Directory not found: ${displayPath}` };
  }

  const stat = fs.statSync(absolutePath);
  if (!stat.isDirectory()) {
    return { content: `Not a directory: ${displayPath}. Use the read tool to read file contents.` };
  }

  const lines: string[] = [];
  let entryCount = 0;
  let truncated = false;

  function walk(dir: string, indent: string, currentDepth: number): void {
    if (currentDepth > maxDepth || truncated) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      if (truncated) return;

      if (CONFIG.skipDirs.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.isDirectory()) continue;
      if (entry.isSymbolicLink()) continue;

      const ext = path.extname(entry.name);
      if (CONFIG.binaryExtensions.has(ext)) continue;

      if (input.filter && !entry.name.includes(input.filter) && !entry.isDirectory()) continue;

      if (entryCount >= MAX_TREE_ENTRIES) {
        lines.push(
          `${indent}... (truncated at ${MAX_TREE_ENTRIES} entries — use tree(subdir) to explore subdirectories)`
        );
        truncated = true;
        return;
      }

      if (entry.isDirectory()) {
        lines.push(`${indent}${entry.name}/`);
        entryCount++;
        walk(path.join(dir, entry.name), indent + '  ', currentDepth + 1);
      } else if (entry.isFile()) {
        try {
          const fileStat = fs.statSync(path.join(dir, entry.name));
          if (fileStat.size > CONFIG.maxFileSizeKb * 1024) continue;
        } catch {
          continue;
        }
        lines.push(`${indent}${entry.name}`);
        entryCount++;
      }
    }
  }

  // Root label: show display path so agent sees repo-relative location
  const rootLabel = displayPath === '.' ? '.' : displayPath;
  lines.push(`${rootLabel}/`);
  walk(absolutePath, '  ', 1);

  if (entryCount === 0) {
    return { content: `Empty directory: ${displayPath}` };
  }

  return { content: lines.join('\n') };
}

export const treeTool = {
  name: 'tree',
  description:
    'List directory structure recursively. Use this FIRST on any new codebase to understand project layout before reading any files. "/" or "." refers to the project root. Returns folder and file names with nesting. Does NOT return file contents.',
  input_schema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description:
          'Path relative to the project root to list. Use "/" or "." for project root, "src" for src/, etc.',
      },
      depth: {
        type: 'number',
        description: 'Max depth to traverse. Default 3. Use 1 for quick overview, 5+ for deep exploration.',
      },
      filter: {
        type: 'string',
        description: "Only show entries whose name contains this substring (e.g. '.ts', 'auth')",
      },
    },
    required: ['path'],
  },
};
