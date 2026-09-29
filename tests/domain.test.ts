import { describe, expect, it } from "vitest";
import { applyCommands } from "@/domain/apply";
import { catalogKeyterms, COMPONENTS, kindFromPhrase } from "@/domain/catalog";
import { DomainError } from "@/domain/commands";
import { toADR } from "@/domain/export/adr";
import { toMermaid } from "@/domain/export/mermaid";
import { toTerraform } from "@/domain/export/terraform";
import { emptyGraph, type Graph } from "@/domain/graph";
import { computeLayout } from "@/domain/layout";
import { lintGraph } from "@/domain/lint";
import { planRemedies } from "@/domain/remedy";
import { resolveNode } from "@/domain/resolve";
import { checkConnection } from "@/domain/rules";
import { killNode, simulate } from "@/domain/sim";
import { buildTemplate, TEMPLATE_IDS } from "@/domain/templates";

function build(commands: Parameters<typeof applyCommands>[1]): Graph {
  return applyCommands(emptyGraph(), commands).graph;
}

const byName = (g: Graph, name: string) => g.nodes.find((n) => n.name === name)!;

function starter() {
  return build([
    { type: "addNode", kind: "web_app", name: "web", as: "$w", autoConnect: false },
    { type: "addNode", kind: "service", name: "api", connectFrom: ["$w"] },
  ]);
}

describe("catalog", () => {
  it("maps spoken phrases to kinds, longest alias first", () => {
    expect(kindFromPhrase("a Postgres database")).toBe("postgres");
    expect(kindFromPhrase("an API gateway")).toBe("api_gateway");
    expect(kindFromPhrase("the api")).toBe("service");
    expect(kindFromPhrase("event stream")).toBe("kafka");
    expect(kindFromPhrase("message queue")).toBe("sqs");
    expect(kindFromPhrase("three workers")).toBe("worker");
    expect(kindFromPhrase("a unicorn")).toBeNull();
  });

  it("has unique kinds and a sane keyterm list", () => {
    const kinds = COMPONENTS.map((c) => c.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    const terms = catalogKeyterms();
    expect(new Set(terms).size).toBe(terms.length);
    expect(terms).toContain("Postgres");
  });
});

describe("connection rules", () => {
  const g = build([
    { type: "addNode", kind: "web_app", name: "web", autoConnect: false },
    { type: "addNode", kind: "service", name: "api", autoConnect: false },
    { type: "addNode", kind: "postgres", name: "db", autoConnect: false },
    { type: "addNode", kind: "sqs", name: "jobs", autoConnect: false },
    { type: "addNode", kind: "redis", name: "cache", autoConnect: false },
    { type: "addNode", kind: "mysql", name: "legacy", autoConnect: false },
  ]);
  const n = (name: string) => byName(g, name);

  it("rejects clients talking to a database, with a service suggestion", () => {
    const v = checkConnection(g, n("web"), n("db"));
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toMatch(/client/i);
      expect(v.suggestion?.commands[0]).toMatchObject({ type: "addNode", kind: "service" });
    }
  });

  it("rejects databases initiating calls and suggests the reverse", () => {
    const v = checkConnection(g, n("db"), n("api"));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.suggestion?.commands[0]).toMatchObject({ type: "connect", from: n("api").id, to: n("db").id });
  });

  it("rejects a queue writing to a database and suggests a worker", () => {
    const v = checkConnection(g, n("jobs"), n("db"));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.suggestion?.commands[0]).toMatchObject({ kind: "worker" });
  });

  it("infers async to queues and cache reads to caches", () => {
    const toQueue = checkConnection(g, n("api"), n("jobs"));
    expect(toQueue.ok && toQueue.kind).toBe("async");
    const toCache = checkConnection(g, n("api"), n("cache"));
    expect(toCache.ok && toCache.kind).toBe("cache");
    expect(toCache.ok && toCache.protocol).toBe("RESP");
  });

  it("refuses async between services without a broker", () => {
    const g2 = build([
      { type: "addNode", kind: "service", name: "a", autoConnect: false },
      { type: "addNode", kind: "service", name: "b", autoConnect: false },
    ]);
    const v = checkConnection(g2, byName(g2, "a"), byName(g2, "b"), { kind: "async" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.suggestion?.commands[0]).toMatchObject({ type: "insertBetween", kind: "sqs" });
  });

  it("only replicates between the same engine", () => {
    expect(checkConnection(g, n("db"), n("legacy")).ok).toBe(false);
  });

  it("marks plain HTTP as unencrypted", () => {
    const v = checkConnection(g, n("web"), n("api"), { protocol: "HTTP" });
    expect(v.ok && v.encrypted).toBe(false);
  });

  it("rejects self loops and duplicates", () => {
    expect(checkConnection(g, n("api"), n("api")).ok).toBe(false);
    const linked = applyCommands(g, [{ type: "connect", from: n("api").id, to: n("db").id }]).graph;
    const again = checkConnection(linked, byName(linked, "api"), byName(linked, "db"));
    expect(!again.ok && again.code).toBe("duplicate_connection");
  });
});

describe("apply", () => {
  it("names contextually and infers the obvious caller", () => {
    const g = applyCommands(starter(), [{ type: "addNode", kind: "postgres" }]);
    const db = g.graph.nodes.find((x) => x.kind === "postgres")!;
    expect(db.name).toBe("api-db");
    expect(g.graph.edges.some((e) => e.source === byName(g.graph, "api").id && e.target === db.id)).toBe(true);
    const edge = g.graph.edges.find((e) => e.target === db.id)!;
    expect(edge.inferred?.reason).toMatch(/only service/);
    expect(g.notes.length).toBeGreaterThan(0);
  });

  it("uses the upstream name for contextual names", () => {
    const g0 = build([{ type: "addNode", kind: "service", name: "orders", autoConnect: false }]);
    const g = applyCommands(g0, [{ type: "addNode", kind: "postgres", connectFrom: [byName(g0, "orders").id] }]).graph;
    expect(g.nodes.some((n) => n.name === "orders-db")).toBe(true);
  });

  it("is atomic: a failing command leaves the graph untouched", () => {
    const g = starter();
    expect(() =>
      applyCommands(g, [
        { type: "addNode", kind: "redis", name: "c" },
        { type: "connect", from: byName(g, "web").id, to: "$nope" },
      ]),
    ).toThrow(DomainError);
    expect(g.nodes).toHaveLength(2);
  });

  it("inserts a queue between a service and a database with an inferred worker", () => {
    const g0 = applyCommands(starter(), [{ type: "addNode", kind: "postgres", name: "orders-db" }]).graph;
    const res = applyCommands(g0, [{ type: "insertBetween", kind: "sqs", from: byName(g0, "api").id, to: byName(g0, "orders-db").id }]);
    const g = res.graph;
    const q = g.nodes.find((n) => n.kind === "sqs")!;
    const w = g.nodes.find((n) => n.kind === "worker")!;
    expect(w).toBeDefined();
    expect(w.inferred?.reason).toMatch(/worker/);
    const has = (a: string, b: string) => g.edges.some((e) => e.source === a && e.target === b);
    expect(has(byName(g, "api").id, q.id)).toBe(true);
    expect(has(q.id, w.id)).toBe(true);
    expect(has(w.id, byName(g, "orders-db").id)).toBe(true);
    expect(has(byName(g, "api").id, byName(g, "orders-db").id)).toBe(false);
  });

  it("inserts a cache beside a database, keeping the fallback", () => {
    const g0 = applyCommands(starter(), [{ type: "addNode", kind: "postgres", name: "orders-db" }]).graph;
    const g = applyCommands(g0, [{ type: "insertBetween", kind: "redis", from: byName(g0, "api").id, to: byName(g0, "orders-db").id }]).graph;
    const cache = g.nodes.find((n) => n.kind === "redis")!;
    expect(cache.name).toBe("orders-cache");
    expect(g.edges.find((e) => e.target === cache.id)?.kind).toBe("cache");
    expect(g.edges.some((e) => e.source === byName(g, "api").id && e.target === byName(g, "orders-db").id)).toBe(true);
  });

  it("keeps ids deterministic and unique names", () => {
    const g = build([
      { type: "addNode", kind: "service", autoConnect: false },
      { type: "addNode", kind: "service", autoConnect: false },
    ]);
    expect(g.nodes.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(g.nodes.map((n) => n.name)).toEqual(["service", "service-2"]);
  });

  it("revalidates edges on kind change", () => {
    const g0 = applyCommands(starter(), [{ type: "addNode", kind: "postgres", name: "db" }]).graph;
    expect(() => applyCommands(g0, [{ type: "updateNode", id: byName(g0, "api").id, kind: "mysql" }])).toThrow(/break/);
  });
});

describe("resolver", () => {
  const g = build([
    { type: "addNode", kind: "service", name: "api", autoConnect: false },
    { type: "addNode", kind: "api_gateway", autoConnect: false },
    { type: "addNode", kind: "postgres", name: "orders-db", autoConnect: false },
    { type: "addNode", kind: "mysql", name: "users-db", autoConnect: false },
  ]);

  it("prefers exact names", () => expect(resolveNode(g, "the API").name).toBe("api"));
  it("matches engines", () => expect(resolveNode(g, "postgres").name).toBe("orders-db"));
  it("matches name stems with category words", () => expect(resolveNode(g, "orders database").name).toBe("orders-db"));
  it("flags real ambiguity", () => {
    try {
      resolveNode(g, "the database");
      throw new Error("expected ambiguity");
    } catch (e) {
      expect((e as DomainError).code).toBe("ambiguous");
      expect((e as DomainError).candidates).toEqual(expect.arrayContaining(["orders-db", "users-db"]));
    }
  });
  it("reports what exists when nothing matches", () => {
    expect(() => resolveNode(g, "kafka")).toThrow(/couldn't find/);
  });
});

describe("layout", () => {
  it("is deterministic and flows left to right", () => {
    const g = buildTemplate("ecommerce");
    const a = computeLayout(g);
    const b = computeLayout(g);
    expect([...a.entries()]).toEqual([...b.entries()]);
    const x = (name: string) => a.get(byName(g, name).id)!.x;
    expect(x("storefront")).toBeLessThan(x("api-gateway"));
    expect(x("api-gateway")).toBeLessThan(x("orders"));
    expect(x("orders")).toBeLessThan(x("orders-db"));
  });

  it("puts replicas under their primary", () => {
    const g0 = buildTemplate("ecommerce");
    const g = applyCommands(g0, [{ type: "addNode", kind: "postgres", name: "orders-db-replica", connectFrom: [byName(g0, "orders-db").id], edgeKind: "replication" }]).graph;
    const p = byName(g, "orders-db").position;
    const r = byName(g, "orders-db-replica").position;
    expect(r.x).toBe(p.x);
    expect(r.y).toBeGreaterThan(p.y);
  });
});

describe("linter", () => {
  it("finds the classic issues with fixes", () => {
    const f = lintGraph(buildTemplate("ecommerce"));
    const rules = new Set(f.map((x) => x.rule));
    expect(rules).toContain("spof-database");
    expect(rules).toContain("spof-service");
    expect(rules).toContain("missing-queue"); // notifier → email is sync
    expect(f[0].severity).toBe("high");
  });

  it("flags plaintext public links as high severity and fixes them", () => {
    const g = build([
      { type: "addNode", kind: "web_app", name: "web", as: "$w", autoConnect: false },
      { type: "addNode", kind: "load_balancer", name: "lb", autoConnect: false },
      { type: "connect", from: "$w", to: "n2", protocol: "HTTP" },
    ]);
    const f = lintGraph(g).find((x) => x.rule === "unencrypted-edge")!;
    expect(f.severity).toBe("high");
    const fixed = applyCommands(g, f.fix!.commands).graph;
    expect(fixed.edges[0]).toMatchObject({ encrypted: true, protocol: "HTTPS" });
    expect(lintGraph(fixed).some((x) => x.rule === "unencrypted-edge")).toBe(false);
  });

  it("every fix applies cleanly on every template", () => {
    for (const id of TEMPLATE_IDS) {
      const g = buildTemplate(id);
      for (const f of lintGraph(g)) if (f.fix) expect(() => applyCommands(g, f.fix!.commands), `${id}: ${f.id}`).not.toThrow();
    }
  });
});

describe("simulation", () => {
  it("is healthy at baseline and overloads at 10x", () => {
    const g = buildTemplate("ecommerce");
    const base = simulate(g, { multiplier: 1, killed: {} });
    expect(base.errorRate).toBe(0);
    const surge = simulate(g, { multiplier: 10, killed: {} });
    expect(surge.overloaded.length).toBeGreaterThan(0);
    expect(surge.errorRate).toBeGreaterThan(0);
  });

  it("propagates a dead database to sync callers but not across queues", () => {
    const g = buildTemplate("ecommerce");
    const db = byName(g, "orders-db");
    const { settings } = killNode(g, { multiplier: 1, killed: {} }, db.id);
    const r = simulate(g, settings);
    expect(r.nodes[db.id].health).toBe("down");
    expect(r.nodes[byName(g, "orders").id].health).toBe("failed");
    expect(r.nodes[byName(g, "notifier").id].health).not.toBe("failed");
  });

  it("fails over to a replica", () => {
    const g0 = buildTemplate("ecommerce");
    const g = applyCommands(g0, [{ type: "addNode", kind: "postgres", name: "orders-db-replica", connectFrom: [byName(g0, "orders-db").id], edgeKind: "replication" }]).graph;
    const { settings } = killNode(g, { multiplier: 1, killed: {} }, byName(g, "orders-db").id);
    const r = simulate(g, settings);
    expect(r.nodes[byName(g, "orders-db").id].failoverTo).toBe(byName(g, "orders-db-replica").id);
    expect(r.nodes[byName(g, "orders").id].health).not.toBe("failed");
  });

  it("kills one instance of a replicated service first", () => {
    const g = buildTemplate("chat");
    const rt = byName(g, "realtime");
    const { settings, wholeNode } = killNode(g, { multiplier: 1, killed: {} }, rt.id);
    expect(wholeNode).toBe(false);
    expect(simulate(g, settings).nodes[rt.id].health).toBe("warning");
  });

  it("remedies bring a 10x surge back to healthy", () => {
    const g = buildTemplate("ecommerce");
    const plan = planRemedies(g, { multiplier: 10, killed: {} });
    expect(plan.commands.length).toBeGreaterThan(0);
    expect(plan.after.errorRate).toBe(0);
    expect(Object.values(plan.after.nodes).some((n) => n.health === "failed")).toBe(false);
    expect(() => applyCommands(g, plan.commands)).not.toThrow();
  });

  it("remedies a killed database with a replica", () => {
    const g = buildTemplate("ecommerce");
    const { settings } = killNode(g, { multiplier: 1, killed: {} }, byName(g, "orders-db").id);
    const plan = planRemedies(g, settings);
    expect(plan.commands.some((c) => c.type === "addNode" && c.kind === "postgres")).toBe(true);
    expect(plan.after.errorRate).toBe(0);
  });
});

describe("exports", () => {
  const g = buildTemplate("ecommerce");
  it("mermaid", () => {
    const m = toMermaid(g, "Checkout");
    expect(m).toContain("flowchart LR");
    expect(m).toContain('orders_db[("orders-db');
    expect(m).toContain("-.->"); // async
    expect(m).toContain("classDef database");
  });
  it("terraform", () => {
    const t = toTerraform(g, "checkout");
    expect(t).toContain('resource "aws_db_instance" "orders_db"');
    expect(t).toContain('resource "aws_msk_serverless_cluster" "order_events"');
    expect(t).toContain("aws_security_group_rule");
    expect(t).toContain("from_port                = 5432");
  });
  it("adr", () => {
    const a = toADR(g, "Checkout", new Date("2026-09-30T00:00:00Z"));
    expect(a).toContain("# ADR: Checkout");
    expect(a).toContain("2026-09-30");
    expect(a).toContain("## Consequences");
    expect(a).toMatch(/single point of failure/i);
  });
});

describe("templates", () => {
  it("all build through validated commands", () => {
    for (const id of TEMPLATE_IDS) expect(buildTemplate(id).nodes.length).toBeGreaterThan(5);
  });
});
