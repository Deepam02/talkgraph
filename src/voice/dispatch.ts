/**
 * Tool dispatcher. Turns a validated tool call into engine operations and a
 * compact JSON result the agent can speak from. Used identically by the live
 * voice session, the typed command bar, and the benchmark.
 */
import { applyCommands } from "@/domain/apply";
import { spec } from "@/domain/catalog";
import { DomainError, type Command, type Suggestion } from "@/domain/commands";
import { edgesOf, emptyGraph, findEdge, type Graph } from "@/domain/graph";
import { lintGraph, type Finding } from "@/domain/lint";
import { resolveNode } from "@/domain/resolve";
import { fmt, type SimResult } from "@/domain/sim";
import { buildTemplate, TEMPLATES } from "@/domain/templates";
import type { CommitInfo, EditSource, GraphEngine } from "@/engine/engine";
import { parseToolCall, ToolArgumentError, type ParsedArgs, type ToolName } from "./tools";

export type UiAction = { type: "export"; format: "terraform" | "mermaid" | "adr" } | { type: "fit" };

export interface ToolOutcome {
  ok: boolean;
  tool: string;
  /** Returned to the agent as the `tool.result` JSON string. */
  payload: Record<string, unknown>;
  /** What the user sees in the toast. */
  message: string;
  commit?: CommitInfo;
  suggestion?: Suggestion;
  uiAction?: UiAction;
  needsConfirmation?: boolean;
}

function ok(tool: string, message: string, payload: Record<string, unknown> = {}, extra: Partial<ToolOutcome> = {}): ToolOutcome {
  return { ok: true, tool, message, payload: { ok: true, summary: message, ...payload }, ...extra };
}

function fail(tool: string, message: string, payload: Record<string, unknown> = {}, extra: Partial<ToolOutcome> = {}): ToolOutcome {
  return { ok: false, tool, message, payload: { ok: false, error: message, ...payload }, ...extra };
}

/** One-line-per-edge snapshot the model can ground on. Kept short on purpose. */
export function compactCanvas(graph: Graph, limit = 1400): string {
  if (!graph.nodes.length) return "empty";
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const nodes = graph.nodes.map((n) => `${n.name} (${n.kind}${n.replicas > 1 ? ` x${n.replicas}` : ""})`).join(", ");
  const edges = graph.edges
    .map((e) => `${byId.get(e.source)?.name} -> ${byId.get(e.target)?.name} [${e.kind}${e.encrypted ? "" : ", PLAINTEXT"}]`)
    .join("; ");
  const text = `nodes: ${nodes}. edges: ${edges || "none"}.`;
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function findingBrief(f: Finding) {
  return { id: f.id, severity: f.severity, title: f.title, detail: f.message, fixable: Boolean(f.fix) };
}

function commitPayload(engine: GraphEngine, info: CommitInfo): Record<string, unknown> {
  const important = info.newFindings.filter((f) => f.severity !== "low").slice(0, 2);
  return {
    inferred: info.notes.length ? info.notes.slice(0, 4) : undefined,
    new_findings: important.length ? important.map(findingBrief) : undefined,
    canvas: compactCanvas(engine.graph),
  };
}

function simBrief(graph: Graph, sim: SimResult) {
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? id;
  const failing = Object.entries(sim.nodes)
    .filter(([, s]) => s.health === "failed" || s.health === "down")
    .map(([id, s]) => `${name(id)}: ${s.reason}`);
  const warnings = Object.entries(sim.nodes)
    .filter(([, s]) => s.health === "warning")
    .map(([id, s]) => `${name(id)}: ${s.reason}`);
  return {
    total_rps: fmt(sim.totalRps),
    error_rate: `${Math.round(sim.errorRate * 100)}%`,
    failing: failing.slice(0, 5),
    warnings: warnings.slice(0, 4),
  };
}

function toSuggestionPayload(s?: Suggestion) {
  return s
    ? {
        suggestion: s.text,
        how_to_accept: "Offer this fix in one short sentence. If the user agrees, call review_architecture with action accept_suggestion.",
      }
    : {};
}

function handleDomainError(engine: GraphEngine, tool: string, err: DomainError): ToolOutcome {
  if (err.suggestion) engine.setSuggestion(err.suggestion);
  const extra: Record<string, unknown> = { code: err.code, ...toSuggestionPayload(err.suggestion) };
  if (err.code === "ambiguous") extra.ask_user = `Ask which one: ${err.candidates?.join(" or ")}.`;
  if (err.code === "not_found" && err.candidates?.length) extra.existing_components = err.candidates.slice(0, 20);
  return fail(tool, err.message, extra, { suggestion: err.suggestion });
}

function matchFinding(findings: Finding[], query?: string): Finding | undefined {
  const fixable = findings.filter((f) => f.fix);
  if (!query) return fixable[0];
  const q = query.toLowerCase();
  const exact = fixable.find((f) => f.id === query);
  if (exact) return exact;
  const words = q.split(/[^a-z0-9-]+/).filter((w) => w.length > 2 && !["the", "fix", "that", "for", "and"].includes(w));
  let best: { f: Finding; score: number } | undefined;
  for (const f of fixable) {
    const hay = `${f.id} ${f.title} ${f.message} ${f.rule.replace(/-/g, " ")}`.toLowerCase();
    const score = words.filter((w) => hay.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { f, score };
  }
  return best?.f;
}

export function executeTool(engine: GraphEngine, name: string, rawArgs: unknown, source: EditSource = "voice"): ToolOutcome {
  let call: ParsedArgs;
  try {
    call = parseToolCall(name, rawArgs);
  } catch (err) {
    if (err instanceof ToolArgumentError) return fail(name, err.message, { code: "invalid_arguments" });
    throw err;
  }
  try {
    const outcome = run(engine, call, source);
    if (outcome.ok && outcome.commit) engine.setSuggestion(null);
    return outcome;
  } catch (err) {
    if (err instanceof DomainError) return handleDomainError(engine, call.name, err);
    return fail(call.name, `Something went wrong applying that: ${(err as Error).message}`);
  }
}

function run(engine: GraphEngine, call: ParsedArgs, source: EditSource): ToolOutcome {
  const g = () => engine.graph;
  const tool: ToolName = call.name;

  switch (call.name) {
    case "add_components": {
      const { items, upstream, downstream, connection } = call.args;
      const up = upstream ? resolveNode(g(), upstream) : undefined;
      const down = downstream ? resolveNode(g(), downstream) : undefined;
      const commands: Command[] = [];
      for (const item of items) {
        const count = item.count ?? 1;
        for (let i = 0; i < count; i++) {
          commands.push({
            type: "addNode",
            kind: item.kind,
            name: item.name ? (count > 1 ? `${item.name}-${i + 1}` : item.name) : undefined,
            replicas: item.replicas,
            connectFrom: up ? [up.id] : undefined,
            connectTo: down ? [down.id] : undefined,
            edgeKind: connection,
          });
        }
      }
      const info = engine.commit(commands, source);
      return ok(tool, info.summary, commitPayload(engine, info), { commit: info });
    }

    case "connect_components": {
      const from = resolveNode(g(), call.args.from);
      const to = resolveNode(g(), call.args.to);
      const info = engine.commit([{ type: "connect", from: from.id, to: to.id, kind: call.args.connection, protocol: call.args.protocol }], source, `Connected ${from.name} → ${to.name}`);
      return ok(tool, info.summary, commitPayload(engine, info), { commit: info });
    }

    case "insert_between": {
      const from = resolveNode(g(), call.args.from);
      const to = resolveNode(g(), call.args.to);
      const info = engine.commit([{ type: "insertBetween", kind: call.args.kind, from: from.id, to: to.id, name: call.args.name }], source);
      return ok(tool, info.summary, commitPayload(engine, info), { commit: info });
    }

    case "update_component": {
      const target = resolveNode(g(), call.args.target);
      const info = engine.commit(
        [{ type: "updateNode", id: target.id, name: call.args.rename_to, replicas: call.args.replicas, kind: call.args.change_kind_to }],
        source,
      );
      return ok(tool, info.summary, commitPayload(engine, info), { commit: info });
    }

    case "update_connection": {
      const from = resolveNode(g(), call.args.from);
      const to = resolveNode(g(), call.args.to);
      const edge = findEdge(g(), from.id, to.id) ?? findEdge(g(), to.id, from.id);
      if (!edge) throw new DomainError("not_found", `${from.name} and ${to.name} aren't connected.`);
      const commands: Command[] = [];
      const { protocol, encrypted, connection, reverse } = call.args;
      if (protocol || encrypted !== undefined || connection) commands.push({ type: "updateEdge", id: edge.id, protocol, encrypted, kind: connection });
      if (reverse) commands.push({ type: "reverseEdge", id: edge.id });
      if (!commands.length) throw new DomainError("nothing_to_do", "Say what to change on that connection: protocol, TLS, type, or direction.");
      const info = engine.commit(commands, source, `Updated ${from.name} → ${to.name}`);
      return ok(tool, info.summary, commitPayload(engine, info), { commit: info });
    }

    case "remove": {
      const components = (call.args.components ?? []).map((r) => resolveNode(g(), r));
      const connections = (call.args.connections ?? []).map((c) => {
        const a = resolveNode(g(), c.from);
        const b = resolveNode(g(), c.to);
        const e = findEdge(g(), a.id, b.id) ?? findEdge(g(), b.id, a.id);
        if (!e) throw new DomainError("not_found", `${a.name} and ${b.name} aren't connected.`);
        return { edge: e, label: `${a.name} → ${b.name}` };
      });
      if (!components.length && !connections.length) throw new DomainError("nothing_to_do", "Tell me which component or connection to remove.");
      const dropped = components.flatMap((n) => edgesOf(g(), n.id));
      const destructive = components.length > 1 || dropped.length > 0 || connections.length > 1;
      if (destructive && !call.args.confirmed) {
        const what = components.map((n) => n.name).concat(connections.map((c) => c.label));
        const msg = `Removing ${what.join(", ")}${dropped.length ? ` also drops ${dropped.length} connection${dropped.length > 1 ? "s" : ""}` : ""}. Confirm with the user first.`;
        return fail(tool, msg, { code: "needs_confirmation", ask_user: `Ask: "Remove ${what.join(" and ")}?" Then call remove again with confirmed true if they say yes.` }, { needsConfirmation: true });
      }
      const commands: Command[] = [];
      if (connections.length) commands.push({ type: "removeEdges", ids: connections.map((c) => c.edge.id) });
      if (components.length) commands.push({ type: "removeNodes", ids: components.map((n) => n.id) });
      const info = engine.commit(commands, source);
      return ok(tool, info.summary, { canvas: compactCanvas(engine.graph), undo_hint: "The user can say 'undo' to bring it back." }, { commit: info });
    }

    case "simulate": {
      const { action } = call.args;
      if (action === "traffic") {
        const m = call.args.multiplier ?? 1;
        const sim = engine.startTraffic(m);
        const brief = simBrief(g(), sim.result);
        const msg = brief.failing.length
          ? `At ${m}x traffic, ${brief.failing.length} component${brief.failing.length > 1 ? "s are" : " is"} failing`
          : `At ${m}x traffic, everything holds`;
        return ok(tool, msg, { ...brief, next: brief.failing.length ? "Name the worst bottleneck in one sentence and offer to fix it." : undefined });
      }
      if (action === "kill") {
        if (!call.args.target) throw new DomainError("invalid_value", "Which component should I take down?");
        const target = resolveNode(g(), call.args.target);
        if (!engine.get().sim) engine.startTraffic(1);
        const { sim, wholeNode } = engine.kill(target.id);
        const brief = simBrief(g(), sim.result);
        const alive = target.replicas - (sim.settings.killed[target.id] ?? 0);
        const msg = wholeNode ? `Killed ${target.name}` : `Killed one ${target.name} instance, ${alive} still serving`;
        const failover = sim.result.nodes[target.id]?.failoverTo;
        return ok(tool, msg, { ...brief, failover: failover ? `Traffic failed over to ${g().nodes.find((n) => n.id === failover)?.name}.` : undefined });
      }
      if (action === "fix") {
        if (!engine.get().sim) engine.startTraffic(1);
        const { plan, commit } = engine.fixSimulation(source === "voice" ? "voice" : "fix");
        if (!plan.commands.length && !plan.revive.length) return ok(tool, "Nothing is failing, so there's nothing to fix", simBrief(g(), plan.before));
        const after = engine.get().sim?.result ?? plan.after;
        return ok(tool, plan.explanations[0] ?? "Applied remedies", {
          changes: plan.explanations.slice(0, 5),
          error_rate_before: `${Math.round(plan.before.errorRate * 100)}%`,
          error_rate_after: `${Math.round(after.errorRate * 100)}%`,
          still_failing: simBrief(g(), after).failing,
        }, { commit: commit ?? undefined });
      }
      if (action === "stop") {
        engine.stopSim();
        return ok(tool, "Simulation stopped");
      }
      const sim = engine.get().sim;
      if (!sim) return ok(tool, "No simulation is running", { running: false });
      return ok(tool, `Simulating ${sim.settings.multiplier}x traffic`, simBrief(g(), sim.result));
    }

    case "review_architecture": {
      const findings = engine.get().findings;
      if (call.args.action === "list") {
        if (!findings.length) return ok(tool, "No issues found", { findings: [] });
        return ok(tool, `${findings.length} finding${findings.length > 1 ? "s" : ""}`, {
          findings: findings.slice(0, 5).map(findingBrief),
          next: "Mention the most severe one in a sentence and offer to fix it.",
        });
      }
      if (call.args.action === "accept_suggestion") {
        const s = engine.get().suggestion;
        if (!s) throw new DomainError("nothing_to_do", "There's no pending suggestion to apply.");
        const info = engine.commit(s.commands, source, s.label);
        return ok(tool, info.summary, commitPayload(engine, info), { commit: info });
      }
      if (call.args.action === "fix") {
        const f = matchFinding(findings, call.args.finding);
        if (!f) {
          return fail(tool, findings.length ? `I couldn't match "${call.args.finding}" to a fixable finding.` : "There are no findings to fix.", {
            findings: findings.filter((x) => x.fix).slice(0, 5).map(findingBrief),
          });
        }
        const info = engine.commit(f.fix!.commands, source === "voice" ? "voice" : "fix", `Fixed: ${f.title}`);
        return ok(tool, info.summary, { fixed: f.title, ...commitPayload(engine, info) }, { commit: info });
      }
      // fix_all: apply fixes one at a time on a scratch graph, then commit once.
      let scratch = engine.graph;
      const applied: string[] = [];
      const commands: Command[] = [];
      const tried = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const next = lintGraph(scratch).find((f) => f.fix && !tried.has(f.id));
        if (!next) break;
        tried.add(next.id);
        try {
          scratch = applyCommands(scratch, next.fix!.commands).graph;
          commands.push(...next.fix!.commands);
          applied.push(next.title);
        } catch {
          // A fix can become invalid after an earlier one; skip it.
        }
      }
      if (!commands.length) return ok(tool, "Nothing to fix", { remaining: findings.length });
      const info = engine.commit(commands, source === "voice" ? "voice" : "fix", `Fixed ${applied.length} issue${applied.length > 1 ? "s" : ""}`);
      return ok(tool, info.summary, { fixed: applied, remaining: engine.get().findings.length, canvas: compactCanvas(engine.graph) }, { commit: info });
    }

    case "canvas": {
      const { action } = call.args;
      if (action === "undo" || action === "redo") {
        const steps = call.args.steps ?? 1;
        const n = action === "undo" ? engine.undo(steps) : engine.redo(steps);
        if (!n) return fail(tool, action === "undo" ? "Nothing to undo." : "Nothing to redo.");
        const last = engine.get().lastCommit!;
        return ok(tool, last.summary, { steps: n, canvas: compactCanvas(engine.graph) }, { commit: last });
      }
      if (action === "auto_layout") {
        const info = engine.commit([{ type: "autoLayout", unpinAll: true }], source, "Tidied the layout");
        return ok(tool, info.summary, {}, { commit: info, uiAction: { type: "fit" } });
      }
      if (action === "fit_view") return ok(tool, "Fit the diagram to the screen", {}, { uiAction: { type: "fit" } });
      if (action === "load_template") {
        const id = call.args.template;
        if (!id) throw new DomainError("invalid_value", `Which template: ${Object.values(TEMPLATES).map((t) => t.name).join(", ")}?`);
        if (g().nodes.length >= 3 && !call.args.confirmed) {
          return fail(tool, `Loading ${TEMPLATES[id].name} replaces the ${g().nodes.length} components on the canvas. Confirm first.`, { code: "needs_confirmation" }, { needsConfirmation: true });
        }
        const info = engine.replace(buildTemplate(id), `Loaded ${TEMPLATES[id].name}`, source, TEMPLATES[id].name);
        return ok(tool, info.summary, { canvas: compactCanvas(engine.graph) }, { commit: info, uiAction: { type: "fit" } });
      }
      if (action === "clear") {
        if (!g().nodes.length) return ok(tool, "The canvas is already empty");
        if (!call.args.confirmed) {
          return fail(tool, `Clearing removes all ${g().nodes.length} components. Confirm with the user first.`, { code: "needs_confirmation" }, { needsConfirmation: true });
        }
        engine.stopSim();
        const info = engine.replace(emptyGraph(), "Cleared the canvas", source);
        return ok(tool, info.summary, { undo_hint: "They can say 'undo' to restore it." }, { commit: info });
      }
      if (action === "export") {
        const format = call.args.format ?? "terraform";
        const label = format === "adr" ? "ADR" : format === "terraform" ? "Terraform" : "Mermaid";
        if (!g().nodes.length) return fail(tool, "There's nothing on the canvas to export yet.");
        return ok(tool, `Opened the ${label} export`, { format }, { uiAction: { type: "export", format } });
      }
      // rename_diagram
      if (!call.args.title) throw new DomainError("invalid_value", "What should I call the diagram?");
      engine.setTitle(call.args.title);
      return ok(tool, `Renamed the diagram to ${engine.get().title}`);
    }
  }
}

/** A short spoken-style summary of a component kind, for the prompt. */
export function kindLine(kind: Parameters<typeof spec>[0]) {
  const s = spec(kind);
  return `${s.kind}: ${s.label}`;
}
