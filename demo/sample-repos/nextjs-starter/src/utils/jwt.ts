import { createHmac, randomBytes } from 'crypto';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod';

export interface JwtPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

function base64url(buf: string): string {
  return Buffer.from(buf).toString('base64url');
}

export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000);
  const full: JwtPayload = { ...payload, iat: now, exp: now + 60 * 60 * 24 * 7 }; // 7 days
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(full));
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts as [string, string, string];
  const expected = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');

  if (sig !== expected) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as JwtPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null; // expired
    return payload;
  } catch {
    return null;
  }
}

export function generateSessionId(): string {
  return randomBytes(16).toString('hex');
}
