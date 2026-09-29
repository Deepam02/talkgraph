/**
 * Deterministic left-to-right layered layout. Same graph in, same positions out,
 * so layout transitions animate predictably and tests can assert placement.
 *
 * Columns come from the longest path along request flow (clients on the left,
 * data stores on the right). Replicas sit directly under their primary, and
 * observability tools live in a band beneath the main flow.
 */
import { categoryOf, type Category } from "./catalog";
import type { ArchNode, Graph, XY } from "./graph";

export const COL_W = 290;
export const ROW_H = 132;
export const NODE_W = 208;
export const NODE_H = 76;

const MIN_RANK: Record<Category, number> = {
  client: 0,
  security: 1,
  gateway: 1,
  service: 2,
  queue: 2,
  cache: 3,
  database: 3,
  external: 3,
  observability: 0,
};

function seqOf(id: string): number {
  const n = Number(id.replace(/^\D+/, ""));
  return Number.isFinite(n) ? n : 0;
}

export function computeLayout(graph: Graph): Map<string, XY> {
  const nodes = [...graph.nodes].sort((a, b) => seqOf(a.id) - seqOf(b.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const isObs = (n: ArchNode) => categoryOf(n.kind) === "observability";

  // Replica → primary, so replicas follow their primary's column.
  const primaryOf = new Map<string, string>();
  for (const e of graph.edges) {
    if (e.kind === "replication" && !primaryOf.has(e.target)) primaryOf.set(e.target, e.source);
  }

  // Flow edges drive ranking; replication and telemetry do not.
  const preds = new Map<string, string[]>();
  for (const n of nodes) preds.set(n.id, []);
  for (const e of graph.edges) {
    if (e.kind === "replication") continue;
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t || isObs(t) || isObs(s)) continue;
    preds.get(e.target)!.push(e.source);
  }

  // Longest-path ranking with DFS cycle breaking (back edges are ignored).
  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  const rankOf = (id: string): number => {
    const cached = rank.get(id);
    if (cached !== undefined) return cached;
    const node = byId.get(id)!;
    if (primaryOf.has(id)) {
      const p = primaryOf.get(id)!;
      if (!visiting.has(p)) {
        visiting.add(id);
        const r = rankOf(p);
        visiting.delete(id);
        rank.set(id, r);
        return r;
      }
    }
    visiting.add(id);
    let r = MIN_RANK[categoryOf(node.kind)];
    for (const p of preds.get(id) ?? []) {
      if (visiting.has(p)) continue;
      r = Math.max(r, rankOf(p) + 1);
    }
    visiting.delete(id);
    rank.set(id, r);
    return r;
  };

  const flow = nodes.filter((n) => !isObs(n));
  const obs = nodes.filter(isObs);
  for (const n of flow) rankOf(n.id);

  // Group into columns. Replicas are attached after their primary.
  const columns = new Map<number, ArchNode[]>();
  for (const n of flow) {
    if (primaryOf.has(n.id) && byId.has(primaryOf.get(n.id)!)) continue;
    const r = rank.get(n.id)!;
    if (!columns.has(r)) columns.set(r, []);
    columns.get(r)!.push(n);
  }

  // Barycenter ordering, two sweeps, stable on creation order.
  const order = new Map<string, number>();
  const ranks = [...columns.keys()].sort((a, b) => a - b);
  for (const r of ranks) columns.get(r)!.forEach((n, i) => order.set(n.id, i));
  for (let sweep = 0; sweep < 2; sweep++) {
    for (const r of ranks) {
      const col = columns.get(r)!;
      const score = (n: ArchNode) => {
        const ps = (preds.get(n.id) ?? []).filter((p) => order.has(p) && (rank.get(p) ?? 0) < r);
        if (!ps.length) return order.get(n.id)! + 0.001 * seqOf(n.id);
        return ps.reduce((sum, p) => sum + order.get(p)!, 0) / ps.length + 0.001 * seqOf(n.id);
      };
      col.sort((a, b) => score(a) - score(b));
      col.forEach((n, i) => order.set(n.id, i));
    }
  }

  const replicasOf = new Map<string, ArchNode[]>();
  for (const n of flow) {
    const p = primaryOf.get(n.id);
    if (p && byId.has(p)) {
      if (!replicasOf.has(p)) replicasOf.set(p, []);
      replicasOf.get(p)!.push(n);
    }
  }
  const expand = (n: ArchNode, seen = new Set<string>()): ArchNode[] => {
    if (seen.has(n.id)) return [];
    seen.add(n.id);
    return [n, ...(replicasOf.get(n.id) ?? []).flatMap((r) => expand(r, seen))];
  };

  const positions = new Map<string, XY>();
  let maxY = 0;
  for (const r of ranks) {
    const col = columns.get(r)!.flatMap((n) => expand(n));
    const offset = ((col.length - 1) * ROW_H) / 2;
    col.forEach((n, i) => {
      const y = Math.round(i * ROW_H - offset);
      positions.set(n.id, { x: r * COL_W, y });
      maxY = Math.max(maxY, y);
    });
  }

  // Anything unplaced (replica cycles) falls back to its own rank.
  for (const n of flow) {
    if (!positions.has(n.id)) positions.set(n.id, { x: (rank.get(n.id) ?? 0) * COL_W, y: maxY + ROW_H });
  }

  const bandY = maxY + ROW_H + 40;
  obs.forEach((n, i) => positions.set(n.id, { x: COL_W * 0.5 + i * (NODE_W + 40), y: bandY }));

  return positions;
}

/** Apply layout to unpinned nodes (or all nodes when `unpinAll`). */
export function layoutGraph(graph: Graph, opts: { unpinAll?: boolean } = {}): Graph {
  const positions = computeLayout(graph);
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      if (n.pinned && !opts.unpinAll) return n;
      const p = positions.get(n.id);
      return p ? { ...n, position: p, pinned: false } : n;
    }),
  };
}
