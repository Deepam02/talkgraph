/**
 * Live architecture linter. Runs on every graph change; each finding carries a
 * spoken explanation and, where possible, a one-tap fix built from domain
 * commands (so fixes are validated, animated, and undoable like any edit).
 */
import { categoryOf, spec, type ComponentKind } from "./catalog";
import type { Command } from "./commands";
import { incoming, outgoing, type ArchEdge, type ArchNode, type Graph } from "./graph";

export type Severity = "high" | "medium" | "low";

export interface Finding {
  /** Stable across re-runs for the same issue, so UI state (dismissed) survives edits. */
  id: string;
  rule: LintRule;
  severity: Severity;
  title: string;
  /** One or two plain sentences, written to be read aloud. */
  message: string;
  nodeIds: string[];
  edgeIds: string[];
  fix?: { label: string; commands: Command[] };
}

export type LintRule =
  | "spof-database"
  | "spof-service"
  | "missing-cache"
  | "missing-queue"
  | "unencrypted-edge"
  | "no-gateway"
  | "queue-no-consumer"
  | "no-observability"
  | "no-auth"
  | "orphan";

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const SLOW_SYNC_TARGETS: ReadonlySet<ComponentKind> = new Set(["email_provider", "sms_provider", "llm_api", "ml_inference", "data_warehouse"]);
const CACHEABLE: ReadonlySet<ComponentKind> = new Set(["postgres", "mysql", "mongodb", "cassandra", "elasticsearch"]);

function hasReplica(graph: Graph, node: ArchNode) {
  return graph.edges.some((e) => e.kind === "replication" && (e.source === node.id || e.target === node.id));
}

export function lintGraph(graph: Graph): Finding[] {
  const out: Finding[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const name = (id: string) => byId.get(id)?.name ?? id;

  for (const node of graph.nodes) {
    const cat = categoryOf(node.kind);
    const ins = incoming(graph, node.id);
    const outs = outgoing(graph, node.id);

    // Single point of failure: a primary database with one instance and no replica.
    if (cat === "database" && node.kind !== "object_storage" && node.kind !== "dynamodb" && ins.length > 0) {
      const isReplica = graph.edges.some((e) => e.kind === "replication" && e.target === node.id);
      if (!isReplica && node.replicas < 2 && !hasReplica(graph, node)) {
        const dependents = new Set(ins.map((e) => e.source)).size;
        out.push({
          id: `spof-database:${node.id}`,
          rule: "spof-database",
          severity: "high",
          title: `${node.name} is a single point of failure`,
          message: `${node.name} has no replica. If it goes down, ${dependents > 1 ? `all ${dependents} callers go` : `${name(ins[0].source)} goes`} down with it.`,
          nodeIds: [node.id],
          edgeIds: [],
          fix: {
            label: "Add a replica",
            commands: [
              {
                type: "addNode",
                kind: node.kind,
                name: `${node.name}-replica`,
                connectFrom: [node.id],
                edgeKind: "replication",
              },
            ],
          },
        });
      }
    }

    // Single point of failure: a user-facing service running as one instance.
    if (cat === "service" && node.replicas < 2 && node.kind !== "scheduler" && node.kind !== "function") {
      const fromEdge = ins.some((e) => {
        const src = byId.get(e.source);
        return src && ["client", "gateway"].includes(categoryOf(src.kind));
      });
      if (fromEdge) {
        out.push({
          id: `spof-service:${node.id}`,
          rule: "spof-service",
          severity: "medium",
          title: `${node.name} runs as a single instance`,
          message: `${node.name} takes user traffic with only one instance. One crash or deploy and requests fail.`,
          nodeIds: [node.id],
          edgeIds: [],
          fix: { label: "Run 3 instances", commands: [{ type: "updateNode", id: node.id, replicas: 3 }] },
        });
      }
    }

    // Missing cache: a relational/document store read by several services with no cache anywhere in front.
    if (CACHEABLE.has(node.kind)) {
      const readers = [...new Set(ins.filter((e) => e.kind === "sync").map((e) => e.source))].filter((id) => {
        const n = byId.get(id);
        return n && categoryOf(n.kind) === "service";
      });
      const cached = readers.some((r) => graph.edges.some((e) => e.source === r && e.kind === "cache"));
      if (readers.length >= 2 && !cached) {
        out.push({
          id: `missing-cache:${node.id}`,
          rule: "missing-cache",
          severity: "medium",
          title: `Every read hits ${node.name}`,
          message: `${readers.length} services read ${node.name} directly with no cache. A Redis cache in front would absorb most of those reads.`,
          nodeIds: [node.id, ...readers],
          edgeIds: [],
          fix: {
            label: "Add a Redis cache",
            commands: [{ type: "addNode", kind: "redis", as: "$cache", connectFrom: readers, name: `${node.name.replace(/-db$/, "")}-cache` }],
          },
        });
      }
    }

    // Missing queue: slow or flaky work done synchronously.
    if (cat === "service") {
      for (const e of outs) {
        const target = byId.get(e.target);
        if (!target || e.kind !== "sync" || !SLOW_SYNC_TARGETS.has(target.kind)) continue;
        out.push({
          id: `missing-queue:${e.id}`,
          rule: "missing-queue",
          severity: "medium",
          title: `${node.name} waits on ${target.name}`,
          message: `${node.name} calls ${target.name} synchronously, so every slow ${spec(target.kind).label.toLowerCase()} call blocks the request. Put a queue in between.`,
          nodeIds: [node.id, target.id],
          edgeIds: [e.id],
          fix: { label: "Insert a queue", commands: [{ type: "insertBetween", kind: "sqs", from: node.id, to: target.id }] },
        });
      }
      const syncFanout = outs.filter((e) => e.kind === "sync" && byId.get(e.target) && categoryOf(byId.get(e.target)!.kind) === "service");
      if (syncFanout.length >= 3) {
        out.push({
          id: `missing-queue-fanout:${node.id}`,
          rule: "missing-queue",
          severity: "low",
          title: `${node.name} fans out synchronously`,
          message: `${node.name} calls ${syncFanout.length} services in a row. Latency adds up and one failure fails the request. Consider publishing an event instead.`,
          nodeIds: [node.id, ...syncFanout.map((e) => e.target)],
          edgeIds: syncFanout.map((e) => e.id),
        });
      }
    }

    // Queue with nobody consuming it.
    if (cat === "queue" && ins.length > 0 && outs.length === 0) {
      out.push({
        id: `queue-no-consumer:${node.id}`,
        rule: "queue-no-consumer",
        severity: "medium",
        title: `Nothing consumes ${node.name}`,
        message: `Messages go into ${node.name} but nothing reads them, so they'll just pile up.`,
        nodeIds: [node.id],
        edgeIds: [],
        fix: { label: "Add a worker", commands: [{ type: "addNode", kind: "worker", connectFrom: [node.id] }] },
      });
    }

    // Clients hitting services directly.
    if (cat === "client") {
      for (const e of outs) {
        const t = byId.get(e.target);
        if (!t || categoryOf(t.kind) !== "service") continue;
        out.push({
          id: `no-gateway:${e.id}`,
          rule: "no-gateway",
          severity: "low",
          title: `${node.name} calls ${t.name} directly`,
          message: `${node.name} talks straight to ${t.name}. An API gateway gives you one front door for auth, rate limits, and routing.`,
          nodeIds: [node.id, t.id],
          edgeIds: [e.id],
          fix: { label: "Insert API gateway", commands: [{ type: "insertBetween", kind: "api_gateway", from: node.id, to: t.id }] },
        });
      }
    }

    // Orphans (only once the diagram has some shape).
    if (graph.nodes.length >= 4 && ins.length === 0 && outs.length === 0 && cat !== "observability") {
      out.push({
        id: `orphan:${node.id}`,
        rule: "orphan",
        severity: "low",
        title: `${node.name} isn't connected`,
        message: `${node.name} isn't connected to anything yet.`,
        nodeIds: [node.id],
        edgeIds: [],
      });
    }
  }

  // Unencrypted links. Public-facing ones are high severity.
  for (const e of graph.edges) {
    if (e.encrypted) continue;
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) continue;
    const publicFacing = ["client", "external"].includes(categoryOf(s.kind));
    out.push({
      id: `unencrypted-edge:${e.id}`,
      rule: "unencrypted-edge",
      severity: publicFacing ? "high" : "medium",
      title: `${s.name} → ${t.name} is unencrypted`,
      message: publicFacing
        ? `Traffic from ${s.name} to ${t.name} crosses the internet in plaintext ${e.protocol}. Anyone on the path can read it.`
        : `${s.name} talks to ${t.name} over plaintext ${e.protocol}. Turn on TLS so a compromised host can't sniff it.`,
      nodeIds: [s.id, t.id],
      edgeIds: [e.id],
      fix: {
        label: "Encrypt with TLS",
        commands: [{ type: "updateEdge", id: e.id, encrypted: true, ...(e.protocol === "HTTP" ? { protocol: "HTTPS" as const } : {}) }],
      },
    });
  }

  const flowNodes = graph.nodes.filter((n) => categoryOf(n.kind) !== "client" && categoryOf(n.kind) !== "external");
  if (flowNodes.length >= 5 && !graph.nodes.some((n) => categoryOf(n.kind) === "observability")) {
    out.push({
      id: "no-observability",
      rule: "no-observability",
      severity: "low",
      title: "No observability",
      message: `There's no metrics, logging, or tracing yet. When something breaks you'll be debugging blind.`,
      nodeIds: [],
      edgeIds: [],
      fix: { label: "Add tracing", commands: [{ type: "addNode", kind: "tracing", name: "telemetry" }] },
    });
  }

  const hasClients = graph.nodes.some((n) => categoryOf(n.kind) === "client");
  const gateway = graph.nodes.find((n) => n.kind === "api_gateway");
  const hasAuth = graph.nodes.some((n) => n.kind === "identity_provider" || n.kind === "auth_service");
  if (hasClients && gateway && !hasAuth) {
    out.push({
      id: "no-auth",
      rule: "no-auth",
      severity: "low",
      title: "Nothing authenticates users",
      message: `Users reach ${gateway.name}, but nothing verifies who they are. Add an identity provider behind the gateway.`,
      nodeIds: [gateway.id],
      edgeIds: [],
      fix: { label: "Add identity provider", commands: [{ type: "addNode", kind: "identity_provider", connectFrom: [gateway.id] }] },
    });
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id.localeCompare(b.id));
}

/** Findings present in `after` but not `before`, for "new issue" announcements. */
export function newFindings(before: Finding[], after: Finding[]): Finding[] {
  const seen = new Set(before.map((f) => f.id));
  return after.filter((f) => !seen.has(f.id));
}

/** Map edges to worst finding severity, for highlighting on the canvas. */
export function edgeSeverity(findings: Finding[]): Map<string, Severity> {
  const m = new Map<string, Severity>();
  for (const f of findings)
    for (const id of f.edgeIds) {
      const cur = m.get(id);
      if (!cur || SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[cur]) m.set(id, f.severity);
    }
  return m;
}

export type { ArchEdge };
