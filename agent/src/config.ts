import { config } from 'dotenv';
config();

function getEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export const CONFIG = {
  // Lazy getter — only throws when accessed (so tests can import config without the key set)
  get anthropicApiKey(): string {
    return getEnv('ANTHROPIC_API_KEY');
  },
  port: parseInt(getEnv('PORT', '3001')),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  maxFileSizeKb: parseInt(getEnv('MAX_FILE_SIZE_KB', '500')),
  maxTreeDepth: parseInt(getEnv('MAX_TREE_DEPTH', '6')),
  maxIterations: 25,
  tokenBudgetThreshold: 100_000,
  models: {
    agent: 'claude-opus-4-5',
    summarizer: 'claude-haiku-4-5',
  } as const,
  allowedExtensions: new Set(
    getEnv(
      'ALLOWED_EXTENSIONS',
      '.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.md,.json,.yaml,.yml,.toml,.env.example'
    ).split(',')
  ),
  skipDirs: new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__']),
  binaryExtensions: new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.avif',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
    '.mp4', '.mp3', '.wav', '.webm', '.ogg',
    '.exe', '.dll', '.so', '.dylib',
    '.db', '.sqlite',
  ]),
};
