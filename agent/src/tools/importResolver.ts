import fs from 'fs';
import path from 'path';
import { resolveWithinTarget } from './pathUtils';

const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.json'];

/**
 * Resolves a raw local import string to a repo-relative display path.
 *
 * Only handles local imports (starting with "./" or "../").
 * External package imports (e.g. "react", "crypto") return undefined.
 * Returns undefined if the file cannot be found on disk.
 *
 * Examples:
 *   from "src/middleware.ts", raw "./utils/jwt"  → "src/utils/jwt.ts"
 *   from "src/pages/api/login.ts", raw "../../utils/users" → "src/utils/users.ts"
 *   raw "express" → undefined
 */
export function resolveLocalImport(
  fromFile: string,
  rawImport: string,
  targetPath: string
): string | undefined {
  if (!rawImport.startsWith('./') && !rawImport.startsWith('../')) return undefined;

  const fromDir = path.dirname(fromFile);
  const candidate = path.join(fromDir, rawImport);

  // If the import already has a known extension, try it directly
  if (RESOLVE_EXTENSIONS.includes(path.extname(candidate))) {
    return tryResolve(candidate, targetPath);
  }

  // Try adding each extension
  for (const ext of RESOLVE_EXTENSIONS) {
    const result = tryResolve(candidate + ext, targetPath);
    if (result) return result;
  }

  // Try as a directory index file
  for (const ext of RESOLVE_EXTENSIONS) {
    const result = tryResolve(path.join(candidate, 'index') + ext, targetPath);
    if (result) return result;
  }

  return undefined;
}

function tryResolve(candidatePath: string, targetPath: string): string | undefined {
  const resolved = resolveWithinTarget(targetPath, candidatePath);
  if (!resolved.ok) return undefined;
  if (!fs.existsSync(resolved.absolutePath)) return undefined;
  return resolved.displayPath;
}
