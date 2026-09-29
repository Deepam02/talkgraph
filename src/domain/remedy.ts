/**
 * "Fix it": turn a failing simulation into concrete, validated edits. Remedies
 * are ordinary domain commands, so they animate, show in history, and undo.
 * We iterate (apply → re-simulate) until the system holds or we run out of
 * ideas, then hand back the whole command list as one transaction.
 */
import { categoryOf, spec } from "./catalog";
import type { Command } from "./commands";
import { applyCommands } from "./apply";
import { nodeById, type ArchNode, type Graph } from "./graph";
import { simulate, type SimResult, type SimSettings } from "./sim";

export interface RemedyPlan {
  commands: Command[];
  /** Node ids whose killed instances should be restored (replaced by fresh ones). */
  revive: string[];
  explanations: string[];
  /** Result after the plan, for the tool result ("error rate drops to 0%"). */
  after: SimResult;
  before: SimResult;
}

const TARGET_UTIL = 0.6;
const MAX_ROUNDS = 5;

function planRound(graph: Graph, sim: SimResult, settings: SimSettings): { commands: Command[]; revive: string[]; explanations: string[] } {
  const commands: Command[] = [];
  const revive: string[] = [];
  const explanations: string[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const readersOf = (db: ArchNode) =>
    graph.edges
      .filter((e) => e.target === db.id && e.kind === "sync")
      .map((e) => byId.get(e.source)!)
      .filter((n) => n && categoryOf(n.kind) === "service");

  for (const n of graph.nodes) {
    const s = sim.nodes[n.id];
    const cat = categoryOf(n.kind);
    const perInstance = spec(n.kind).capacity;

    if (s.health === "down" && !s.failoverTo) {
      if (cat === "database") {
        const hasReplica = graph.edges.some((e) => e.kind === "replication" && e.source === n.id);
        if (!hasReplica) {
          commands.push({ type: "addNode", kind: n.kind, name: `${n.name}-replica`, connectFrom: [n.id], edgeKind: "replication" });
          explanations.push(`Added a standby replica of ${n.name} so reads fail over when the primary dies.`);
        } else {
          revive.push(n.id);
          explanations.push(`Restored ${n.name}.`);
        }
      } else if (cat === "external") {
        const callers = graph.edges.filter((e) => e.target === n.id && e.kind === "sync").map((e) => e.source);
        for (const c of callers) commands.push({ type: "insertBetween", kind: "sqs", from: c, to: n.id });
        if (callers.length) explanations.push(`${n.name} is outside your control, so calls now go through a queue and retry when it's back.`);
      } else {
        revive.push(n.id);
        if (n.replicas < 3) commands.push({ type: "updateNode", id: n.id, replicas: 3 });
        explanations.push(`Brought ${n.name} back with ${Math.max(3, n.replicas)} instances so one crash can't take it down.`);
      }
      continue;
    }

    if (s.health === "down" && s.failoverTo) {
      // Failover is working; restore the primary so the replica isn't a new single point.
      revive.push(n.id);
      explanations.push(`Failover to ${byId.get(s.failoverTo)?.name} worked. Restored ${n.name} as primary.`);
      continue;
    }

    if (s.utilization <= 0.85 || !Number.isFinite(s.capacity)) continue;

    if (cat === "database") {
      const readers = readersOf(n);
      const cached = readers.some((r) => graph.edges.some((e) => e.source === r.id && e.kind === "cache"));
      const cacheable = ["postgres", "mysql", "mongodb", "cassandra", "elasticsearch"].includes(n.kind);
      if (!cached && cacheable && readers.length) {
        commands.push({ type: "addNode", kind: "redis", name: `${n.name.replace(/-db$/, "")}-cache`, connectFrom: readers.map((r) => r.id) });
        explanations.push(`Put a Redis cache in front of ${n.name}; it absorbs about 85% of reads.`);
        continue;
      }
      const hasReplica = graph.edges.some((e) => e.kind === "replication" && e.source === n.id);
      if (!hasReplica) {
        commands.push({ type: "addNode", kind: n.kind, name: `${n.name}-replica`, connectFrom: [n.id], edgeKind: "replication" });
        explanations.push(`Added a read replica of ${n.name}.`);
        continue;
      }
      const need = Math.min(50, Math.max(n.replicas + 1, Math.ceil(s.load / (perInstance * TARGET_UTIL * 1.8))));
      commands.push({ type: "updateNode", id: n.id, replicas: need });
      explanations.push(`Scaled ${n.name} to ${need} nodes.`);
      continue;
    }

    if (cat === "external") {
      if (s.utilization <= 1) continue; // busy but within its rate limit
      // Only direct request-path callers need a buffer; queue consumers already pace themselves.
      const callers = graph.edges
        .filter((e) => e.target === n.id && e.kind === "sync")
        .map((e) => e.source)
        .filter((c) => !graph.edges.some((e) => e.target === c && e.kind === "async"));
      for (const c of callers) commands.push({ type: "insertBetween", kind: "sqs", from: c, to: n.id });
      if (callers.length) explanations.push(`${n.name} rate-limits you, so calls now drain through a queue at a pace it accepts.`);
      continue;
    }

    const alive = Math.max(1, n.replicas - (settings.killed[n.id] ?? 0));
    const need = Math.min(50, Math.max(n.replicas + 1, Math.ceil(s.load / (perInstance * TARGET_UTIL)) + (n.replicas - alive)));
    if (need > n.replicas) {
      commands.push({ type: "updateNode", id: n.id, replicas: need });
      explanations.push(`Scaled ${n.name} from ${n.replicas} to ${need} instances.`);
    }
  }

  return { commands, revive, explanations };
}

export function planRemedies(graph: Graph, settings: SimSettings): RemedyPlan {
  const before = simulate(graph, settings);
  let g = graph;
  let st: SimSettings = { ...settings, killed: { ...settings.killed } };
  let sim = before;
  const commands: Command[] = [];
  const revive: string[] = [];
  const explanations: string[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const plan = planRound(g, sim, st);
    if (!plan.commands.length && !plan.revive.length) break;
    if (plan.commands.length) {
      try {
        g = applyCommands(g, plan.commands).graph;
      } catch {
        break;
      }
      commands.push(...plan.commands);
    }
    for (const id of plan.revive) {
      if (!revive.includes(id)) revive.push(id);
      const { [id]: _, ...rest } = st.killed;
      void _;
      st = { ...st, killed: rest };
    }
    explanations.push(...plan.explanations);
    sim = simulate(g, st);
    const stillBad = Object.values(sim.nodes).some((s) => s.health === "failed" || (s.health === "down" && !s.failoverTo));
    if (!stillBad) break;
  }

  return { commands, revive, explanations: dedupe(explanations), after: sim, before };
}

function dedupe(xs: string[]) {
  return [...new Set(xs)];
}

export function nodeName(graph: Graph, id: string) {
  return nodeById(graph, id)?.name ?? id;
}
