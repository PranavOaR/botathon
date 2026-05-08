import { Router } from 'express';
import { getCompletedSession } from './sessionStore';

export function createSessionsRouter(): Router {
  const router = Router();

  router.get('/sessions/:id', (req, res) => {
    const session = getCompletedSession(req.params['id'] ?? '');
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  });

  return router;
}
