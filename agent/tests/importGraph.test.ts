import { describe, it, expect } from 'vitest';
import {
  createImportGraph,
  addEdge,
  getImports,
  getImportedBy,
  getTransitiveDeps,
} from '../src/memory/importGraph';

describe('createImportGraph', () => {
  it('creates an empty graph', () => {
    const g = createImportGraph();
    expect(getImports(g, 'a.ts')).toEqual([]);
    expect(getImportedBy(g, 'a.ts')).toEqual([]);
  });
});

describe('addEdge', () => {
  it('adds a directed edge from→to', () => {
    const g = addEdge(createImportGraph(), 'a.ts', 'b.ts');
    expect(getImports(g, 'a.ts')).toContain('b.ts');
    expect(getImportedBy(g, 'b.ts')).toContain('a.ts');
  });

  it('does not mutate the original graph', () => {
    const original = createImportGraph();
    const updated = addEdge(original, 'a.ts', 'b.ts');
    expect(getImports(original, 'a.ts')).toEqual([]);
    expect(getImports(updated, 'a.ts')).toContain('b.ts');
  });

  it('supports multiple edges from the same file', () => {
    let g = createImportGraph();
    g = addEdge(g, 'a.ts', 'b.ts');
    g = addEdge(g, 'a.ts', 'c.ts');
    expect(getImports(g, 'a.ts')).toContain('b.ts');
    expect(getImports(g, 'a.ts')).toContain('c.ts');
  });

  it('supports multiple files importing the same file', () => {
    let g = createImportGraph();
    g = addEdge(g, 'a.ts', 'shared.ts');
    g = addEdge(g, 'b.ts', 'shared.ts');
    expect(getImportedBy(g, 'shared.ts')).toContain('a.ts');
    expect(getImportedBy(g, 'shared.ts')).toContain('b.ts');
  });

  it('adding the same edge twice does not create duplicate entries', () => {
    let g = createImportGraph();
    g = addEdge(g, 'a.ts', 'b.ts');
    g = addEdge(g, 'a.ts', 'b.ts');
    expect(getImports(g, 'a.ts').filter((x) => x === 'b.ts')).toHaveLength(1);
  });

  it('structural sharing — other entries are not affected', () => {
    let g = createImportGraph();
    g = addEdge(g, 'x.ts', 'y.ts');
    const beforeSet = getImports(g, 'x.ts');
    g = addEdge(g, 'a.ts', 'b.ts');
    // x.ts entry is unchanged
    expect(getImports(g, 'x.ts')).toEqual(beforeSet);
  });
});

describe('getTransitiveDeps', () => {
  it('returns direct imports at depth 1', () => {
    let g = createImportGraph();
    g = addEdge(g, 'a.ts', 'b.ts');
    g = addEdge(g, 'a.ts', 'c.ts');
    const deps = getTransitiveDeps(g, 'a.ts', 1);
    expect(deps).toContain('b.ts');
    expect(deps).toContain('c.ts');
    expect(deps).not.toContain('a.ts'); // root excluded
  });

  it('traverses transitively up to maxDepth', () => {
    let g = createImportGraph();
    g = addEdge(g, 'a.ts', 'b.ts');
    g = addEdge(g, 'b.ts', 'c.ts');
    g = addEdge(g, 'c.ts', 'd.ts');

    expect(getTransitiveDeps(g, 'a.ts', 1)).not.toContain('c.ts');
    expect(getTransitiveDeps(g, 'a.ts', 2)).toContain('c.ts');
    expect(getTransitiveDeps(g, 'a.ts', 2)).not.toContain('d.ts');
    expect(getTransitiveDeps(g, 'a.ts', 3)).toContain('d.ts');
  });

  it('is cycle-safe — each node visited at most once', () => {
    let g = createImportGraph();
    g = addEdge(g, 'a.ts', 'b.ts');
    g = addEdge(g, 'b.ts', 'a.ts'); // cycle
    const deps = getTransitiveDeps(g, 'a.ts', 10);
    expect(deps.filter((x) => x === 'b.ts')).toHaveLength(1);
  });

  it('returns empty array for file with no imports', () => {
    const g = createImportGraph();
    expect(getTransitiveDeps(g, 'lone.ts', 3)).toEqual([]);
  });
});
