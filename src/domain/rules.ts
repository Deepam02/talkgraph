/**
 * Connection legality. Every edge, whether spoken, typed, dragged, or produced
 * by a fix, passes through `checkConnection`. Illegal links are rejected with
 * a sentence the agent can say out loud and a one-tap suggestion.
 */
import { categoryOf, spec, type Category, type ComponentKind } from "./catalog";
import type { Suggestion } from "./commands";
import { findEdge, PLAINTEXT_PROTOCOLS, type ArchNode, type EdgeKind, type Graph, type Protocol } from "./graph";

export interface ConnectionRequest {
  kind?: EdgeKind;
  protocol?: Protocol;
  encrypted?: boolean;
}

export interface ConnectionVerdict {
  ok: true;
  kind: EdgeKind;
  protocol: Protocol;
  encrypted: boolean;
  /** Human notes about anything that was inferred or coerced. */
  notes: string[];
}

export interface ConnectionRejection {
  ok: false;
  code: "self_loop" | "duplicate_connection" | "illegal_connection";
  reason: string;
  suggestion?: Suggestion;
}

const GATEWAY_ROUTERS: ReadonlySet<ComponentKind> = new Set(["api_gateway", "load_balancer", "cdn", "dns"]);

function label(n: ArchNode) {
  return n.name;
}

function reverseSuggestion(graph: Graph, source: ArchNode, target: ArchNode): Suggestion | undefined {
  const reversed = checkConnection(graph, target, source, {}, { skipReverseProbe: true });
  if (!reversed.ok) return undefined;
  return {
    label: `Connect ${label(target)} → ${label(source)}`,
    text: `Flip it so ${label(target)} calls ${label(source)}.`,
    commands: [{ type: "connect", from: target.id, to: source.id }],
  };
}

function serviceBetween(source: ArchNode, target: ArchNode, why: string): Suggestion {
  return {
    label: "Insert a service",
    text: `${why} Want me to put a service between ${label(source)} and ${label(target)}?`,
    commands: [{ type: "addNode", kind: "service", as: "$svc", connectFrom: [source.id], connectTo: [target.id] }],
  };
}

/** The protocol a connection gets when nobody specifies one. */
export function defaultProtocol(source: ArchNode, target: ArchNode, kind: EdgeKind): Protocol {
  const t = target.kind;
  const tc = categoryOf(t);
  const sc = categoryOf(source.kind);
  if (kind === "replication" || kind === "cache") {
    if (t === "redis") return "RESP";
    if (t === "memcached" || t === "cassandra" || t === "mongodb") return "TCP";
    if (t === "postgres" || t === "mysql") return "SQL";
    return "TCP";
  }
  // Consumers read with the broker's own protocol.
  if (sc === "queue") return defaultQueueProtocol(source.kind);
  switch (tc) {
    case "database":
      if (t === "postgres" || t === "mysql" || t === "data_warehouse") return "SQL";
      if (t === "mongodb" || t === "cassandra") return "TCP";
      if (t === "vector_db") return "gRPC";
      return "HTTPS";
    case "queue":
      return defaultQueueProtocol(t);
    case "cache":
      return t === "redis" ? "RESP" : "TCP";
    case "observability":
      return "OTLP";
    case "service":
      if (t === "websocket_server") return "WebSocket";
      if (t === "graphql_api") return "GraphQL";
      if (sc === "client" || sc === "gateway" || sc === "security" || sc === "external") return "HTTPS";
      return "gRPC";
    default:
      return "HTTPS";
  }
}

function defaultQueueProtocol(kind: ComponentKind): Protocol {
  if (kind === "kafka") return "Kafka";
  if (kind === "rabbitmq") return "AMQP";
  return "HTTPS";
}

/** The only edge kind that makes sense for this pair, or null when any sync call is fine. */
function naturalKind(source: ArchNode, target: ArchNode): EdgeKind {
  const sc = categoryOf(source.kind);
  const tc = categoryOf(target.kind);
  if (sc === "queue" || tc === "queue") return "async";
  if (sc === tc && (sc === "database" || sc === "cache")) return "replication";
  if (tc === "cache") return "cache";
  return "sync";
}

function reject(code: ConnectionRejection["code"], reason: string, suggestion?: Suggestion): ConnectionRejection {
  return { ok: false, code, reason, suggestion };
}

/**
 * Category-level rules: returns a rejection when `source → target` makes no
 * architectural sense, regardless of edge kind.
 */
function categoryRule(graph: Graph, source: ArchNode, target: ArchNode, probe: boolean): ConnectionRejection | null {
  const sc: Category = categoryOf(source.kind);
  const tc: Category = categoryOf(target.kind);
  const s = label(source);
  const t = label(target);

  if (tc === "client") {
    return reject(
      "illegal_connection",
      `Nothing calls into a client. Arrows point the way requests flow, so ${t} should call ${s}, not the other way around.`,
      probe ? reverseSuggestion(graph, source, target) : undefined,
    );
  }

  if (sc === "client" && (tc === "database" || tc === "cache" || tc === "queue")) {
    return reject(
      "illegal_connection",
      `${s} is a client, so it shouldn't reach ${t} directly. That skips auth and turns your ${spec(target.kind).label} into a public API.`,
      serviceBetween(source, target, "Clients should go through a backend."),
    );
  }

  if (sc === "database") {
    if (tc === "database") {
      if (source.kind !== target.kind) {
        return reject(
          "illegal_connection",
          `Replication only works between the same engine, and ${s} and ${t} are different databases. Stream the changes through Kafka instead.`,
          {
            label: "Stream changes via Kafka",
            text: `Capture changes from ${s} into Kafka and have a worker write them to ${t}.`,
            commands: [
              { type: "addNode", kind: "kafka", as: "$cdc", name: `${s}-cdc`, connectFrom: [source.id] },
              { type: "addNode", kind: "worker", as: "$sync", name: `${t}-sync`, connectFrom: ["$cdc"], connectTo: [target.id] },
            ],
          },
        );
      }
      return null;
    }
    if (tc === "queue") return null; // change data capture
    return reject(
      "illegal_connection",
      `Databases answer queries, they don't call other components, so ${s} can't call ${t}.`,
      probe ? reverseSuggestion(graph, source, target) : undefined,
    );
  }

  if (sc === "cache") {
    if (tc === "cache" && source.kind === target.kind) return null;
    const readers = graph.edges.filter((e) => e.target === source.id && e.kind === "cache").map((e) => e.source);
    const reader = readers.length === 1 ? graph.nodes.find((n) => n.id === readers[0]) : undefined;
    return reject(
      "illegal_connection",
      `A cache is passive. The service checks ${s} first and falls back to ${t} on a miss, so the service should connect to both.`,
      reader && !findEdge(graph, reader.id, target.id)
        ? {
            label: `Connect ${reader.name} → ${t}`,
            text: `Connect ${reader.name} to ${t} as the fallback on cache misses.`,
            commands: [{ type: "connect", from: reader.id, to: target.id }],
          }
        : undefined,
    );
  }

  if (sc === "queue" && !(tc === "service" || tc === "queue")) {
    return reject(
      "illegal_connection",
      `A queue only holds messages, it can't write to ${t} on its own. Something has to consume ${s}.`,
      {
        label: "Add a worker",
        text: `Add a worker that consumes ${s} and writes to ${t}.`,
        commands: [{ type: "addNode", kind: "worker", as: "$worker", connectFrom: [source.id], connectTo: [target.id] }],
      },
    );
  }

  if (sc === "gateway" && GATEWAY_ROUTERS.has(source.kind) && tc === "database") {
    return reject(
      "illegal_connection",
      `${s} routes traffic, it shouldn't run queries against ${t}.`,
      serviceBetween(source, target, "Business logic belongs in a service."),
    );
  }

  if (sc === "observability" && !(tc === "observability" && target.kind === "dashboards")) {
    return reject(
      "illegal_connection",
      `Telemetry flows into ${s}, not out of it.`,
      probe ? reverseSuggestion(graph, source, target) : undefined,
    );
  }

  if (sc === "external" && (tc === "database" || tc === "cache" || tc === "queue")) {
    return reject(
      "illegal_connection",
      `${s} is outside your system, so it shouldn't touch ${t} directly. Receive its webhooks in a service.`,
      serviceBetween(source, target, "External traffic should enter through your code."),
    );
  }

  if (sc === "security" && (tc === "database" || tc === "cache" || tc === "queue" || tc === "external")) {
    return reject(
      "illegal_connection",
      `${s} protects traffic in front of your services. It shouldn't talk to ${t} directly.`,
      probe ? reverseSuggestion(graph, source, target) : undefined,
    );
  }

  return null;
}

export function checkConnection(
  graph: Graph,
  source: ArchNode,
  target: ArchNode,
  request: ConnectionRequest = {},
  opts: { skipReverseProbe?: boolean } = {},
): ConnectionVerdict | ConnectionRejection {
  if (source.id === target.id) {
    return reject("self_loop", `${label(source)} can't connect to itself.`);
  }
  if (findEdge(graph, source.id, target.id)) {
    return reject("duplicate_connection", `${label(source)} is already connected to ${label(target)}.`);
  }

  const rule = categoryRule(graph, source, target, !opts.skipReverseProbe);
  if (rule) return rule;

  const notes: string[] = [];
  const natural = naturalKind(source, target);
  let kind: EdgeKind = request.kind ?? natural;

  if (request.kind && request.kind !== natural) {
    if (request.kind === "async" && natural === "sync") {
      return reject(
        "illegal_connection",
        `Async messaging needs a broker. ${label(source)} can't message ${label(target)} asynchronously without a queue in between.`,
        {
          label: "Insert a queue",
          text: `Put a queue between ${label(source)} and ${label(target)} so it's truly async.`,
          commands: [{ type: "insertBetween", kind: "sqs", from: source.id, to: target.id }],
        },
      );
    }
    if (request.kind === "replication") {
      return reject(
        "illegal_connection",
        `Replication only runs between two copies of the same database or cache, and ${label(source)} to ${label(target)} isn't that.`,
      );
    }
    // sync ↔ async/cache mismatches are coerced: the pair only supports one shape.
    notes.push(
      natural === "async"
        ? `Anything touching a queue is asynchronous, so I made it an async link.`
        : natural === "cache"
          ? `Reads from ${label(target)} are cache reads, so I styled it that way.`
          : `That pair only supports a ${natural} link, so I used that.`,
    );
    kind = natural;
  }

  const protocol = request.protocol ?? defaultProtocol(source, target, kind);
  if (!request.protocol) notes.push(`Protocol ${protocol} inferred.`);
  const encrypted = request.encrypted ?? !PLAINTEXT_PROTOCOLS.has(protocol);

  return { ok: true, kind, protocol, encrypted, notes };
}
