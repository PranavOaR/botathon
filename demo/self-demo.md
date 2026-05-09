# FileMind — Judging Demo Script

Total runtime: ~11 minutes. Run through these in order. Each section has a purpose statement — lead with it when talking to judges.

---

## Setup (2 min)

**Before the demo starts:**

```bash
# Terminal 1 — backend
cd agent && npm run dev
# Expect: "FileMind server listening on port 3001"

# Terminal 2 — frontend
cd frontend && npm run dev
# Expect: "ready - started server on http://localhost:3000"
```

**Verify:**

```bash
curl http://localhost:3001/health
# {"status":"ok","timestamp":"..."}
```

Have the browser open at http://localhost:3000.

Have a second terminal ready for raw `curl` commands — this shows the agent isn't a UI trick.

---

## Demo 1: Local Repo Investigation (3 min)

**Purpose:** Show the streaming tool trace. This is the core differentiator — full auditability of how the agent reached its answer.

**What to do:**

1. Open the frontend at http://localhost:3000.
2. In the **Target Path** field, enter the path to the sample repo:
   ```
   /path/to/botathon/demo/sample-repos/nextjs-starter
   ```
3. In the **Query** field, enter:
   ```
   Where is JWT validation implemented, and what does it check?
   ```
4. Click **Investigate**.

**What to show:**

- The **Reasoning Trace** panel on the left — watch tool calls appear in real time:
  ```
  tool_call:  tree  /
  tool_result: tree  Found: src/middleware.ts, src/utils/jwt.ts, src/pages/...
  tool_call:  read  src/middleware.ts
  tool_result: read  imports verifyToken from ./utils/jwt
  tool_call:  jump  verifyToken → src/utils/jwt.ts
  tool_result: jump  Found at src/utils/jwt.ts:25
  tool_call:  read  src/utils/jwt.ts  lines 25-43
  final: JWT validation is in src/utils/jwt.ts lines 25-43. verifyToken() ...
  ```
- The **Answer Panel** on the right — shows the final answer with exact file + line citations.

**What it proves:**

- The agent didn't guess or keyword-match. It followed the actual import chain: `middleware.ts` imports `verifyToken` from `./utils/jwt`, so it navigated there.
- Every step is visible. You can see which files were read, in what order, and why.
- Run the same question via raw curl to prove this isn't a frontend trick:
  ```bash
  curl -N "http://localhost:3001/query/stream?query=Where+is+JWT+validation+implemented&targetPath=/path/to/botathon/demo/sample-repos/nextjs-starter"
  ```
  The SSE events stream directly in the terminal.

---

## Demo 2: Remote GitHub Repo via Apify (3 min)

**Purpose:** Show Apify integration — investigate a public GitHub repo without cloning it.

**Requirement:** `APIFY_API_TOKEN` and `APIFY_ACTOR_ID` must be set in `agent/.env`.

**What to do:**

1. In the frontend, switch to the **GitHub Repo** tab (or use the Import field).
2. Enter a public GitHub repo URL, e.g.:
   ```
   https://github.com/vercel/next.js
   ```
   Or use a smaller repo for faster demo:
   ```
   https://github.com/expressjs/express
   ```
3. Click **Import Repo**. Watch the backend logs.
4. Once imported, enter a query:
   ```
   Where is routing middleware registered?
   ```
5. Click **Investigate**.

**What to show:**

- Backend logs during import:
  ```
  [Apify] Starting actor for https://github.com/expressjs/express
  [Apify] Actor run: run_abc123 — waiting for completion
  [Apify] Fetched 87 files from dataset
  [Apify] Wrote to /tmp/filemind-sessions/express-abc123/
  ```
- Then the same streaming tool trace as Demo 1 — the agent investigates the Apify-fetched temp directory.

**What it proves:**

- No local clone needed. The Apify actor fetches the git tree via GitHub's API and pulls raw file content.
- The agent investigates the remote repo identically to a local path — same tools, same trace, same citations.
- Demonstrates the Apify track: a published actor (`apify-actor/`) that any FileMind instance can call.

**If Apify is not configured:**

```bash
curl -X POST http://localhost:3001/repos/import \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/expressjs/express"}'
# {"error":"Apify integration not configured. Set APIFY_API_TOKEN and APIFY_ACTOR_ID."}
```
Show this honestly — explain what it would do with the tokens.

---

## Demo 3: x402 Payment Flow (2 min)

**Purpose:** Show the Zynd AI integration — a real payment gate on the API.

**Requirement:** `X402_ENABLED=true` in `agent/.env`, plus `X402_WALLET_ADDRESS`, `ZYND_API_KEY`, `ZYND_AGENT_ID` configured.

**What to do:**

1. With `X402_ENABLED=true`, send a query without a payment header:
   ```bash
   curl -X POST http://localhost:3001/query \
     -H "Content-Type: application/json" \
     -d '{"query": "test", "targetPath": "/tmp"}'
   ```

2. Show the 402 response:
   ```json
   HTTP/1.1 402 Payment Required
   {
     "error": "Payment required",
     "price": "0.01 USDC",
     "paymentUrl": "https://..."
   }
   ```

3. Now send the same request with a valid x402 payment header:
   ```bash
   curl -X POST http://localhost:3001/query \
     -H "Content-Type: application/json" \
     -H "X-Payment: <valid-payment-token>" \
     -d '{"query": "Where is JWT implemented?", "targetPath": "/path/to/sample-repo"}'
   ```
   The request goes through and the agent runs normally.

**What it proves:**

- FileMind is a payable AI agent. Each investigation costs `X402_PRICE_USDC` USDC.
- The payment layer is middleware — it doesn't change the agent logic at all.
- When `X402_ENABLED=false`, all requests pass through. The integration is feature-flagged so the demo works without real credentials.

---

## Superplane Workflow Event (1 min)

**Purpose:** Show the Superplane integration emitting a workflow event after an investigation completes.

**Requirement:** `SUPERPLANE_ENABLED=true` in `agent/.env`, plus `SUPERPLANE_API_TOKEN` and `SUPERPLANE_CANVAS_ID` configured.

**What to do:**

1. Run any investigation (Demo 1 setup works fine).
2. After the agent returns its answer, show the backend terminal logs:
   ```
   [Superplane] POST https://api.superplane.dev/v1/events
   [Superplane] Event: filemind.investigation.completed
   [Superplane] Payload: { sessionId: "abc123", iterationCount: 4, filesRead: 3 }
   [Superplane] Response: 200 OK
   ```

**What it proves:**

- FileMind integrates into a broader workflow automation system. Every investigation emits a structured event that Superplane can route to other workflows (Slack alerts, dashboards, triggers).
- When `SUPERPLANE_ENABLED=false` (default), no outbound calls are made. Zero-cost to run without credentials.
