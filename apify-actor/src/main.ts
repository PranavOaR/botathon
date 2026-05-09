import { Actor } from 'apify';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActorInput {
  repoUrl: string;
  branch?: string;
  maxFiles?: number;
  includeExtensions?: string[];
}

interface RemoteFileRecord {
  path: string;
  content: string;
  size: number;
}

interface SkippedFile {
  path: string;
  reason: string;
}

interface RemoteRepoOutput {
  repoUrl: string;
  owner: string;
  repo: string;
  branch: string;
  fileCount: number;
  files: RemoteFileRecord[];
  skipped: SkippedFile[];
}

interface GitHubTreeItem {
  path?: string;
  type?: string;
  size?: number;
  sha?: string;
  url?: string;
}

interface GitHubTreeResponse {
  tree: GitHubTreeItem[];
  truncated?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.md', '.json'];
const DEFAULT_MAX_FILES = 500;
const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500 KB

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
    throw new Error(`Invalid GitHub URL: ${repoUrl}. Expected format: https://github.com/owner/repo`);
  }
  return { owner: match[1], repo: match[2] };
}

function isSkippedPath(filePath: string): boolean {
  const parts = filePath.split('/');
  return parts.some((part) => SKIP_DIRS.has(part));
}

function getExtension(filePath: string): string {
  const dotIdx = filePath.lastIndexOf('.');
  return dotIdx === -1 ? '' : filePath.slice(dotIdx).toLowerCase();
}

function buildGitHubHeaders(githubToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'filemind-repo-importer/1.0',
  };
  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`;
  }
  return headers;
}

async function fetchJSON<T>(url: string, headers: Record<string, string>): Promise<T> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function fetchText(url: string, headers: Record<string, string>): Promise<string> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}: ${response.statusText}`);
  }
  return response.text();
}

// ─── Main actor logic ─────────────────────────────────────────────────────────

await Actor.init();

const input = await Actor.getInput<ActorInput>();

if (!input?.repoUrl) {
  await Actor.fail('Missing required input: repoUrl');
  process.exit(1);
}

const {
  repoUrl,
  branch = 'main',
  maxFiles = DEFAULT_MAX_FILES,
  includeExtensions = DEFAULT_EXTENSIONS,
} = input;

const allowedExts = new Set(includeExtensions.map((e) => e.toLowerCase()));
const githubToken = process.env['GITHUB_TOKEN'];
const headers = buildGitHubHeaders(githubToken);

console.log(`Importing ${repoUrl} @ ${branch}, max ${maxFiles} files`);

const { owner, repo } = parseRepoUrl(repoUrl);

// Fetch recursive git tree
const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
console.log(`Fetching tree from ${treeUrl}`);

const treeData = await fetchJSON<GitHubTreeResponse>(treeUrl, headers);

if (treeData.truncated) {
  console.warn('GitHub tree response was truncated — large repo, some files may be missing');
}

const files: RemoteFileRecord[] = [];
const skipped: SkippedFile[] = [];

for (const item of treeData.tree) {
  if (item.type !== 'blob' || !item.path) continue;

  const filePath = item.path;

  // Skip dirs like node_modules, .git, etc.
  if (isSkippedPath(filePath)) {
    skipped.push({ path: filePath, reason: 'excluded directory' });
    continue;
  }

  const ext = getExtension(filePath);

  // Skip binary extensions
  if (BINARY_EXTENSIONS.has(ext)) {
    skipped.push({ path: filePath, reason: 'binary file' });
    continue;
  }

  // Skip files not in allowed extensions
  if (!allowedExts.has(ext)) {
    skipped.push({ path: filePath, reason: `extension ${ext} not in includeExtensions` });
    continue;
  }

  // Skip files exceeding size limit
  const sizeBytes = item.size ?? 0;
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    skipped.push({ path: filePath, reason: `file too large (${Math.round(sizeBytes / 1024)}KB > 500KB)` });
    continue;
  }

  if (files.length >= maxFiles) {
    skipped.push({ path: filePath, reason: 'maxFiles limit reached' });
    continue;
  }

  // Fetch raw content
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
  try {
    const content = await fetchText(rawUrl, headers);
    files.push({ path: filePath, content, size: sizeBytes });
    console.log(`  Fetched: ${filePath}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    skipped.push({ path: filePath, reason: `fetch error: ${reason}` });
  }
}

const output: RemoteRepoOutput = {
  repoUrl,
  owner,
  repo,
  branch,
  fileCount: files.length,
  files,
  skipped,
};

// Push individual file records to dataset
await Actor.pushData(files);

// Store structured output for direct access
await Actor.setValue('OUTPUT', output);

console.log(`Done: ${files.length} files fetched, ${skipped.length} skipped`);

await Actor.exit();
