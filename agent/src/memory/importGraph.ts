export interface ImportGraph {
  imports: Map<string, Set<string>>;
  importedBy: Map<string, Set<string>>;
}

export function createImportGraph(): ImportGraph {
  return {
    imports: new Map(),
    importedBy: new Map(),
  };
}

/** Returns a new graph with the edge fromFile → toFile added (immutable). */
export function addEdge(graph: ImportGraph, fromFile: string, toFile: string): ImportGraph {
  // Structural sharing: copy only the affected entries
  const newImports = new Map(graph.imports);
  const fromSet = new Set(graph.imports.get(fromFile) ?? []);
  fromSet.add(toFile);
  newImports.set(fromFile, fromSet);

  const newImportedBy = new Map(graph.importedBy);
  const toSet = new Set(graph.importedBy.get(toFile) ?? []);
  toSet.add(fromFile);
  newImportedBy.set(toFile, toSet);

  return { imports: newImports, importedBy: newImportedBy };
}

/** Files directly imported by `file`. */
export function getImports(graph: ImportGraph, file: string): string[] {
  return [...(graph.imports.get(file) ?? [])];
}

/** Files that directly import `file`. */
export function getImportedBy(graph: ImportGraph, file: string): string[] {
  return [...(graph.importedBy.get(file) ?? [])];
}

/**
 * BFS transitive dependencies of `file` up to `maxDepth` hops.
 * Cycle-safe: each node is visited at most once.
 * The root file itself is excluded from the result.
 */
export function getTransitiveDeps(
  graph: ImportGraph,
  file: string,
  maxDepth: number
): string[] {
  const visited = new Set<string>([file]);
  const result: string[] = [];
  let frontier: string[] = getImports(graph, file);

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const dep of frontier) {
      if (visited.has(dep)) continue;
      visited.add(dep);
      result.push(dep);
      for (const child of getImports(graph, dep)) {
        if (!visited.has(child)) next.push(child);
      }
    }
    frontier = next;
  }

  return result;
}
