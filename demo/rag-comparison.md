# FileMind vs RAG — Technical Comparison

## The core difference

RAG (Retrieval-Augmented Generation) pre-indexes a codebase into vector embeddings, then retrieves "semantically similar" chunks when you ask a question. FileMind does neither. It starts from zero every time and navigates the codebase with tools.

| | RAG | FileMind |
|---|---|---|
| **Indexing** | Pre-indexes all files into vectors | No index — explores on demand |
| **Freshness** | Embeddings go stale when files change | Always reads current file content |
| **Retrieval method** | Cosine similarity on embeddings | Tree traversal + import following + grep |
| **Auditability** | Black box — no trace of why chunks were selected | Full tool trace — every step is visible |
| **Import understanding** | Semantic similarity to "import" text | Follows actual import edges in the graph |
| **Structure awareness** | None — files are flat text chunks | Understands directory layout, module boundaries |
| **Answer path** | query → embedding → nearest chunks → answer | query → tree → read → grep → jump → answer |
| **Works on fresh clone** | No — must index first | Yes — starts immediately |
| **Cost model** | High upfront indexing cost | Per-query API cost only |

---

## Concrete example: "Where is JWT validation implemented?"

This is a real question you'd ask when onboarding to a codebase. Here's how each approach handles it on the `demo/sample-repos/nextjs-starter` repo.

### How RAG handles it

1. Embed the query "Where is JWT validation implemented?"
2. Compare against pre-computed embeddings for all file chunks.
3. Retrieve the top-K chunks by cosine similarity.

**What it retrieves:**

- The README.md sentence "This project uses JWT for authentication" — high similarity to the query.
- The `login.ts` API route that *calls* JWT functions — matches "JWT" as text.
- Maybe `middleware.ts` if the phrase "JWT" appears in a comment.

**What RAG misses:**

- `middleware.ts` imports `verifyToken` from `./utils/jwt` — but if the word "JWT" doesn't appear prominently in `middleware.ts`, the chunk may score low.
- `jwt.ts` contains the actual `verifyToken()` implementation — but the embedding for this file competes against every other file mentioning "JWT".
- The relationship *between* files — that `middleware.ts` is the call site and `jwt.ts` is the implementation — is invisible to cosine similarity. RAG retrieves chunks, not call chains.

**RAG answer:** "JWT validation appears to be in `login.ts` and the authentication utilities." It found files mentioning JWT, not the validation logic itself.

### How FileMind handles it

```
tool_call:  tree  /
→ src/middleware.ts, src/utils/jwt.ts, src/utils/users.ts, src/pages/api/login.ts

tool_call:  read  src/middleware.ts
→ line 1: import { verifyToken } from './utils/jwt'
→ line 16: export function authenticate(authHeader) { ... verifyToken(token) ... }
→ ImportGraph: middleware.ts → utils/jwt.ts

tool_call:  jump  verifyToken  src/middleware.ts
→ Resolved via ImportGraph: utils/jwt.ts

tool_call:  read  src/utils/jwt.ts  lines 25-43
→ export function verifyToken(token: string): JwtPayload | null {
→   const parts = token.split('.')
→   ...checks signature with HMAC-SHA256...
→   ...checks exp timestamp...
→ }

final: JWT validation is in src/utils/jwt.ts lines 25-43.
       verifyToken() checks: (1) token has 3 parts, (2) HMAC-SHA256 signature,
       (3) expiry timestamp. The call site is src/middleware.ts:22, inside
       authenticate(), which is called by requireAuth().
```

**FileMind answer:** Exact file, exact lines, exact logic, full call chain. Cites `src/utils/jwt.ts:25-43` and `src/middleware.ts:22`.

---

## Why the difference matters at scale

The JWT example is a simple two-file chain. Real codebases have deeper chains:

```
API route → service layer → repository → database client → connection pool
```

RAG retrieves chunks. It cannot follow a chain like this because each hop requires knowing the output of the previous hop — which specific symbol is imported, which file it resolves to, which lines define it.

FileMind's `jump` tool follows the actual ImportGraph. After `read` parses imports from each file, the graph knows that `src/api/users.ts` imports `UserService` from `src/services/users.ts` which imports `UserRepository` from `src/db/users.ts`. `jump` traverses this graph in O(1) per hop — no re-reading, no re-embedding.

---

## What RAG is actually good at

RAG is not bad — it's solving a different problem. It excels at:

- **Semantic search across documentation**: "What does this project say about rate limiting?" — many files, no import chains.
- **Finding examples by concept**: "Show me all the places error handling is done" — spread across files with no structural connection.
- **Large knowledge bases**: Millions of documents where you need approximate retrieval fast.

FileMind is built for a different task: **precise, auditable code investigation**. When a developer asks "why does this API return 403?", they need the actual call chain traced, not the top-5 files that mention "403".

---

## The auditability argument

When a RAG system answers "authentication is in `auth.ts`", you have no way to know:

- Which chunks it retrieved
- Why those chunks scored highest
- Whether it missed a more relevant file
- Whether the retrieved chunks are current (embeddings may be stale)

When FileMind answers the same question, you have a complete trace:

```
Investigated: src/middleware.ts (lines 1-25), src/utils/jwt.ts (lines 25-43)
Tools used: tree, read(middleware.ts), jump(verifyToken), read(jwt.ts:25-43)
Iterations: 4
```

For a code review tool, a security audit tool, or an onboarding assistant — the trace is not a nice-to-have. It's the only way to trust the answer.
