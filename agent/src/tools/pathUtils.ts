import fs from 'fs';
import path from 'path';

export type ResolveResult =
  | { ok: true; absolutePath: string; displayPath: string }
  | { ok: false; error: string };

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Resolves a user-provided path relative to the session target root.
 *
 * Two-stage containment check:
 *   1. Lexical: candidate must not escape the root via "../.." or absolute paths.
 *   2. Real path: if the candidate exists, resolve symlinks and re-check containment.
 *      This blocks symlinks inside the repo that point outside it.
 *
 * Missing files pass the lexical check and surface as "File not found" downstream,
 * not as "Access denied" — distinguishing the two cases clearly.
 *
 * Conventions:
 *   "/"  or "." → target root
 *   "src/foo.ts" → targetRoot/src/foo.ts
 *   "../../etc/passwd" or "/absolute/outside" → rejected
 *   "link-to-outside" (symlink) → rejected after realpath check
 */
export function resolveWithinTarget(targetRoot: string, userPath: string): ResolveResult {
  // Resolve the root itself through any symlinks so realpath comparisons are consistent
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(targetRoot);
  } catch {
    realRoot = path.resolve(targetRoot);
  }

  const normalizedRoot = path.resolve(targetRoot);

  // Build the lexical absolute path from user input
  let absolutePath: string;
  if (userPath === '/' || userPath === '.') {
    absolutePath = normalizedRoot;
  } else if (path.isAbsolute(userPath)) {
    absolutePath = path.normalize(userPath);
  } else {
    absolutePath = path.resolve(normalizedRoot, userPath);
  }

  // Stage 1 — lexical containment
  if (!isInsideRoot(normalizedRoot, absolutePath)) {
    return {
      ok: false,
      error: `Access denied: "${userPath}" resolves outside the target repository.`,
    };
  }

  // Stage 2 — realpath containment (only when the path actually exists)
  if (fs.existsSync(absolutePath)) {
    let realAbsolute: string;
    try {
      realAbsolute = fs.realpathSync(absolutePath);
    } catch {
      return {
        ok: false,
        error: `Access denied: "${userPath}" cannot be safely resolved (symlink error).`,
      };
    }

    if (!isInsideRoot(realRoot, realAbsolute)) {
      return {
        ok: false,
        error: `Access denied: "${userPath}" resolves outside the target repository.`,
      };
    }
  }

  const lexicalRelative = path.relative(normalizedRoot, absolutePath);
  const displayPath = lexicalRelative === '' ? '.' : lexicalRelative;

  return { ok: true, absolutePath, displayPath };
}
