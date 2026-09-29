/**
 * Typed graph model. Graphs are immutable values: every edit produces a new
 * graph through `apply.ts`, which keeps undo, history, diffing, and tests trivial.
 */
import type { ComponentKind } from "./catalog";

export const EDGE_KINDS = ["sync", "async", "replication", "cache"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const EDGE_KIND_META: Record<EdgeKind, { label: string; color: string; description: string }> = {
  sync: { label: "Sync call", color: "#5B6CFF", description: "Request/response. The caller waits." },
  async: { label: "Async message", color: "#F59E0B", description: "Fire-and-forget through a broker." },
  replication: { label: "Replication", color: "#8B5CF6", description: "Data copied to a replica." },
  cache: { label: "Cache read", color: "#FB7185", description: "Read-through or look-aside cache." },
};

export const PROTOCOLS = [
  "HTTPS",
  "HTTP",
  "gRPC",
  "GraphQL",
  "WebSocket",
  "SQL",
  "TCP",
  "AMQP",
  "Kafka",
  "RESP",
  "MQTT",
  "OTLP",
] as const;
export type Protocol = (typeof PROTOCOLS)[number];

/** Protocols that are plaintext unless explicitly wrapped in TLS. */
export const PLAINTEXT_PROTOCOLS: ReadonlySet<Protocol> = new Set(["HTTP", "TCP", "MQTT"]);

export interface Inference {
  /** Human sentence: why the system chose this for you. */
  reason: string;
}

export interface XY {
  x: number;
  y: number;
}

export interface ArchNode {
  id: string;
  kind: ComponentKind;
  name: string;
  replicas: number;
  position: XY;
  /** User placed it by hand; auto layout leaves it alone. */
  pinned: boolean;
  /** Set when the system chose the name or placement for the user. */
  inferred: Inference | null;
  notes?: string;
}

export interface ArchEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  protocol: Protocol;
  encrypted: boolean;
  label?: string;
  /** Set when the connection or its protocol was inferred rather than asked for. */
  inferred: Inference | null;
}

export interface Graph {
  nodes: ArchNode[];
  edges: ArchEdge[];
  /** Monotonic id counter, so ids are deterministic and never reused. */
  seq: number;
}

export const EMPTY_GRAPH: Graph = Object.freeze({ nodes: [], edges: [], seq: 0 }) as Graph;

export function emptyGraph(): Graph {
  return { nodes: [], edges: [], seq: 0 };
}

export function nodeById(graph: Graph, id: string): ArchNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

export function edgeById(graph: Graph, id: string): ArchEdge | undefined {
  return graph.edges.find((e) => e.id === id);
}

export function edgesOf(graph: Graph, id: string): ArchEdge[] {
  return graph.edges.filter((e) => e.source === id || e.target === id);
}

export function outgoing(graph: Graph, id: string): ArchEdge[] {
  return graph.edges.filter((e) => e.source === id);
}

export function incoming(graph: Graph, id: string): ArchEdge[] {
  return graph.edges.filter((e) => e.target === id);
}

export function findEdge(graph: Graph, source: string, target: string): ArchEdge | undefined {
  return graph.edges.find((e) => e.source === source && e.target === target);
}

/** Lowercase kebab-case, the canonical form for node names. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Make `name` unique among nodes, appending -2, -3, ... when needed. */
export function uniqueName(graph: Graph, name: string, exceptId?: string): string {
  const taken = new Set(graph.nodes.filter((n) => n.id !== exceptId).map((n) => n.name));
  if (!taken.has(name)) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** The meaningful stem of a name: "orders-service" → "orders", "api" → "api". */
export function nameStem(name: string): string {
  const stem = name.replace(/-(service|svc|api|server|app|backend|worker|fn|db|cache|queue|events)$/i, "");
  return stem || name;
}
