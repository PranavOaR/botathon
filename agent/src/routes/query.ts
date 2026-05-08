import { Router } from 'express';
import type { Request, Response } from 'express';
import { FileMindAgent } from '../agent';
import { QueryBodySchema, StreamQuerySchema } from './schemas';
import { saveCompletedSession } from './sessionStore';
import type { AgentEvent, AgentResponse } from '../types';

export interface AgentRunner {
  run(
    query: string,
    targetPath: string,
    onEvent?: (event: AgentEvent) => void
  ): Promise<AgentResponse>;
}

export function createDefaultAgentRunner(): AgentRunner {
  return {
    async run(query, targetPath, onEvent) {
      const agent = new FileMindAgent(targetPath, onEvent);
      return agent.run(query);
    },
  };
}

function writeSse(res: Response, event: AgentEvent): void {
  if (res.writableEnded || res.destroyed) return;
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function formatZodError(err: { issues: Array<{ message: string }> }): string {
  return err.issues.map((i) => i.message).join('; ');
}

export function createQueryRouter(agentRunner: AgentRunner = createDefaultAgentRunner()): Router {
  const router = Router();

  // POST /query — JSON, blocks until agent finishes
  router.post('/query', async (req: Request, res: Response) => {
    const validation = QueryBodySchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: formatZodError(validation.error) });
      return;
    }

    const { query, targetPath } = validation.data;

    try {
      const response = await agentRunner.run(query, targetPath);
      saveCompletedSession(response);
      res.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      res.status(500).json({ error: message });
    }
  });

  // GET /query/stream — SSE streaming
  router.get('/query/stream', async (req: Request, res: Response) => {
    const validation = StreamQuerySchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({ error: formatZodError(validation.error) });
      return;
    }

    const { query, targetPath } = validation.data;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let clientConnected = true;
    req.on('close', () => {
      clientConnected = false;
    });

    const onEvent = (event: AgentEvent): void => {
      if (!clientConnected) return;
      writeSse(res, event);
    };

    try {
      const response = await agentRunner.run(query, targetPath, onEvent);
      saveCompletedSession(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agent error';
      writeSse(res, { type: 'error', error: message });
    }

    if (!res.writableEnded) {
      res.end();
    }
  });

  return router;
}
