import * as fs from 'fs';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImportResult {
  targetPath: string;
  repoUrl: string;
  branch: string;
  fileCount: number;
  owner: string;
  repo: string;
}

interface RemoteFileRecord {
  path: string;
  content: string;
  size: number;
}

interface RemoteRepoOutput {
  repoUrl: string;
  owner: string;
  repo: string;
  branch: string;
  fileCount: number;
  files: RemoteFileRecord[];
  skipped: Array<{ path: string; reason: string }>;
}

interface GitHubTreeItem {
  path?: string;
  type?: string;
  size?: number;
}

interface GitHubTreeResponse {
  tree: GitHubTreeItem[];
  truncated?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_FILES = 500;
const MAX_FILE_SIZE_BYTES = 500 * 1024;

const DEFAULT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
  '.md', '.json', '.yaml', '.yml', '.toml',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage', '__pycache__',
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.avif',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
  '.mp4', '.mp3', '.wav', '.webm', '.ogg',
  '.exe', '.dll', '.so', '.dylib',
  '.db', '.sqlite',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/);
  if (!match) {
    throw new Error(
      `Invalid GitHub URL: ${repoUrl}. Expected: https://github.com/owner/repo`
    );
  }
  return { owner: match[1], repo: match[2] };
}

function getExtension(filePath: string): string {
  const dotIdx = filePath.lastIndexOf('.');
  return dotIdx === -1 ? '' : filePath.slice(dotIdx).toLowerCase();
}

function isSkippedPath(filePath: string): boolean {
  return filePath.split('/').some((part) => SKIP_DIRS.has(part));
}

function buildGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'filemind-agent/1.0',
  };
  const token = process.env['GITHUB_TOKEN'];
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }
  return headers;
}

/**
 * Resolve a relative file path safely against a base directory.
 * Returns null if the resolved path escapes the base dir (path traversal attempt).
 */
function safeResolve(baseDir: string, relativePath: string): string | null {
  const resolved = path.resolve(baseDir, relativePath);
  if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) {
    return null;
  }
  return resolved;
}

function writeFileSync(absPath: string, content: string): void {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, 'utf-8');
}

// ─── GitHub fallback (no Apify) ───────────────────────────────────────────────

async function fetchFromGitHub(
  owner: string,
  repo: string,
  branch: string
): Promise<RemoteRepoOutput> {
  const headers = buildGitHubHeaders();

  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const treeRes = await fetch(treeUrl, { headers });
  if (!treeRes.ok) {
    throw new Error(
      `GitHub API error ${treeRes.status} fetching tree: ${treeRes.statusText}`
    );
  }
  const treeData = (await treeRes.json()) as GitHubTreeResponse;

  if (treeData.truncated) {
    console.warn('[remote] GitHub tree truncated — large repo, some files missing');
  }

  const files: RemoteFileRecord[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];

  for (const item of treeData.tree) {
    if (item.type !== 'blob' || !item.path) continue;

    const filePath = item.path;

    if (isSkippedPath(filePath)) {
      skipped.push({ path: filePath, reason: 'excluded directory' });
      continue;
    }

    const ext = getExtension(filePath);

    if (BINARY_EXTENSIONS.has(ext)) {
      skipped.push({ path: filePath, reason: 'binary file' });
      continue;
    }

    if (!DEFAULT_EXTENSIONS.has(ext)) {
      skipped.push({ path: filePath, reason: `extension ${ext} not included` });
      continue;
    }

    const sizeBytes = item.size ?? 0;
    if (sizeBytes > MAX_FILE_SIZE_BYTES) {
      skipped.push({
        path: filePath,
        reason: `file too large (${Math.round(sizeBytes / 1024)}KB)`,
      });
      continue;
    }

    if (files.length >= DEFAULT_MAX_FILES) {
      skipped.push({ path: filePath, reason: 'maxFiles limit reached' });
      continue;
    }

    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
    try {
      const contentRes = await fetch(rawUrl, { headers });
      if (!contentRes.ok) {
        skipped.push({
          path: filePath,
          reason: `HTTP ${contentRes.status} fetching content`,
        });
        continue;
      }
      const content = await contentRes.text();
      files.push({ path: filePath, content, size: sizeBytes });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      skipped.push({ path: filePath, reason: `fetch error: ${reason}` });
    }
  }

  return {
    repoUrl: `https://github.com/${owner}/${repo}`,
    owner,
    repo,
    branch,
    fileCount: files.length,
    files,
    skipped,
  };
}

// ─── Apify runner ─────────────────────────────────────────────────────────────

async function fetchViaApify(
  repoUrl: string,
  branch: string
): Promise<RemoteRepoOutput> {
  const apifyToken = process.env['APIFY_API_TOKEN'];
  const actorId = process.env['APIFY_ACTOR_ID'];

  if (!apifyToken || !actorId) {
    throw new Error('APIFY_API_TOKEN and APIFY_ACTOR_ID must be set to use Apify');
  }

  const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync?token=${apifyToken}`;
  const body = JSON.stringify({ repoUrl, branch, maxFiles: DEFAULT_MAX_FILES });

  const runRes = await fetch(runUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!runRes.ok) {
    const text = await runRes.text().catch(() => runRes.statusText);
    throw new Error(`Apify actor run failed (${runRes.status}): ${text}`);
  }

  // run-sync returns the run object; the default key-value store holds OUTPUT
  const run = (await runRes.json()) as { data?: { defaultKeyValueStoreId?: string } };
  const storeId = run?.data?.defaultKeyValueStoreId;
  if (!storeId) {
    throw new Error('Apify run did not return a defaultKeyValueStoreId');
  }

  const outputUrl = `https://api.apify.com/v2/key-value-stores/${storeId}/records/OUTPUT?token=${apifyToken}`;
  const outputRes = await fetch(outputUrl);
  if (!outputRes.ok) {
    throw new Error(`Failed to fetch Apify OUTPUT (${outputRes.status}): ${outputRes.statusText}`);
  }

  return outputRes.json() as Promise<RemoteRepoOutput>;
}

// ─── File writer ──────────────────────────────────────────────────────────────

function writeRepoFiles(
  output: RemoteRepoOutput,
  targetDir: string
): { written: number; skipped: number } {
  fs.mkdirSync(targetDir, { recursive: true });

  let written = 0;
  let skipCount = 0;

  for (const file of output.files) {
    const absPath = safeResolve(targetDir, file.path);
    if (!absPath) {
      console.warn(`[remote] Path traversal attempt blocked: ${file.path}`);
      skipCount++;
      continue;
    }
    writeFileSync(absPath, file.content);
    written++;
  }

  return { written, skipped: skipCount };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Import a remote GitHub repo into .filemind/remote/<owner>-<repo>-<branch>/.
 * Uses Apify if APIFY_API_TOKEN + APIFY_ACTOR_ID are set; falls back to
 * direct GitHub API calls otherwise.
 *
 * Returns the local targetPath so callers can pass it to the agent.
 */
export async function importRemoteRepo(
  repoUrl: string,
  branch = 'main'
): Promise<ImportResult> {
  const { owner, repo } = parseRepoUrl(repoUrl);

  const targetPath = path.resolve(
    process.cwd(),
    '.filemind',
    'remote',
    `${owner}-${repo}-${branch}`
  );

  const apifyToken = process.env['APIFY_API_TOKEN'];
  const actorId = process.env['APIFY_ACTOR_ID'];
  const useApify = Boolean(apifyToken && actorId);

  console.log(
    `[remote] Importing ${owner}/${repo}@${branch} via ${useApify ? 'Apify' : 'GitHub API'}`
  );

  const output = useApify
    ? await fetchViaApify(repoUrl, branch)
    : await fetchFromGitHub(owner, repo, branch);

  const { written } = writeRepoFiles(output, targetPath);

  console.log(
    `[remote] Wrote ${written} files to ${targetPath} ` +
    `(${output.skipped.length} skipped during fetch)`
  );

  return {
    targetPath,
    repoUrl,
    branch,
    fileCount: written,
    owner,
    repo,
  };
}
