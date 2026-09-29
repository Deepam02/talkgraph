/**
 * GraphEngine: the headless application core. Owns the graph, undo/redo
 * history, simulation state, and the pending suggestion. The React store,
 * the voice agent, the command bar, and the benchmark all drive this same
 * object, so behavior is identical everywhere and fully testable without a DOM.
 */
import { applyCommands, describeChanges, type ApplyResult, type Change } from "@/domain/apply";
import type { Command, Suggestion } from "@/domain/commands";
import { emptyGraph, type Graph } from "@/domain/graph";
import { lintGraph, newFindings, type Finding } from "@/domain/lint";
import { planRemedies, type RemedyPlan } from "@/domain/remedy";
import { DEFAULT_SIM, killNode, simulate, type SimResult, type SimSettings } from "@/domain/sim";

export type EditSource = "voice" | "ui" | "command" | "fix" | "system";

export interface HistoryEntry {
  graph: Graph;
  label: string;
  source: EditSource;
  at: number;
}

export interface CommitInfo {
  summary: string;
  notes: string[];
  changes: Change[];
  before: Graph;
  after: Graph;
  newFindings: Finding[];
  source: EditSource;
  /** Monotonic id so the UI can key toasts and animations. */
  seq: number;
}

export interface SimState {
  settings: SimSettings;
  result: SimResult;
}

export interface EngineState {
  graph: Graph;
  title: string;
  past: HistoryEntry[];
  future: HistoryEntry[];
  sim: SimState | null;
  suggestion: Suggestion | null;
  focusId: string | undefined;
  findings: Finding[];
  lastCommit: CommitInfo | null;
}

const HISTORY_LIMIT = 100;

export class GraphEngine {
  private state: EngineState;
  private listeners = new Set<(s: EngineState) => void>();
  private seq = 0;

  constructor(graph: Graph = emptyGraph(), title = "Untitled system") {
    this.state = {
      graph,
      title,
      past: [],
      future: [],
      sim: null,
      suggestion: null,
      focusId: undefined,
      findings: lintGraph(graph),
      lastCommit: null,
    };
  }

  get(): EngineState {
    return this.state;
  }

  get graph(): Graph {
    return this.state.graph;
  }

  subscribe(fn: (s: EngineState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private resim(graph: Graph, sim: SimState | null): SimState | null {
    if (!sim) return null;
    const alive = Object.fromEntries(Object.entries(sim.settings.killed).filter(([id]) => graph.nodes.some((n) => n.id === id)));
    const settings = { ...sim.settings, killed: alive };
    return { settings, result: simulate(graph, settings) };
  }

  /** Apply commands as one undoable transaction. Throws DomainError on rejection (graph untouched). */
  commit(commands: Command[], source: EditSource, label?: string, opts: { layout?: boolean; recordHistory?: boolean } = {}): CommitInfo {
    const before = this.state.graph;
    const result: ApplyResult = applyCommands(before, commands, { focusId: this.state.focusId, layout: opts.layout });
    return this.accept(before, result, source, label, opts.recordHistory ?? true);
  }

  private accept(before: Graph, result: ApplyResult, source: EditSource, label: string | undefined, record: boolean): CommitInfo {
    const summary = label ?? describeChanges(before, result.graph, result.changes);
    const findings = lintGraph(result.graph);
    const info: CommitInfo = {
      summary,
      notes: result.notes,
      changes: result.changes,
      before,
      after: result.graph,
      newFindings: newFindings(this.state.findings, findings),
      source,
      seq: ++this.seq,
    };
    const past = record
      ? [...this.state.past, { graph: before, label: summary, source, at: Date.now() }].slice(-HISTORY_LIMIT)
      : this.state.past;
    this.set({
      graph: result.graph,
      past,
      future: record ? [] : this.state.future,
      findings,
      focusId: result.touched.at(-1) ?? this.state.focusId,
      sim: this.resim(result.graph, this.state.sim),
      lastCommit: info,
    });
    return info;
  }

  /** Move a node without creating a history entry per drag frame. */
  moveNode(id: string, x: number, y: number, record: boolean) {
    const before = this.state.graph;
    const result = applyCommands(before, [{ type: "moveNode", id, position: { x, y } }], { layout: false });
    if (record) this.accept(before, result, "ui", "Moved component", true);
    else this.set({ graph: result.graph });
  }

  undo(steps = 1): number {
    let n = 0;
    let { graph, past, future } = this.state;
    while (n < steps && past.length) {
      const entry = past[past.length - 1];
      past = past.slice(0, -1);
      future = [{ graph, label: entry.label, source: entry.source, at: Date.now() }, ...future];
      graph = entry.graph;
      n++;
    }
    if (n) this.restore(graph, past, future, n === 1 ? `Undid: ${future[0].label}` : `Undid ${n} steps`);
    return n;
  }

  redo(steps = 1): number {
    let n = 0;
    let { graph, past, future } = this.state;
    const labels: string[] = [];
    while (n < steps && future.length) {
      const entry = future[0];
      future = future.slice(1);
      past = [...past, { graph, label: entry.label, source: entry.source, at: Date.now() }];
      graph = entry.graph;
      labels.push(entry.label);
      n++;
    }
    if (n) this.restore(graph, past, future, n === 1 ? `Redid: ${labels[0]}` : `Redid ${n} steps`);
    return n;
  }

  private restore(graph: Graph, past: HistoryEntry[], future: HistoryEntry[], summary: string) {
    const before = this.state.graph;
    const findings = lintGraph(graph);
    this.set({
      graph,
      past,
      future,
      findings,
      sim: this.resim(graph, this.state.sim),
      lastCommit: {
        summary,
        notes: [],
        changes: [{ type: "replaced" }],
        before,
        after: graph,
        newFindings: [],
        source: "system",
        seq: ++this.seq,
      },
    });
  }

  replace(graph: Graph, label: string, source: EditSource = "system", title?: string): CommitInfo {
    const info = this.commit([{ type: "replaceGraph", graph }], source, label, { layout: false });
    if (title) this.set({ title });
    return info;
  }

  /** Open a diagram fresh: no undo history, no simulation, no toast. */
  load(graph: Graph, title: string) {
    this.set({
      graph,
      title: title || "Untitled system",
      past: [],
      future: [],
      sim: null,
      suggestion: null,
      focusId: undefined,
      findings: lintGraph(graph),
      lastCommit: null,
    });
  }

  setTitle(title: string) {
    this.set({ title: title.trim().slice(0, 60) || "Untitled system" });
  }

  setFocus(id: string | undefined) {
    if (id !== this.state.focusId) this.set({ focusId: id });
  }

  setSuggestion(s: Suggestion | null) {
    this.set({ suggestion: s });
  }

  // ── Simulation ──────────────────────────────────────────────────────────

  startTraffic(multiplier: number): SimState {
    const settings: SimSettings = { multiplier, killed: this.state.sim?.settings.killed ?? {} };
    const sim = { settings, result: simulate(this.state.graph, settings) };
    this.set({ sim });
    return sim;
  }

  kill(id: string): { sim: SimState; wholeNode: boolean } {
    const base = this.state.sim?.settings ?? DEFAULT_SIM;
    const { settings, wholeNode } = killNode(this.state.graph, base, id);
    const sim = { settings, result: simulate(this.state.graph, settings) };
    this.set({ sim });
    return { sim, wholeNode };
  }

  revive(ids: string[]) {
    if (!this.state.sim) return;
    const killed = { ...this.state.sim.settings.killed };
    for (const id of ids) delete killed[id];
    const settings = { ...this.state.sim.settings, killed };
    this.set({ sim: { settings, result: simulate(this.state.graph, settings) } });
  }

  stopSim() {
    this.set({ sim: null });
  }

  /** Plan and apply remedies for the running simulation as one undoable edit. */
  fixSimulation(source: EditSource): { plan: RemedyPlan; commit: CommitInfo | null } {
    const settings = this.state.sim?.settings ?? DEFAULT_SIM;
    const plan = planRemedies(this.state.graph, settings);
    let commit: CommitInfo | null = null;
    if (plan.commands.length) {
      const n = plan.explanations.length;
      commit = this.commit(plan.commands, source, `Applied ${n} fix${n === 1 ? "" : "es"}`);
      commit.notes = plan.explanations;
      this.set({ lastCommit: { ...commit } });
    }
    if (plan.revive.length) this.revive(plan.revive);
    else if (this.state.sim) this.set({ sim: this.resim(this.state.graph, this.state.sim) });
    return { plan, commit };
  }

  canUndo() {
    return this.state.past.length > 0;
  }

  canRedo() {
    return this.state.future.length > 0;
  }
}
