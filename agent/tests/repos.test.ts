import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';

// ─── Mock importRemoteRepo ────────────────────────────────────────────────────

vi.mock('../src/tools/remote', () => ({
  importRemoteRepo: vi.fn(),
}));

import { importRemoteRepo } from '../src/tools/remote';
const mockImport = vi.mocked(importRemoteRepo);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function app() {
  return createApp();
}

const validRepoUrl = 'https://github.com/octocat/hello-world';

const fakeImportResult = {
  targetPath: '/tmp/.filemind/remote/octocat-hello-world-main',
  repoUrl: validRepoUrl,
  branch: 'main',
  fileCount: 3,
  owner: 'octocat',
  repo: 'hello-world',
};

// ─── POST /repos/import ───────────────────────────────────────────────────────

describe('POST /repos/import — validation', () => {
  it('returns 400 when repoUrl is missing', async () => {
    const res = await request(app()).post('/repos/import').send({});
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('returns 400 when repoUrl is an empty string', async () => {
    const res = await request(app()).post('/repos/import').send({ repoUrl: '' });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('returns 400 when repoUrl is not a valid URL', async () => {
    const res = await request(app())
      .post('/repos/import')
      .send({ repoUrl: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('returns 400 when repoUrl is a valid URL but not a GitHub repo URL', async () => {
    const res = await request(app())
      .post('/repos/import')
      .send({ repoUrl: 'https://gitlab.com/some/repo' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('GitHub');
  });

  it('returns 400 when branch is provided as an empty string', async () => {
    const res = await request(app())
      .post('/repos/import')
      .send({ repoUrl: validRepoUrl, branch: '' });
    expect(res.status).toBe(400);
  });
});

describe('POST /repos/import — import error', () => {
  beforeEach(() => {
    mockImport.mockRejectedValue(new Error('GitHub API rate limited'));
  });

  afterEach(() => {
    mockImport.mockReset();
  });

  it('returns 503 when importRemoteRepo throws', async () => {
    const res = await request(app())
      .post('/repos/import')
      .send({ repoUrl: validRepoUrl });
    expect(res.status).toBe(503);
    expect(typeof res.body.error).toBe('string');
  });

  it('503 body includes error message', async () => {
    const res = await request(app())
      .post('/repos/import')
      .send({ repoUrl: validRepoUrl });
    expect(res.body.error).toContain('Repository import failed');
  });
});

describe('POST /repos/import — success', () => {
  beforeEach(() => {
    mockImport.mockResolvedValue(fakeImportResult);
  });

  afterEach(() => {
    mockImport.mockReset();
  });

  it('returns 200 on success', async () => {
    const res = await request(app())
      .post('/repos/import')
      .send({ repoUrl: validRepoUrl });
    expect(res.status).toBe(200);
  });

  it('returns targetPath in body', async () => {
    const res = await request(app())
      .post('/repos/import')
      .send({ repoUrl: validRepoUrl });
    expect(res.body.targetPath).toBe(fakeImportResult.targetPath);
  });

  it('returns repoUrl, branch, and fileCount in body', async () => {
    const res = await request(app())
      .post('/repos/import')
      .send({ repoUrl: validRepoUrl });
    expect(res.body.repoUrl).toBe(fakeImportResult.repoUrl);
    expect(res.body.branch).toBe(fakeImportResult.branch);
    expect(res.body.fileCount).toBe(fakeImportResult.fileCount);
  });

  it('passes the branch param to importRemoteRepo', async () => {
    await request(app())
      .post('/repos/import')
      .send({ repoUrl: validRepoUrl, branch: 'develop' });
    expect(mockImport).toHaveBeenCalledWith(validRepoUrl, 'develop');
  });

  it('defaults to main branch when branch not provided', async () => {
    await request(app())
      .post('/repos/import')
      .send({ repoUrl: validRepoUrl });
    expect(mockImport).toHaveBeenCalledWith(validRepoUrl, 'main');
  });
});
