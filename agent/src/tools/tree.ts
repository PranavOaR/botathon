import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config';
import type { ToolOutput } from '../types';

const MAX_TREE_ENTRIES = 500;

interface TreeInput {
  path: string;
  depth?: number;
  filter?: string;
}

export function treeHandler(input: TreeInput): ToolOutput {
  const targetPath = path.resolve(input.path);
  const maxDepth = Math.min(input.depth ?? 3, CONFIG.maxTreeDepth);

  if (!fs.existsSync(targetPath)) {
    return { content: `Directory not found: ${input.path}. Check the path and try again.` };
  }

  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) {
    return { content: `Not a directory: ${input.path}. Use the read tool to read file contents.` };
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

      // Skip hidden dirs (except .env.example shown as file) and blocked dirs
      if (CONFIG.skipDirs.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.isDirectory()) continue;

      // Skip symlinks to avoid loops
      if (entry.isSymbolicLink()) continue;

      const ext = path.extname(entry.name);
      if (CONFIG.binaryExtensions.has(ext)) continue;

      // Apply filter if provided
      if (input.filter && !entry.name.includes(input.filter) && !entry.isDirectory()) continue;

      if (entryCount >= MAX_TREE_ENTRIES) {
        lines.push(`${indent}... (truncated at ${MAX_TREE_ENTRIES} entries — use tree(subdir) to explore subdirectories)`);
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

  const rootName = path.basename(targetPath);
  lines.push(`${rootName}/`);
  walk(targetPath, '  ', 1);

  if (entryCount === 0) {
    return { content: `Empty directory: ${input.path}` };
  }

  return { content: lines.join('\n') };
}

export const treeTool = {
  name: 'tree',
  description:
    "List directory structure recursively. Use this FIRST on any new codebase to understand project layout before reading any files. Returns folder and file names with nesting. Does NOT return file contents.",
  input_schema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: "Absolute or relative path to list. Start with '/' or '.' for project root.",
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
