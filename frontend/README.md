# FileMind Frontend

Next.js frontend for the FileMind structure-aware codebase navigation agent.

## Setup

```bash
cd frontend
npm install
```

## Running

Start the backend first (from the project root):

```bash
npm run agent:dev
# Backend runs on http://localhost:3001
```

Then start the frontend:

```bash
npm run dev
# Frontend runs on http://localhost:3000
```

Or from the project root:

```bash
npm run frontend:dev
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_FILEMIND_API_URL` | `http://localhost:3001` | Backend API base URL |

## Demo

Default query: **How does authentication work?**
Default target path: `../demo/sample-repos/nextjs-starter`

Open http://localhost:3000 and click **Ask FileMind** to start.
