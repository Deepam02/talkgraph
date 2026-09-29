import { describe, expect, it } from "vitest";
import { runAll, offlineDriver, starterGraph } from "@/bench/run";
import { SCENARIOS } from "@/bench/scenarios";
import { GraphEngine } from "@/engine/engine";
import { parseClause, splitClauses } from "@/nlu/parser";
import { CommandRunner } from "@/nlu/runner";

const ctx = () => ({ graph: starterGraph() });

describe("clause splitting", () => {
  it("splits on commas before verbs, not inside lists", () => {
    expect(splitClauses("Add a Postgres behind the API, put a queue between them.")).toEqual([
      "add a postgres behind the api",
      "put a queue between them",
    ]);
    expect(splitClauses("add a web app, an api gateway and a service")).toHaveLength(1);
    expect(splitClauses("add redis then connect api to redis")).toHaveLength(2);
  });
});

describe("parser", () => {
  const p = (t: string) => {
    const r = parseClause(t, ctx());
    if (!r.ok) throw new Error(r.error);
    return r.calls[0];
  };

  it("add with placement", () => {
    expect(p("add a postgres behind the api")).toEqual({ name: "add_components", arguments: { items: [{ kind: "postgres", name: undefined, count: undefined, replicas: undefined }], upstream: "api" } });
  });
  it("names from modifiers", () => {
    expect(p("add an orders service").arguments).toMatchObject({ items: [{ kind: "service", name: "orders" }] });
    expect(p("add a redis cache called sessions").arguments).toMatchObject({ items: [{ kind: "redis", name: "sessions" }] });
  });
  it("counts", () => expect(p("add three workers").arguments).toMatchObject({ items: [{ kind: "worker", count: 3 }] }));
  it("connect with protocol", () =>
    expect(p("connect web to api over plain http").arguments).toEqual({ from: "web", to: "api", protocol: "HTTP" }));
  it("verbs of flow", () => {
    expect(p("api reads from postgres").arguments).toMatchObject({ from: "api", to: "postgres" });
    expect(p("the worker consumes from the queue").arguments).toMatchObject({ from: "queue", to: "worker" });
  });
  it("simulation", () => {
    expect(p("simulate 10x traffic").arguments).toEqual({ action: "traffic", multiplier: 10 });
    expect(p("what if we get ten times the traffic").arguments).toEqual({ action: "traffic", multiplier: 10 });
    expect(p("kill the database").arguments).toEqual({ action: "kill", target: "database" });
  });
  it("history", () => {
    expect(p("undo that").arguments).toEqual({ action: "undo" });
    expect(p("undo the last three changes").arguments).toEqual({ action: "undo", steps: 3 });
    expect(p("redo").arguments).toEqual({ action: "redo" });
  });
  it("exports and review", () => {
    expect(p("export the terraform").arguments).toEqual({ action: "export", format: "terraform" });
    expect(p("what's wrong with this design").name).toBe("review_architecture");
  });
  it("fails honestly", () => {
    expect(parseClause("sing me a song", ctx()).ok).toBe(false);
    expect(parseClause("add a unicorn", ctx()).ok).toBe(false);
  });
});

describe("runner", () => {
  it("resolves 'them' from the previous clause (headline demo)", () => {
    const engine = new GraphEngine(starterGraph());
    const steps = new CommandRunner(engine).run("Add a Postgres behind the API, put a queue between them.");
    expect(steps.every((s) => s.outcome?.ok)).toBe(true);
    const kinds = engine.graph.nodes.map((n) => n.kind).sort();
    expect(kinds).toEqual(["postgres", "service", "sqs", "web_app", "worker"].sort());
  });
});

describe("offline benchmark", () => {
  it("passes every scenario", async () => {
    const report = await runAll(offlineDriver());
    const failed = report.runs.filter((r) => !r.pass).map((r) => `${r.scenario.id}: ${r.results.filter((x) => !x.pass).map((x) => x.detail).join("; ")} | ${r.turns.map((t) => t.error ?? t.calls.join(",")).join(" / ")}`);
    expect(failed).toEqual([]);
    expect(report.total).toBe(SCENARIOS.length);
  });
});
