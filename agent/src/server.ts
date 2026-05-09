import express from 'express';
import cors from 'cors';
import { CONFIG } from './config';
import { createHealthRouter } from './routes/health';
import { createQueryRouter } from './routes/query';
import { createSessionsRouter } from './routes/sessions';
import { createReposRouter } from './routes/repos';
import { createX402Middleware } from './payment/x402';
import type { AgentRunner } from './routes/query';

export function createApp(options?: { agentRunner?: AgentRunner }) {
  const app = express();

  app.use(
    cors({
      origin: CONFIG.nodeEnv !== 'production' ? true : false,
    })
  );

  app.use(express.json({ limit: '1mb' }));

  // x402 micropayment guard — no-op when X402_ENABLED !== 'true'
  const x402 = createX402Middleware();

  app.use(createHealthRouter());
  app.use('/query', x402);
  app.use('/repos', x402);
  app.use(createQueryRouter(options?.agentRunner));
  app.use(createReposRouter());
  app.use(createSessionsRouter());

  // 404 catch-all
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Global error handler (must have 4 params for Express to recognise it)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  });

  return app;
}

export function startServer(port = CONFIG.port) {
  const app = createApp();
  return app.listen(port, () => {
    console.log(`FileMind server listening on port ${port}`);
  });
}

if (require.main === module) {
  startServer();
}
