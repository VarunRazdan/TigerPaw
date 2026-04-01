/**
 * Workflow graph utilities — predecessor chain and subgraph extraction.
 */

type NodeLike = { id: string };
type EdgeLike = { id: string; source: string; target: string; label?: string };

/**
 * Get the topologically sorted predecessor chain for a target node.
 * Returns an array of node IDs in execution order (ancestors first, target last).
 */
export function getPredecessorChain(
  targetNodeId: string,
  nodes: NodeLike[],
  edges: EdgeLike[],
): string[] {
  // Build reverse adjacency (target → sources)
  const reverseAdj = new Map<string, string[]>();
  for (const edge of edges) {
    const sources = reverseAdj.get(edge.target) ?? [];
    sources.push(edge.source);
    reverseAdj.set(edge.target, sources);
  }

  // BFS backward from target to collect all ancestors
  const ancestors = new Set<string>();
  const queue = [targetNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    ancestors.add(current);
    for (const parent of reverseAdj.get(current) ?? []) {
      if (!ancestors.has(parent)) {
        queue.push(parent);
      }
    }
  }

  // Topological sort of the ancestor set
  const nodeSet = new Set(nodes.map((n) => n.id));
  const forwardAdj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of ancestors) {
    if (nodeSet.has(id)) {
      forwardAdj.set(id, []);
      inDegree.set(id, 0);
    }
  }

  for (const edge of edges) {
    if (ancestors.has(edge.source) && ancestors.has(edge.target)) {
      forwardAdj.get(edge.source)?.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
  }

  const sorted: string[] = [];
  const topoQueue = [...ancestors].filter((id) => (inDegree.get(id) ?? 0) === 0);

  while (topoQueue.length > 0) {
    const current = topoQueue.shift()!;
    sorted.push(current);
    for (const next of forwardAdj.get(current) ?? []) {
      const newDegree = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, newDegree);
      if (newDegree === 0) {
        topoQueue.push(next);
      }
    }
  }

  return sorted;
}

/**
 * Extract the minimal subgraph needed to execute up to a target node.
 * Returns filtered nodes and edges.
 */
export function subgraphToNode<N extends NodeLike, E extends EdgeLike>(
  targetNodeId: string,
  nodes: N[],
  edges: E[],
): { nodes: N[]; edges: E[] } {
  const chain = new Set(getPredecessorChain(targetNodeId, nodes, edges));
  return {
    nodes: nodes.filter((n) => chain.has(n.id)),
    edges: edges.filter((e) => chain.has(e.source) && chain.has(e.target)),
  };
}
