import { describe, expect, it } from "vitest";
import { isHealthy } from "@/bench/run";
import { GraphEngine } from "@/engine/engine";
import { CommandRunner } from "@/nlu/runner";

// Must stay in sync with SCRIPT in src/components/landing/HeroDemo.tsx: the landing page runs it live.
const LANDING = [
  "Add a web app, an API gateway and an orders service.",
  "Put Postgres behind orders, then put a queue between them.",
  "Put a Redis cache in front of the database.",
  "Simulate ten x traffic.",
  "Fix it.",
];

describe("landing demo script", () => {
  it("runs cleanly and ends healthy", () => {
    const engine = new GraphEngine();
    const runner = new CommandRunner(engine);
    const failures: string[] = [];
    let overloaded = false;
    for (const line of LANDING) {
      for (const s of runner.run(line, "voice")) {
        if (s.parseError || (s.outcome && !s.outcome.ok)) failures.push(`${line}: ${s.parseError ?? s.outcome?.message}`);
      }
      if (line.startsWith("Simulate")) overloaded = !isHealthy(engine);
    }
    expect(failures).toEqual([]);
    expect(overloaded).toBe(true);
    expect(isHealthy(engine)).toBe(true);
    const kinds = engine.graph.nodes.map((n) => n.kind);
    expect(kinds).toEqual(expect.arrayContaining(["web_app", "api_gateway", "service", "postgres", "sqs", "worker", "redis"]));
  });
});

// docs/DEMO.md: the lines said on camera, in order.
const VIDEO = [
  "Add a web app, an API gateway and an orders service.",
  "Put Postgres behind orders, then put a queue between them.",
  "Scale orders to three instances.",
  "Connect the web app straight to the database.",
  "Yes, do that.",
  "Actually, undo that.",
  "Redo.",
  "What's wrong with this design?",
  "Simulate ten x traffic.",
  "Fix it.",
  "Kill the orders database.",
  "Fix it.",
  "Export the Terraform.",
];

describe("demo video script", () => {
  it("every line parses and behaves as narrated", () => {
    const engine = new GraphEngine();
    const runner = new CommandRunner(engine);
    const log: string[] = [];
    for (const line of VIDEO) {
      const steps = runner.run(line, "voice");
      for (const s of steps) log.push(`${line} → ${s.parseError ?? `${s.call?.name}:${s.outcome?.ok ? "ok" : `FAIL ${s.outcome?.message}`}`}`);
    }
    const failures = log.filter((l) => l.includes("FAIL") || !l.includes(":"));
    // Only the illegal connection is expected to be refused.
    expect(failures, log.join("\n")).toHaveLength(1);
    expect(failures[0]).toContain("Connect the web app");
    expect(engine.graph.nodes.find((n) => n.name === "orders")?.replicas).toBeGreaterThanOrEqual(3);
    expect(isHealthy(engine)).toBe(true);
  });
});
