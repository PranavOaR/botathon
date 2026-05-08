import { findUserByEmail, verifyPassword } from '../../utils/users';
import { signToken } from '../../utils/jwt';

interface LoginBody {
  email: string;
  password: string;
}

export async function POST(req: Request): Promise<Response> {
  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'email and password are required' }), { status: 400 });
  }

  const user = findUserByEmail(email);
  if (!user || !verifyPassword(user, password)) {
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
  }

  const token = signToken({ userId: user.id, email: user.email });
  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
