/**
 * Traffic simulation and chaos. A deterministic flow model: clients emit
 * requests, routers split them, services fan out to their dependencies,
 * caches absorb reads, queues decouple (they buffer instead of propagating
 * failure), and replicas take over when a primary dies.
 *
 * It is intentionally simple and explainable, not a queueing-theory model:
 * the point is to make capacity, coupling, and redundancy visible.
 */
import { categoryOf, spec, type ComponentKind } from "./catalog";
import type { ArchEdge, ArchNode, Graph } from "./graph";

export type Health = "idle" | "healthy" | "warning" | "failed" | "down";

export interface SimSettings {
  /** Traffic multiplier relative to baseline (1 = normal day). */
  multiplier: number;
  /** Instances killed per node id. A value >= replicas takes the whole node down. */
  killed: Record<string, number>;
}

export interface NodeSim {
  load: number;
  capacity: number;
  utilization: number;
  health: Health;
  reason: string;
  dropped: number;
  backlog: number;
  failoverTo?: string;
}

export interface EdgeSim {
  rps: number;
  health: Health;
}

export interface SimResult {
  nodes: Record<string, NodeSim>;
  edges: Record<string, EdgeSim>;
  totalRps: number;
  errorRate: number;
  overloaded: string[];
  down: string[];
  degraded: string[];
}

export const DEFAULT_SIM: SimSettings = { multiplier: 1, killed: {} };

const CACHE_HIT_RATE = 0.85;
const CDN_HIT_RATE = 0.65;
const WARN_AT = 0.75;
/** Queue consumers pull work up to this share of their capacity. */
const PULL_AT = 0.9;

/** Share of a service's requests that touch a dependency of this kind. */
function fanoutFactor(target: ArchNode): number {
  switch (target.kind as ComponentKind) {
    case "identity_provider":
      return 0.05;
    case "secrets_vault":
      return 0.01;
    case "payments":
    case "email_provider":
    case "sms_provider":
      return 0.25;
    case "llm_api":
    case "ml_inference":
      return 0.2;
    case "data_warehouse":
      return 0.02;
    default:
      break;
  }
  switch (categoryOf(target.kind)) {
    case "database":
    case "cache":
      return 1;
    case "queue":
      return 0.6;
    case "service":
      return 0.8;
    case "observability":
      return 0;
    default:
      return 1;
  }
}

function isRouter(n: ArchNode) {
  const c = categoryOf(n.kind);
  return c === "client" || c === "gateway" || n.kind === "waf";
}

function topoOrder(graph: Graph): ArchNode[] {
  const flow = graph.edges.filter((e) => e.kind !== "replication");
  const indeg = new Map(graph.nodes.map((n) => [n.id, 0]));
  for (const e of flow) indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  const queue = graph.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const seen = new Set<string>();
  const order: string[] = [];
  while (queue.length || seen.size < graph.nodes.length) {
    if (!queue.length) {
      // Cycle: release the earliest remaining node.
      const next = graph.nodes.find((n) => !seen.has(n.id));
      if (!next) break;
      queue.push(next.id);
    }
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    for (const e of flow)
      if (e.source === id) {
        indeg.set(e.target, (indeg.get(e.target) ?? 0) - 1);
        if (indeg.get(e.target)! <= 0 && !seen.has(e.target)) queue.push(e.target);
      }
  }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return order.map((id) => byId.get(id)!).filter(Boolean);
}

export function aliveInstances(node: ArchNode, settings: SimSettings): number {
  return Math.max(0, node.replicas - (settings.killed[node.id] ?? 0));
}

export function simulate(graph: Graph, settings: SimSettings = DEFAULT_SIM): SimResult {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const load = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));
  const backlog = new Map<string, number>();
  const edges: Record<string, EdgeSim> = {};
  const nodes: Record<string, NodeSim> = {};
  const isDown = (n: ArchNode) => aliveInstances(n, settings) === 0;

  // Replicas share read traffic and take over when the primary dies.
  const replicasOf = new Map<string, string[]>();
  for (const e of graph.edges)
    if (e.kind === "replication") replicasOf.set(e.source, [...(replicasOf.get(e.source) ?? []), e.target]);

  const failoverTarget = (id: string): ArchNode | undefined => {
    const n = byId.get(id);
    if (!n || !isDown(n)) return undefined;
    return (replicasOf.get(id) ?? []).map((r) => byId.get(r)).find((r) => r && !isDown(r));
  };

  let totalRps = 0;
  for (const n of graph.nodes) {
    const src = spec(n.kind).sourceRps;
    const isSource = categoryOf(n.kind) === "client" || (src && graph.edges.some((e) => e.source === n.id));
    if (src && isSource) {
      const rps = src * settings.multiplier;
      load.set(n.id, rps);
      totalRps += rps;
    }
  }

  const capacityOf = (n: ArchNode): number => {
    if (categoryOf(n.kind) === "client") return Infinity;
    const base = spec(n.kind).capacity * aliveInstances(n, settings);
    const replicaBoost = (replicasOf.get(n.id) ?? [])
      .map((r) => byId.get(r))
      .filter((r): r is ArchNode => !!r && !isDown(r))
      .reduce((sum, r) => sum + spec(r.kind).capacity * aliveInstances(r, settings) * 0.8, 0);
    return base + replicaBoost;
  };

  for (const n of topoOrder(graph)) {
    const L = load.get(n.id) ?? 0;
    const cap = capacityOf(n);
    const served = isDown(n) ? 0 : Math.min(L, cap);
    const outs = graph.edges.filter((e) => e.source === n.id && e.kind !== "replication");
    const cat = categoryOf(n.kind);
    const hasCache = outs.some((e) => e.kind === "cache" && !isDown(byId.get(e.target)!));

    const send = (e: ArchEdge, rps: number) => {
      const redirect = failoverTarget(e.target);
      const target = redirect ?? byId.get(e.target)!;
      edges[e.id] = { rps, health: "healthy" };
      load.set(target.id, (load.get(target.id) ?? 0) + rps);
    };

    if (cat === "queue") {
      // Competing consumers split work; streams and topics fan out to every consumer group.
      // Consumers pull at their own pace: anything they can't take waits in the queue.
      const fanout = n.kind === "kafka" || n.kind === "pubsub";
      const consumers = outs.filter((e) => e.kind !== "cache");
      for (const e of consumers) {
        const share = fanout ? served : served / Math.max(1, consumers.length);
        const t = failoverTarget(e.target) ?? byId.get(e.target)!;
        const room = isDown(t) ? 0 : Math.max(0, capacityOf(t) * PULL_AT - (load.get(t.id) ?? 0));
        const pulled = Math.min(share, room);
        backlog.set(n.id, (backlog.get(n.id) ?? 0) + (share - pulled));
        send(e, pulled);
      }
      continue;
    }

    if (isRouter(n)) {
      const routes = outs.filter((e) => {
        const t = byId.get(e.target)!;
        const tc = categoryOf(t.kind);
        return tc === "service" || tc === "gateway" || t.kind === "waf" || tc === "external" || tc === "queue";
      });
      const deps = outs.filter((e) => !routes.includes(e));
      const pass = n.kind === "cdn" ? 1 - CDN_HIT_RATE : 1;
      for (const e of routes) send(e, (served * pass) / Math.max(1, routes.length));
      for (const e of deps) send(e, served * fanoutFactor(byId.get(e.target)!));
      continue;
    }

    const isConsumer = graph.edges.some((e) => e.target === n.id && e.kind === "async");
    for (const e of outs) {
      const t = byId.get(e.target)!;
      let rps = served * fanoutFactor(t);
      if (cat === "database") rps = served * 0.3; // change data capture carries writes only
      if (hasCache && categoryOf(t.kind) === "database" && e.kind === "sync") rps *= 1 - CACHE_HIT_RATE;
      // Queue consumers pace calls to rate-limited third parties instead of hammering them.
      if (isConsumer && categoryOf(t.kind) === "external") {
        rps = Math.min(rps, Math.max(0, capacityOf(t) * PULL_AT - (load.get(t.id) ?? 0)));
      }
      send(e, rps);
    }
  }

  // Replication edges show write traffic for display.
  for (const e of graph.edges)
    if (e.kind === "replication") edges[e.id] = { rps: (load.get(e.source) ?? 0) * 0.3, health: "healthy" };

  // Local health from capacity.
  for (const n of graph.nodes) {
    const L = load.get(n.id) ?? 0;
    const cap = capacityOf(n);
    const alive = aliveInstances(n, settings);
    const util = cap === Infinity ? 0 : cap === 0 ? (L > 0 ? Infinity : 0) : L / cap;
    let health: Health = L <= 0 ? "idle" : util > 1 ? "failed" : util > WARN_AT ? "warning" : "healthy";
    let reason =
      health === "failed"
        ? `Overloaded: ${fmt(L)} rps against ${fmt(cap)} capacity.`
        : health === "warning"
          ? `Running hot at ${Math.round(util * 100)}% capacity.`
          : health === "idle"
            ? "No traffic."
            : `${Math.round(util * 100)}% capacity.`;
    let failoverTo: string | undefined;
    if (alive === 0) {
      health = "down";
      const fo = failoverTarget(n.id);
      failoverTo = fo?.id;
      reason = fo ? `Down. Failed over to ${fo.name}.` : "Down.";
    } else if ((settings.killed[n.id] ?? 0) > 0) {
      reason = `${settings.killed[n.id]} of ${n.replicas} instances down. ${reason}`;
      if (health === "healthy" || health === "idle") health = "warning";
    }
    nodes[n.id] = {
      load: L,
      capacity: cap,
      utilization: util,
      health,
      reason,
      dropped: Math.max(0, L - (alive === 0 ? 0 : cap)),
      backlog: 0,
      failoverTo,
    };
  }

  // Queues buffer: consumers that fall behind grow a backlog instead of failing callers.
  for (const n of graph.nodes) {
    if (categoryOf(n.kind) !== "queue") continue;
    const behind = backlog.get(n.id) ?? 0;
    if (behind > 1) {
      nodes[n.id].backlog = behind;
      if (nodes[n.id].health === "healthy" || nodes[n.id].health === "idle") {
        nodes[n.id].health = "warning";
        nodes[n.id].reason = `Backlog growing by ${fmt(behind)} messages a second. Callers are unaffected.`;
      }
    }
  }

  // Propagate failure upstream along synchronous calls (reverse topological order).
  const failedDeps = (id: string) =>
    graph.edges.filter((e) => {
      if (e.source !== id || e.kind === "async" || e.kind === "replication") return false;
      const t = nodes[e.target];
      if (!t) return false;
      if (t.health === "down") return !t.failoverTo;
      return t.health === "failed";
    });
  const order = topoOrder(graph).reverse();
  for (let pass = 0; pass < 2; pass++) {
    for (const n of order) {
      const s = nodes[n.id];
      if (s.health === "down" || s.load <= 0) continue;
      const bad = failedDeps(n.id);
      if (!bad.length) continue;
      const names = bad.map((e) => byId.get(e.target)!.name);
      const cacheOnly = bad.every((e) => e.kind === "cache");
      const cat = categoryOf(n.kind);
      if (cacheOnly) {
        if (s.health === "healthy") {
          s.health = "warning";
          s.reason = `${names.join(", ")} unavailable, falling back to the database.`;
        }
        continue;
      }
      if (cat === "service" || cat === "gateway" || cat === "security") {
        if (s.health !== "failed") {
          s.health = "failed";
          s.reason = `Requests failing: ${names.join(", ")} ${names.length > 1 ? "are" : "is"} unavailable.`;
        }
      } else if (s.health === "healthy" || s.health === "idle") {
        s.health = "warning";
        s.reason = `Seeing errors from ${names.join(", ")}.`;
      }
    }
  }

  for (const e of graph.edges) {
    const t = nodes[e.target];
    const es = edges[e.id] ?? { rps: 0, health: "idle" as Health };
    es.health = es.rps <= 0 ? "idle" : t.health === "down" ? (t.failoverTo ? "warning" : "down") : t.health;
    edges[e.id] = es;
  }

  // Errors: requests dropped at, or failing through, services and gateways on the request path.
  let failing = 0;
  for (const n of graph.nodes) {
    const c = categoryOf(n.kind);
    if (c !== "gateway" && c !== "service") continue;
    const direct = graph.edges.some((e) => e.target === n.id && ["client", "external"].includes(categoryOf(byId.get(e.source)!.kind)));
    if (!direct) continue;
    const s = nodes[n.id];
    if (s.health === "failed" || s.health === "down") failing += s.load;
  }
  const errorRate = totalRps > 0 ? Math.min(1, failing / totalRps) : 0;

  return {
    nodes,
    edges,
    totalRps,
    errorRate,
    overloaded: graph.nodes.filter((n) => nodes[n.id].health === "failed" && nodes[n.id].utilization > 1).map((n) => n.id),
    down: graph.nodes.filter((n) => nodes[n.id].health === "down").map((n) => n.id),
    degraded: graph.nodes.filter((n) => nodes[n.id].health === "failed" && nodes[n.id].utilization <= 1).map((n) => n.id),
  };
}

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

/** Kill one instance of a replicated node, or the whole node when it runs as one. */
export function killNode(graph: Graph, settings: SimSettings, id: string): { settings: SimSettings; wholeNode: boolean } {
  const n = graph.nodes.find((x) => x.id === id);
  if (!n) return { settings, wholeNode: false };
  const already = settings.killed[id] ?? 0;
  const wholeNode = n.replicas <= 1 || already + 1 >= n.replicas;
  const next = wholeNode ? n.replicas : already + 1;
  return { settings: { ...settings, killed: { ...settings.killed, [id]: next } }, wholeNode };
}
