import { verifyToken } from './utils/jwt';

export interface AuthContext {
  userId: string;
  email: string;
}

/**
 * Extracts and validates a Bearer JWT from an Authorization header.
 * Returns the decoded context, or null if the token is missing/invalid.
 *
 * Usage:
 *   const auth = authenticate(request.headers['authorization'])
 *   if (!auth) return { status: 401, body: 'Unauthorized' }
 */
export function authenticate(authHeader: string | undefined): AuthContext | null {
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) return null;

  return { userId: payload.userId, email: payload.email };
}

export function requireAuth(
  authHeader: string | undefined,
  handler: (ctx: AuthContext) => Response
): Response {
  const ctx = authenticate(authHeader);
  if (!ctx) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return handler(ctx);
}
