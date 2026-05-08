import { z } from 'zod';

export const QueryBodySchema = z.object({
  query: z.string().min(1).max(2000),
  targetPath: z.string().min(1),
});

export const StreamQuerySchema = z.object({
  query: z.string().min(1).max(2000),
  targetPath: z.string().min(1),
});

export type QueryBody = z.infer<typeof QueryBodySchema>;
export type StreamQuery = z.infer<typeof StreamQuerySchema>;
