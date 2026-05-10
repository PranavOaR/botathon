import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { importRemoteRepo } from '../tools/remote';

// ─── Schema ───────────────────────────────────────────────────────────────────

const ImportRepoBodySchema = z.object({
  repoUrl: z
    .string()
    .min(1, 'repoUrl is required')
    .url('repoUrl must be a valid URL')
    .refine(
      (url) => /github\.com\/[^/]+\/[^/]+/.test(url),
      'repoUrl must be a GitHub repository URL (e.g. https://github.com/owner/repo)'
    ),
  branch: z.string().min(1).optional().default('main'),
});

type ImportRepoBody = z.infer<typeof ImportRepoBodySchema>;

// ─── Router ───────────────────────────────────────────────────────────────────

export function createReposRouter(): Router {
  const router = Router();

  /**
   * POST /repos/import
   * Fetches a remote GitHub repo and writes it locally under .filemind/remote/.
   * Returns the local targetPath so the caller can use it with /query or /query/stream.
   */
  router.post('/repos/import', async (req: Request, res: Response) => {
    const validation = ImportRepoBodySchema.safeParse(req.body);
    if (!validation.success) {
      const message = validation.error.issues.map((i) => i.message).join('; ');
      res.status(400).json({ error: message });
      return;
    }

    const { repoUrl, branch } = validation.data as ImportRepoBody;

    try {
      const result = await importRemoteRepo(repoUrl, branch);
      res.json({
        targetPath: result.targetPath,
        repoUrl: result.repoUrl,
        branch: result.branch,
        fileCount: result.fileCount,
        owner: result.owner,
        repo: result.repo,
        importMode: result.importMode,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import repository';
      console.error('[repos] Import error:', message);
      res.status(503).json({ error: `Repository import failed: ${message}` });
    }
  });

  return router;
}
