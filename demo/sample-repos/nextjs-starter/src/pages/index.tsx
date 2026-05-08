import { authenticate } from '../middleware';

interface PageProps {
  request: Request;
}

// Demo home page — checks auth context from request headers
export default function HomePage({ request }: PageProps) {
  const ctx = authenticate(request.headers.get('authorization') ?? undefined);

  return {
    title: 'Next.js Starter',
    user: ctx ? { userId: ctx.userId, email: ctx.email } : null,
    message: ctx ? `Welcome, ${ctx.email}` : 'Please log in',
  };
}
