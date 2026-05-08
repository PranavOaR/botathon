export interface User {
  id: string;
  email: string;
  passwordHash: string;
}

// In-memory store — demo only
const USERS: User[] = [
  { id: 'user_001', email: 'demo@example.com', passwordHash: 'plain:password' },
  { id: 'user_002', email: 'admin@example.com', passwordHash: 'plain:admin123' },
];

export function findUserByEmail(email: string): User | undefined {
  return USERS.find((u) => u.email === email);
}

export function verifyPassword(user: User, candidate: string): boolean {
  // Demo-only plain-text check — never do this in production
  return user.passwordHash === `plain:${candidate}`;
}
