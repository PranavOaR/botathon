/**
 * End-to-end dispatch integration tests using the demo/sample-repos/nextjs-starter fixture.
 * These tests verify the full tool dispatch pipeline including importGraph wiring.
 * No real Anthropic API calls are made.
 */
import { describe, it, expect, vi } from 'vitest';
import { join } from 'path';
import { dispatchTool } from '../src/tools/index';
import { createSession } from '../src/memory/sessionStore';
import { getImports, getImportedBy } from '../src/memory/importGraph';

const SAMPLE_REPO = join(process.cwd(), '..', 'demo', 'sample-repos', 'nextjs-starter');

describe('integration — read populates importGraph', () => {
  it('reading middleware.ts wires importGraph edge to jwt.ts', async () => {
    let session = createSession(SAMPLE_REPO);
    const { updatedSession } = await dispatchTool(
      'read',
      { path: 'src/middleware.ts' },
      session
    );
    session = updatedSession;

    const imports = getImports(session.importGraph, 'src/middleware.ts');
    expect(imports).toContain('src/utils/jwt.ts');
  });

  it('after reading both files, importedBy shows middleware as importer of jwt', async () => {
    let session = createSession(SAMPLE_REPO);
    ({ updatedSession: session } = await dispatchTool('read', { path: 'src/middleware.ts' }, session));
    ({ updatedSession: session } = await dispatchTool('read', { path: 'src/utils/jwt.ts' }, session));

    const importedBy = getImportedBy(session.importGraph, 'src/utils/jwt.ts');
    expect(importedBy).toContain('src/middleware.ts');
  });
});

describe('integration — grep with file_extension excludes non-matching files', () => {
  it('grep verifyToken with .ts extension does not return README.md', async () => {
    const session = createSession(SAMPLE_REPO);
    const { output } = await dispatchTool(
      'grep',
      { pattern: 'verifyToken', file_extension: '.ts' },
      session
    );
    expect(output.content).toContain('jwt.ts');
    expect(output.content).not.toContain('README.md');
  });

  it('grep verifyToken in src/utils directory finds only jwt.ts hits', async () => {
    const session = createSession(SAMPLE_REPO);
    const { output } = await dispatchTool(
      'grep',
      { pattern: 'verifyToken', directory: 'src/utils' },
      session
    );
    expect(output.content).toContain('jwt.ts');
  });
});

describe('integration — jump with from_file uses importGraph', () => {
  it('jump verifyToken after reading middleware returns Defined in: jwt.ts', async () => {
    let session = createSession(SAMPLE_REPO);
    ({ updatedSession: session } = await dispatchTool('read', { path: 'src/middleware.ts' }, session));

    const { output } = await dispatchTool(
      'jump',
      { symbol: 'verifyToken', from_file: 'src/middleware.ts' },
      session
    );

    expect(output.content).toContain('Symbol: verifyToken');
    expect(output.content).toMatch(/Defined in:.*jwt\.ts/);
    expect(output.content).toMatch(/Imported by:/);
    expect(output.content).toContain('src/middleware.ts');
  });

  it('jump with unknown symbol suggests grep', async () => {
    const session = createSession(SAMPLE_REPO);
    const { output } = await dispatchTool(
      'jump',
      { symbol: 'absolutelyNonExistentSymbol123' },
      session
    );
    expect(output.content).toContain('Symbol not found');
    expect(output.content).toContain('Try grep(');
  });
});

describe('integration — summarize with fake dep + cache', () => {
  it('first call stores summary; second call returns [cached]', async () => {
    const summarizeFile = vi.fn().mockResolvedValue('jwt utility: signs and verifies tokens.');
    let session = createSession(SAMPLE_REPO);

    const { updatedSession: s1, output: out1 } = await dispatchTool(
      'summarize',
      { path: 'src/utils/jwt.ts' },
      session,
      { summarizeFile }
    );
    expect(summarizeFile).toHaveBeenCalledTimes(1);
    expect(out1.content).not.toContain('[cached]');

    const { output: out2 } = await dispatchTool(
      'summarize',
      { path: 'src/utils/jwt.ts' },
      s1,
      { summarizeFile }
    );
    expect(summarizeFile).toHaveBeenCalledTimes(1); // no additional call
    expect(out2.content).toContain('[cached]');
  });
});
