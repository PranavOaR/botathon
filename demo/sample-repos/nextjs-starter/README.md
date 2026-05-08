# Next.js Starter — FileMind Demo Repo

A minimal project used to demo FileMind's structure-aware codebase navigation.

## Authentication Flow

1. `POST /api/login` — verifies credentials via `utils/users.ts` and issues a JWT via `utils/jwt.ts`
2. `src/middleware.ts` — parses the `Authorization: Bearer <token>` header and validates the JWT
3. Protected pages/routes call `authenticate()` or `requireAuth()` from middleware

## File Structure

```
src/
├── middleware.ts          ← JWT auth middleware (authenticate, requireAuth)
├── pages/
│   ├── index.tsx          ← Home page (reads auth context)
│   └── api/
│       └── login.ts       ← POST /api/login — issues JWT
└── utils/
    ├── jwt.ts             ← signToken, verifyToken (HS256, no external deps)
    └── users.ts           ← in-memory user store, credential check
```

## Try with FileMind

```bash
# From the repo root:
cd agent && npx tsx src/index.ts "How does authentication work?" ../demo/sample-repos/nextjs-starter
```
