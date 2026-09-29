/**
 * Benchmark runner. A scenario starts from a known canvas, plays its spoken
 * turns through a driver, then checks the resulting typed graph.
 *
 * Drivers:
 *  - offline: the deterministic parser + dispatcher (runs in CI, no network)
 *  - live: the real AssemblyAI voice agent, fed the same turns as text
 *    (see live-driver.ts), with its tool calls applied through the same dispatcher
 */
import { applyCommands } from "@/domain/apply";
import { emptyGraph, type Graph } from "@/domain/graph";
import { buildTemplate } from "@/domain/templates";
import { GraphEngine } from "@/engine/engine";
import { CommandRunner } from "@/nlu/runner";
import { evaluate, SCENARIOS, type ExpectationResult, type Scenario } from "./scenarios";

export interface TurnLog {
  text: string;
  calls: string[];
  reply?: string;
  error?: string;
}

export interface ScenarioRun {
  scenario: Scenario;
  pass: boolean;
  results: ExpectationResult[];
  turns: TurnLog[];
  ms: number;
}

export interface Driver {
  name: string;
  begin?(engine: GraphEngine, scenario: Scenario): Promise<void>;
  turn(engine: GraphEngine, text: string): Promise<TurnLog>;
  end?(): Promise<void>;
}

export function starterGraph(): Graph {
  return applyCommands(emptyGraph(), [
    { type: "addNode", kind: "web_app", name: "web", as: "$web", autoConnect: false },
    { type: "addNode", kind: "service", name: "api", connectFrom: ["$web"] },
  ]).graph;
}

export function startGraph(s: Scenario): Graph {
  if (!s.start || s.start === "blank") return emptyGraph();
  if (s.start === "starter") return starterGraph();
  return buildTemplate(s.start);
}

export function isHealthy(engine: GraphEngine): boolean {
  const sim = engine.get().sim;
  if (!sim) return true;
  return Object.values(sim.result.nodes).every((n) => n.health !== "failed" && !(n.health === "down" && !n.failoverTo));
}

export function prepareEngine(s: Scenario): GraphEngine {
  const engine = new GraphEngine(startGraph(s), s.title);
  if (s.setup?.length) {
    const runner = new CommandRunner(engine);
    for (const line of s.setup) runner.run(line, "system");
  }
  return engine;
}

export async function runScenario(s: Scenario, driver: Driver): Promise<ScenarioRun> {
  const t0 = performance.now();
  const engine = prepareEngine(s);
  const turns: TurnLog[] = [];
  try {
    await driver.begin?.(engine, s);
    for (const text of s.turns) turns.push(await driver.turn(engine, text));
  } catch (err) {
    turns.push({ text: "(driver error)", calls: [], error: (err as Error).message });
  } finally {
    await driver.end?.();
  }
  const state = engine.get();
  const results = evaluate({ graph: state.graph, simulating: Boolean(state.sim), healthy: isHealthy(engine) }, s.expect);
  return { scenario: s, pass: results.every((r) => r.pass), results, turns, ms: Math.round(performance.now() - t0) };
}

export function offlineDriver(): Driver {
  let runner: CommandRunner | null = null;
  return {
    name: "offline",
    async begin(engine) {
      runner = new CommandRunner(engine);
    },
    async turn(engine, text) {
      runner ??= new CommandRunner(engine);
      const steps = runner.run(text, "voice");
      const err = steps.find((s) => s.parseError)?.parseError;
      return {
        text,
        calls: steps.filter((s) => s.call).map((s) => `${s.call!.name}(${JSON.stringify(s.call!.arguments)})${s.outcome && !s.outcome.ok ? " ✗" : ""}`),
        reply: steps.map((s) => s.outcome?.message).filter(Boolean).join(" · "),
        error: err,
      };
    },
  };
}

export async function runAll(driver: Driver, scenarios: Scenario[] = SCENARIOS, onProgress?: (r: ScenarioRun, i: number) => void) {
  const runs: ScenarioRun[] = [];
  for (let i = 0; i < scenarios.length; i++) {
    const r = await runScenario(scenarios[i], driver);
    runs.push(r);
    onProgress?.(r, i);
  }
  const passed = runs.filter((r) => r.pass).length;
  return { runs, passed, total: runs.length, rate: runs.length ? passed / runs.length : 0 };
}
