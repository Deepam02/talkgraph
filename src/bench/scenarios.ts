/**
 * Benchmark scenarios: things people actually say, and the graph that should
 * result. Each scenario runs from a known starting canvas; expectations are
 * checked against the final typed graph, never against the model's words.
 */
import { categoryOf, type Category, type ComponentKind } from "@/domain/catalog";
import type { EdgeKind, Graph } from "@/domain/graph";
import type { TemplateId } from "@/domain/templates";

export type NodeMatch = { kind?: ComponentKind; category?: Category; name?: string };

export type Expectation =
  | { type: "node"; match: NodeMatch; count?: number; replicas?: number }
  | { type: "noNode"; match: NodeMatch }
  | { type: "edge"; from: NodeMatch; to: NodeMatch; kind?: EdgeKind; encrypted?: boolean }
  | { type: "noEdge"; from: NodeMatch; to: NodeMatch }
  | { type: "nodeCount"; count: number }
  | { type: "simulating"; value: boolean }
  | { type: "healthy"; value: boolean };

export interface Scenario {
  id: string;
  title: string;
  /** Spoken turns, in order. */
  turns: string[];
  start?: TemplateId | "blank" | "starter";
  /** Setup turns run offline before the scenario (not scored). */
  setup?: string[];
  expect: Expectation[];
  tags: string[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: "headline",
    title: "Postgres behind the API, queue between them",
    start: "starter",
    turns: ["Add a Postgres behind the API, put a queue between them."],
    expect: [
      { type: "node", match: { kind: "postgres" } },
      { type: "node", match: { category: "queue" } },
      { type: "edge", from: { name: "api" }, to: { category: "queue" }, kind: "async" },
      { type: "noEdge", from: { name: "api" }, to: { kind: "postgres" } },
    ],
    tags: ["add", "insert", "pronouns", "inference"],
  },
  {
    id: "add-basic",
    title: "Add a single component",
    start: "blank",
    turns: ["Add a Redis cache"],
    expect: [{ type: "node", match: { kind: "redis" } }, { type: "nodeCount", count: 1 }],
    tags: ["add"],
  },
  {
    id: "add-multi",
    title: "Add several components in one breath",
    start: "blank",
    turns: ["Add a web app, an API gateway and an orders service"],
    expect: [
      { type: "node", match: { kind: "web_app" } },
      { type: "node", match: { kind: "api_gateway" } },
      { type: "node", match: { kind: "service", name: "orders" } },
      { type: "edge", from: { kind: "api_gateway" }, to: { name: "orders" } },
    ],
    tags: ["add", "inference"],
  },
  {
    id: "count",
    title: "Quantities",
    start: "blank",
    turns: ["Add a queue and three workers"],
    expect: [{ type: "node", match: { kind: "worker" }, count: 3 }, { type: "node", match: { kind: "sqs" } }],
    tags: ["add"],
  },
  {
    id: "infer-db",
    title: "Infers the only service as the caller",
    start: "starter",
    turns: ["We need a MongoDB"],
    expect: [{ type: "edge", from: { name: "api" }, to: { kind: "mongodb" }, kind: "sync" }],
    tags: ["inference"],
  },
  {
    id: "connect",
    title: "Connect two components",
    start: "starter",
    turns: ["Add a payments service", "Connect api to payments"],
    expect: [{ type: "edge", from: { name: "api" }, to: { name: "payments" } }],
    tags: ["connect"],
  },
  {
    id: "reject-client-db",
    title: "Rejects a client talking to a database",
    start: "starter",
    setup: ["add a postgres behind the api"],
    turns: ["Connect the web app straight to postgres"],
    expect: [{ type: "noEdge", from: { kind: "web_app" }, to: { kind: "postgres" } }],
    tags: ["rules", "rejection"],
  },
  {
    id: "reject-db-calls",
    title: "Rejects a database calling a service",
    start: "starter",
    setup: ["add a postgres behind the api"],
    turns: ["Connect postgres to api"],
    expect: [{ type: "noEdge", from: { kind: "postgres" }, to: { name: "api" } }],
    tags: ["rules", "rejection"],
  },
  {
    id: "async-coerce",
    title: "Links to a queue are async",
    start: "starter",
    turns: ["Add Kafka", "Connect api to kafka"],
    expect: [{ type: "edge", from: { name: "api" }, to: { kind: "kafka" }, kind: "async" }],
    tags: ["rules", "connect"],
  },
  {
    id: "cache-front",
    title: "Cache in front of the database",
    start: "starter",
    setup: ["add a postgres behind the api"],
    turns: ["Put a Redis cache in front of postgres"],
    expect: [
      { type: "edge", from: { name: "api" }, to: { kind: "redis" }, kind: "cache" },
      { type: "edge", from: { name: "api" }, to: { kind: "postgres" } },
    ],
    tags: ["insert", "inference"],
  },
  {
    id: "rename",
    title: "Rename",
    start: "starter",
    turns: ["Rename api to checkout"],
    expect: [{ type: "node", match: { name: "checkout" } }, { type: "noNode", match: { name: "api" } }],
    tags: ["update"],
  },
  {
    id: "scale",
    title: "Scale a service",
    start: "starter",
    turns: ["Scale api to 4 instances"],
    expect: [{ type: "node", match: { name: "api" }, replicas: 4 }],
    tags: ["update"],
  },
  {
    id: "undo",
    title: "Undo by voice",
    start: "starter",
    turns: ["Add a Redis cache", "Undo that"],
    expect: [{ type: "noNode", match: { kind: "redis" } }],
    tags: ["history"],
  },
  {
    id: "redo",
    title: "Redo by voice",
    start: "starter",
    turns: ["Add Kafka", "Undo", "Redo"],
    expect: [{ type: "node", match: { kind: "kafka" } }],
    tags: ["history"],
  },
  {
    id: "remove-leaf",
    title: "Remove an unconnected component",
    start: "blank",
    turns: ["Add a scheduler", "Remove the scheduler"],
    expect: [{ type: "nodeCount", count: 0 }],
    tags: ["remove"],
  },
  {
    id: "remove-confirm",
    title: "Destructive removal asks first",
    start: "starter",
    turns: ["Delete the api"],
    expect: [{ type: "node", match: { name: "api" } }],
    tags: ["remove", "confirmation"],
  },
  {
    id: "tls",
    title: "Plaintext link, then encrypt it",
    start: "blank",
    turns: ["Add a web app and a load balancer", "Encrypt the connection from web to lb"],
    expect: [{ type: "edge", from: { kind: "web_app" }, to: { kind: "load_balancer" }, encrypted: true }],
    tags: ["connect", "security"],
  },
  {
    id: "traffic",
    title: "Simulate 10x traffic",
    start: "ecommerce",
    turns: ["Simulate 10x traffic"],
    expect: [{ type: "simulating", value: true }, { type: "healthy", value: false }],
    tags: ["simulation"],
  },
  {
    id: "chaos-fix",
    title: "Kill the database, then fix it",
    start: "ecommerce",
    turns: ["Kill orders-db", "Fix it"],
    expect: [
      { type: "healthy", value: true },
      { type: "edge", from: { name: "orders-db" }, to: { kind: "postgres", name: "orders-db-replica" }, kind: "replication" },
    ],
    tags: ["simulation", "chaos", "remedy"],
  },
  {
    id: "surge-fix",
    title: "Survive a 10x surge",
    start: "ecommerce",
    turns: ["Simulate 10x traffic", "Fix it"],
    expect: [{ type: "healthy", value: true }],
    tags: ["simulation", "remedy"],
  },
  {
    id: "lint-fix",
    title: "Fix the single point of failure",
    start: "ecommerce",
    turns: ["Fix the single point of failure on orders-db"],
    expect: [{ type: "edge", from: { name: "orders-db" }, to: { kind: "postgres" }, kind: "replication" }],
    tags: ["linter"],
  },
  {
    id: "template",
    title: "Load a template",
    start: "blank",
    turns: ["Load the realtime chat template"],
    expect: [{ type: "node", match: { kind: "websocket_server" } }, { type: "node", match: { kind: "cassandra" } }],
    tags: ["canvas"],
  },
  {
    id: "consumer",
    title: "Worker consumes a queue",
    start: "starter",
    turns: ["Add an SQS queue", "Add a worker that consumes from the queue"],
    expect: [{ type: "edge", from: { kind: "sqs" }, to: { kind: "worker" }, kind: "async" }],
    tags: ["add", "connect"],
  },
  {
    id: "gateway-front",
    title: "Gateway in front of the API",
    start: "starter",
    turns: ["Put an API gateway in front of the api"],
    expect: [
      { type: "edge", from: { kind: "web_app" }, to: { kind: "api_gateway" } },
      { type: "edge", from: { kind: "api_gateway" }, to: { name: "api" } },
      { type: "noEdge", from: { kind: "web_app" }, to: { name: "api" } },
    ],
    tags: ["insert"],
  },
];

// ── Evaluation ────────────────────────────────────────────────────────────

function matches(graph: Graph, m: NodeMatch) {
  return graph.nodes.filter(
    (n) =>
      (!m.kind || n.kind === m.kind) &&
      (!m.category || categoryOf(n.kind) === m.category) &&
      (!m.name || new RegExp(`^${m.name.replace(/\s+/g, "-")}(-\\d+)?$`).test(n.name)),
  );
}

export interface EvalContext {
  graph: Graph;
  simulating: boolean;
  healthy: boolean;
}

export interface ExpectationResult {
  expectation: Expectation;
  pass: boolean;
  detail: string;
}

export function describeMatch(m: NodeMatch) {
  return [m.name, m.kind, m.category].filter(Boolean).join("/");
}

export function evaluate(ctx: EvalContext, expect: Expectation[]): ExpectationResult[] {
  const g = ctx.graph;
  return expect.map((e): ExpectationResult => {
    switch (e.type) {
      case "node": {
        const found = matches(g, e.match);
        const countOk = e.count === undefined ? found.length >= 1 : found.length === e.count;
        const repOk = e.replicas === undefined || found.some((n) => n.replicas === e.replicas);
        return { expectation: e, pass: countOk && repOk, detail: `node ${describeMatch(e.match)}: found ${found.length}${e.replicas ? `, replicas ${found.map((n) => n.replicas).join(",")}` : ""}` };
      }
      case "noNode": {
        const found = matches(g, e.match).filter((n) => !e.match.name || n.name === e.match.name);
        return { expectation: e, pass: found.length === 0, detail: `no node ${describeMatch(e.match)}: found ${found.length}` };
      }
      case "edge":
      case "noEdge": {
        const froms = new Set(matches(g, e.from).map((n) => n.id));
        const tos = new Set(matches(g, e.to).map((n) => n.id));
        const hits = g.edges.filter(
          (x) =>
            froms.has(x.source) &&
            tos.has(x.target) &&
            (e.type === "noEdge" || ((!e.kind || x.kind === e.kind) && (e.encrypted === undefined || x.encrypted === e.encrypted))),
        );
        const pass = e.type === "edge" ? hits.length > 0 : hits.length === 0;
        return { expectation: e, pass, detail: `${e.type === "edge" ? "edge" : "no edge"} ${describeMatch(e.from)} → ${describeMatch(e.to)}: ${hits.length} match` };
      }
      case "nodeCount":
        return { expectation: e, pass: g.nodes.length === e.count, detail: `node count ${g.nodes.length}, want ${e.count}` };
      case "simulating":
        return { expectation: e, pass: ctx.simulating === e.value, detail: `simulating ${ctx.simulating}` };
      case "healthy":
        return { expectation: e, pass: ctx.healthy === e.value, detail: `healthy ${ctx.healthy}` };
    }
  });
}
