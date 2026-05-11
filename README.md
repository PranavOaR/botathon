# FileMind

**Live demo:** https://botathon-nine.vercel.app/

FileMind is a structure-aware codebase investigation agent built for Botathon 2026. Instead of pre-indexing files into vector embeddings, it navigates codebases on demand using primitive tools — tree, read, grep, jump, summarize — the same way a senior developer would. Every step is auditable. There are no stale embeddings, no black-box similarity scores, and no guesses about what a file contains.

---

## Architecture

```
Browser (Next.js :3000)
        |
        | HTTP / SSE
        v
Express Server (:3001)
        |
        +-- POST /query          → JSON response (blocking)
        +-- GET  /query/stream   → SSE event stream (real-time)
        +-- GET  /sessions/:id   → Past session lookup
        +-- GET  /health
        +-- GET  /integrations/status -> Sponsor integration config (public, no auth)
        |
        v
FileMindAgent (Claude Opus 4.5 + tool use)
        |
   +----+----+------+----------+-----------+
   v    v    v      v          v
 tree read grep  jump     summarize
              |                    |
              v                    v
         SessionStore         Claude Haiku 4.5
         ImportGraph          (cached per file)
              |
              v
        Apify Actor (remote repos)
```

**Key design decisions:**

- The agent loop runs up to 25 iterations. Each iteration calls one or more tools, updates SessionStore and ImportGraph, then emits SSE events.
- `read` parses imports/exports and wires edges into the ImportGraph automatically. `jump` uses that graph for instant go-to-definition without re-reading files.
- `summarize` calls Haiku and caches the result on the FileRecord. Re-summarizing the same file returns the cache.
- SessionStore updates are always immutable — new objects, never mutations.

---

## Quick Start

### Prerequisites

- Node.js 20+
- An Anthropic API key

### 1. Install dependencies

```bash
npm run agent:dev   # installs and starts backend on :3001
npm run frontend:dev # installs and starts frontend on :3000
```

Or install manually:

```bash
cd agent && npm install
cd ../frontend && npm install
```

### 2. Configure environment

```bash
cp agent/.env.example agent/.env
# edit agent/.env — see env vars section below
```

At minimum you need `ANTHROPIC_API_KEY`. Everything else has a working default or can be left disabled.

### 3. Start

```bash
# Backend
cd agent && npm run dev

# Frontend (separate terminal)
cd frontend && npm run dev
```

Open http://localhost:3000. Enter a path to a local directory and ask a question.

---

## How Local Path Mode Works

You give the agent a `targetPath` (an absolute path on the server's filesystem) and a natural language query. The agent:

1. Calls `tree("/")` to map the directory structure up to depth 6.
2. Selects likely relevant files from the tree.
3. Calls `read` on those files, which parses imports and updates the ImportGraph.
4. Follows import chains via `jump` or additional `read` calls.
5. Uses `grep` to search for symbols, patterns, or text across all files.
6. Calls `summarize` on large files it needs a quick overview of.
7. Returns a final answer with citations: which files, which lines.

The backend validates that all paths stay inside `targetPath`. Symlinks are skipped. Binary files are skipped. Files over 500 KB are skipped.

**Example (curl):**

```bash
# Blocking JSON
curl -X POST http://localhost:3001/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Where is JWT validation implemented?", "targetPath": "/path/to/your/repo"}'

# Streaming SSE
curl -N "http://localhost:3001/query/stream?query=Where+is+JWT+validation&targetPath=/path/to/repo"
```

**SSE event format:**

```
data: {"type":"tool_call","tool":"tree","input":{"path":"/"}}
data: {"type":"tool_result","tool":"tree","summary":"Found Next.js project with src/..."}
data: {"type":"tool_call","tool":"read","input":{"path":"src/middleware.ts"}}
data: {"type":"tool_result","tool":"read","summary":"imports verifyToken from ./utils/jwt..."}
data: {"type":"final","content":"JWT validation is in src/utils/jwt.ts, lines 25-43..."}
data: {"type":"done","iterationCount":4}
```

---

## How GitHub Repo Mode Works (Apify)

FileMind can investigate remote GitHub repositories without cloning them locally. This uses the Apify actor (`apify-actor/`) as the ingestion layer.

**What happens:**

1. You POST a GitHub repo URL to `POST /repos/import`.
2. The backend calls the Apify actor with the URL.
3. The actor fetches the full git tree from GitHub's API, then downloads each allowed file's raw content.
4. The actor pushes file records to its Apify dataset.
5. The backend pulls the dataset, writes the files to a temp directory on the server.
6. The agent investigates that temp directory like any local path.

**Requirements:**

- `APIFY_API_TOKEN` — your Apify token
- `APIFY_ACTOR_ID` — the published actor ID (e.g. `username/filemind-repo-importer`)
- `GITHUB_TOKEN` — optional but raises GitHub's API rate limit from 60 to 5000 req/hr

**Without `APIFY_API_TOKEN` and `APIFY_ACTOR_ID`:** `POST /repos/import` falls back to the direct GitHub API for public repos — it fetches the file tree from GitHub's tree API and downloads raw content from `raw.githubusercontent.com`. The 503 only occurs if this direct fetch itself fails. Local path mode is always unaffected.

**Apify actor limits:**

- Default max 500 files per repo
- Files over 500 KB are skipped
- Binary files are skipped (images, fonts, archives, etc.)
- `node_modules`, `.git`, `dist`, `build`, `.next` are skipped

---

## Environment Variables

### Required

```env
ANTHROPIC_API_KEY=sk-ant-...     # Claude API key — required for all agent operations
PORT=3001                         # Default: 3001
NODE_ENV=development              # development | production
```

### Apify (remote GitHub repos)

```env
APIFY_API_TOKEN=apify_api_...    # Your Apify account token
APIFY_ACTOR_ID=username/filemind-repo-importer  # Published actor ID
GITHUB_TOKEN=ghp_...             # Optional — raises GitHub API rate limit 60→5000/hr
```

Without `APIFY_API_TOKEN` and `APIFY_ACTOR_ID`, GitHub repo import returns 503. Local path mode works fine without these.

### Zynd AI x402 (micropayment middleware)

```env
X402_ENABLED=false               # Set true to enable payment gate
X402_PRICE_USDC=0.01             # Price per query in USDC
X402_WALLET_ADDRESS=0x...        # Your receiving wallet address
ZYND_API_KEY=...                 # Zynd API key for payment verification
ZYND_AGENT_ID=...                # Your registered agent ID on deployer.zynd.ai
```

When `X402_ENABLED=false` (default): all requests pass through, no payment required.

When `X402_ENABLED=true`: `POST /query`, `GET /query/stream`, and `POST /repos/import` are payment-gated. `GET /health`, `GET /sessions/:id`, and `GET /integrations/status` are always public.

If `X402_WALLET_ADDRESS` or `ZYND_AGENT_ID` is missing while enabled, routes return HTTP 503 (misconfigured) rather than a misleading 402.

**HTTP 402 body (payment required):**
```json
{
  "error": "Payment required",
  "provider": "zynd",
  "price": "0.01",
  "currency": "USDC",
  "walletAddress": "0xYourWallet",
  "agentId": "your-agent-id",
  "paymentHeader": "x-payment"
}
```

**HTTP 503 body (misconfigured):**
```json
{
  "error": "Payment gateway misconfigured: X402_WALLET_ADDRESS is required when X402_ENABLED=true"
}
```

### Superplane (workflow event tracking)

```env
SUPERPLANE_ENABLED=false         # Set true to enable event emission
SUPERPLANE_API_TOKEN=...         # Your Superplane API token
SUPERPLANE_CANVAS_ID=...         # Target canvas ID
SUPERPLANE_ENDPOINT=https://api.superplane.dev/v1/events
```

When `SUPERPLANE_ENABLED=false` (default): no events are emitted, no external calls made.
When `SUPERPLANE_ENABLED=true`: the server POSTs a `filemind.investigation.completed` event to Superplane after each successful investigation.

### File system limits

```env
MAX_FILE_SIZE_KB=500             # Default: 500. Files over this are skipped.
MAX_TREE_DEPTH=6                 # Default: 6. Tree traversal depth cap.
```

---

## Integration Status API

`GET /integrations/status` returns the current configuration state for all sponsor integrations. Always public — never x402-guarded. The frontend fetches this on page load to set accurate integration badges.

**Example response (all disabled):**
```json
{
  "apify": {
    "configured": false,
    "mode": "github_fallback",
    "hasApiToken": false,
    "hasActorId": false,
    "githubTokenConfigured": false
  },
  "zynd": {
    "enabled": false,
    "configured": false,
    "price": "0.01",
    "currency": "USDC",
    "walletAddress": "",
    "agentId": "",
    "paymentHeader": "x-payment"
  },
  "superplane": {
    "enabled": false,
    "configured": false,
    "hasApiToken": false,
    "hasCanvasId": false,
    "endpoint": "https://api.superplane.dev/v1/events"
  }
}
```

Secret values (API keys) are never included — only boolean `has*` fields.

---

## Hackathon Tracks

### Zynd AI — x402 Micropayments

FileMind uses the x402 payment protocol to gate API access. When enabled, each query costs `X402_PRICE_USDC` USDC. The middleware verifies the payment header before the agent runs. This demonstrates a payable AI agent endpoint — you can query any repo and pay per investigation.

### Apify — Remote Repository Ingestion

The Apify actor (`apify-actor/`) ingests any public GitHub repository without requiring a local clone. It fetches the full git tree via GitHub's API, downloads raw file content, and pushes structured records to an Apify dataset. FileMind pulls that dataset to create an ephemeral local workspace for the agent to investigate.

---

## Models

| Component | Model | Why |
|-----------|-------|-----|
| Agent loop | claude-opus-4-5 | Best multi-hop reasoning and tool use |
| File summarizer | claude-haiku-4-5 | Fast, cheap, cached per session |

---

## Project Structure

```
filemind/
├── agent/src/
│   ├── agent.ts              # Main agent loop
│   ├── config.ts             # Env vars, model names, limits
│   ├── types.ts              # Shared types
│   ├── tools/                # tree, read, grep, jump, summarize
│   ├── memory/               # SessionStore, ImportGraph
│   ├── payment/              # x402 middleware
│   └── routes/               # Express route handlers + Zod schemas
├── apify-actor/src/main.ts   # GitHub repo ingestion actor
├── frontend/                 # Next.js investigation cockpit
└── demo/                     # Judging demo scripts + sample repos
```
