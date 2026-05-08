import { NextRequest, NextResponse } from 'next/server';
import { signToken } from '../../utils/jwt';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { email, password } = await req.json() as { email: string; password: string };

  // Demo: hardcoded credentials check
  if (email !== 'demo@example.com' || password !== 'password') {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const token = signToken({ userId: 'user_001', email });
  return NextResponse.json({ token });
}
