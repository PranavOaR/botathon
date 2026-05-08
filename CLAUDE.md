# FileMind — Structure-Aware Codebase Navigation Agent

## Project Context

**What:** A code navigation agent that answers questions about codebases by *exploring* them with primitive tools (tree, grep, read, jump) — not vector embeddings or RAG. Built for Botathon 2026.

**Why it's different from RAG:** RAG pre-embeds everything (stale, structure-blind). FileMind explores on-demand (fresh, structure-aware, follows imports like a senior developer).

**Hackathon tracks:** Zynd AI (x402 micropayments) + Apify (remote repo fetching)

---

## Repository Structure

```
filemind/
├── agent/src/
│   ├── agent.ts              # Main agent loop — Claude Opus 4.5 + tool use
│   ├── config.ts             # Env vars, constants, model names
│   ├── types.ts              # Shared types (FileRecord, SessionState, AgentEvent…)
│   ├── tools/
│   │   ├── index.ts          # Tool registry + dispatcher
│   │   ├── tree.ts           # Directory tree traversal
│   │   ├── read.ts           # Selective file reading + import parsing
│   │   ├── grep.ts           # Regex search across codebase
│   │   ├── jump.ts           # Symbol/import traversal (go-to-definition)
│   │   ├── summarize.ts      # Claude Haiku-powered file summarizer (cached)
│   │   ├── remote.ts         # GitHub raw fetch + Apify actor fallback
│   │   └── parseImports.ts   # Language-aware import/export extraction
│   ├── memory/
│   │   ├── sessionStore.ts   # Per-session FileRecord map (immutable updates)
│   │   └── importGraph.ts    # Directed import graph with cycle detection
│   ├── payment/
│   │   └── x402.ts           # x402 micropayment middleware (Zynd AI)
│   ├── routes/
│   │   ├── query.ts          # POST /query (JSON) + GET /query/stream (SSE)
│   │   ├── health.ts         # GET /health
│   │   ├── sessions.ts       # GET /sessions/:id
│   │   └── schemas.ts        # Zod validation schemas
│   └── server.ts             # Express bootstrap
├── apify-actor/
│   ├── src/main.ts           # Actor: takes GitHub repo URL → file tree + content
│   └── .actor/actor.json     # Apify actor manifest
├── zynd-deploy/
│   ├── agent.manifest.json   # Zynd agent identity + pricing config
│   └── deploy.sh             # Build → Railway → Vercel → Zynd registration
├── frontend/
│   ├── app/page.tsx          # Main page
│   ├── components/
│   │   ├── QueryInput.tsx
│   │   ├── ReasoningTrace.tsx  # Live SSE event stream
│   │   └── AnswerPanel.tsx     # Markdown + code highlighting
│   └── lib/sseClient.ts      # EventSource wrapper
└── demo/
    ├── self-demo.md          # Self-referential demo script
    └── rag-comparison.md     # RAG vs FileMind comparison script
```

---

## Architecture

```
Frontend (Next.js) --SSE--> Express Server ---> Agent Loop (Claude Opus 4.5)
                                                      |
                                   +------------------+------------------+
                                   v                                     v
                              Tools (tree/read/grep/jump/summarize)   Memory
                                   |                              SessionStore
                                   v                              ImportGraph
                              Apify Actor (remote repos)
                              Claude Haiku 4.5 (summaries)
```

**Key flows:**
1. User submits query → server creates session → agent loop runs → tools update SessionStore + ImportGraph → events stream over SSE → final answer returned
2. Each `read` call parses imports/exports and updates ImportGraph
3. `summarize` uses Haiku and caches result on FileRecord

---

## Models

- **Agent loop:** `claude-opus-4-5` — best reasoning for multi-hop navigation
- **File summarization:** `claude-haiku-4-5` — fast, cheap, cached per session

---

## Environment Variables

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
NODE_ENV=development

# Apify (Phase 5)
APIFY_API_TOKEN=apify_api_...
GITHUB_TOKEN=ghp_...         # Optional: raises GitHub API rate limit

# Zynd AI (Phase 6)
ZYND_API_KEY=...
ZYND_AGENT_ID=...

# Payment (keep false until final demo)
X402_ENABLED=false
X402_PRICE_USDC=0.01
X402_WALLET_ADDRESS=0x...

# File system limits
MAX_FILE_SIZE_KB=500
MAX_TREE_DEPTH=6
```

---

## Implementation Phases

| Phase | Focus | Day | Critical Path |
|-------|-------|-----|---------------|
| 1 | Core agent: tree + read + sessionStore + agent loop | Day 1 AM | Yes |
| 2 | Full tools: grep + jump + summarize + importGraph | Day 1 PM | Yes |
| 3 | Server + SSE streaming | Day 1 Eve | Yes |
| 4 | Next.js frontend | Day 2 AM | Yes (demo) |
| 5 | Remote repos: Apify + remote.ts tool | Day 2 PM | No |
| 6 | Zynd AI deployment + x402 payment | Day 2 PM/Eve | No (but Zynd track) |
| 7 | Demo polish: self-demo, RAG comparison, video, README | Day 2 Eve | Yes (judging) |

---

## Critical Coding Rules

### Tools MUST return tool_result — never throw

```typescript
// WRONG
throw new Error('File not found')

// CORRECT
return { error: `File not found: ${path}. Check tree output for correct paths.` }
```

### SessionStore updates MUST be immutable

```typescript
// WRONG
session.files[path].summary = 'hello'

// CORRECT
const updatedRecord = { ...session.files[path], summary: 'hello' }
return { ...session, files: { ...session.files, [path]: updatedRecord } }
```

### ImportGraph MUST detect cycles (BFS with visited set)

### Tree traversal MUST skip: `node_modules`, `.git`, `.next`, `dist`, `build`, `__pycache__`, symlinks, binary files

### Agent loop hard cap: 25 iterations max. Abort on repeated identical tool calls.

---

## Edge Cases

1. **Circular imports** — track visited set in BFS, return partial graph
2. **Binary files** — skip via null-byte sniff or extension list
3. **Large repos (>500 files)** — truncate tree, tell agent to use `tree(subdir)`
4. **Symlinks** — skip in traversal
5. **File not found** — return structured error as tool_result
6. **API rate limits** — exponential backoff (1s, 2s, 4s) on 429
7. **Token budget** — compact old tool_results when history > 100k tokens

---

## SSE Event Format

```
data: {"type":"tool_call","tool":"tree","input":{"path":"/"}}
data: {"type":"tool_result","tool":"tree","summary":"Found Next.js project..."}
data: {"type":"final","content":"Authentication uses JWT tokens..."}
data: {"type":"done","iterationCount":4}
```

Disable proxy buffering: `res.setHeader('X-Accel-Buffering', 'no')`

---

## Hackathon Submission Checklist

- [ ] README with ASCII architecture diagram
- [ ] `.env.example` documented
- [ ] Demo video ≤2 min
- [ ] RAG vs FileMind comparison screenshot
- [ ] Zynd agent registered at deployer.zynd.ai
- [ ] Apify actor published
- [ ] GitHub repo public
- [ ] Post on X with `#Botathon2026`

---

## Test Strategy (Hackathon-Lite)

- Vitest smoke tests per tool against `agent/test/fixtures/` (tiny fake repo)
- One agent integration test with mocked Anthropic client
- Manual `curl -N /query/stream` SSE check
- Full 80% coverage deferred — prioritize tool correctness
