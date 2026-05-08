import path from 'path';

export type ResolveResult =
  | { ok: true; absolutePath: string; displayPath: string }
  | { ok: false; error: string };

/**
 * Resolves a user-provided path string relative to the session target root,
 * preventing escape via "../.." or absolute paths outside the root.
 *
 * Conventions:
 *   "/"  → target root (agent idiom for "list the whole repo")
 *   "."  → target root
 *   "src/foo.ts" → targetRoot/src/foo.ts
 *   "/absolute/outside" → rejected
 *   "../../.env" → rejected
 */
export function resolveWithinTarget(targetRoot: string, userPath: string): ResolveResult {
  const normalizedRoot = path.resolve(targetRoot);

  let absolutePath: string;

  if (userPath === '/' || userPath === '.') {
    absolutePath = normalizedRoot;
  } else if (path.isAbsolute(userPath)) {
    absolutePath = path.normalize(userPath);
  } else {
    absolutePath = path.resolve(normalizedRoot, userPath);
  }

  const relative = path.relative(normalizedRoot, absolutePath);

  // Reject anything that starts with ".." or is still absolute (cross-drive on Windows)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return {
      ok: false,
      error: `Access denied: "${userPath}" resolves outside the target repository.`,
    };
  }

  const displayPath = relative === '' ? '.' : relative;

  return { ok: true, absolutePath, displayPath };
}
