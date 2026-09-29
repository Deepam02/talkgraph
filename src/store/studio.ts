"use client";

/**
 * Studio store: a thin zustand layer over the headless GraphEngine that adds
 * UI state (selection, toasts, dialogs, voice captions). Every edit path
 * (voice, command bar, palette, canvas, fixes) funnels through here.
 */
import { create } from "zustand";
import type { ComponentKind } from "@/domain/catalog";
import { DomainError, type Command, type Suggestion } from "@/domain/commands";
import type { XY } from "@/domain/graph";
import { checkConnection } from "@/domain/rules";
import { GraphEngine, type CommitInfo, type EditSource, type EngineState } from "@/engine/engine";
import { CommandRunner } from "@/nlu/runner";
import type { AgentStatus } from "@/voice/protocol";
import { executeTool, type ToolOutcome } from "@/voice/dispatch";

export type ToastKind = "edit" | "error" | "info" | "confirm";

export interface Toast {
  id: number;
  kind: ToastKind;
  source: EditSource;
  title: string;
  detail?: string;
  /** Show an Undo button (edits). */
  undoable?: boolean;
  suggestion?: Suggestion;
  /** For needs-confirmation: re-run this with confirmed true. */
  confirm?: { label: string; run: () => void };
}

export interface Caption {
  who: "user" | "agent";
  text: string;
  final: boolean;
  at: number;
}

export type ExportFormat = "terraform" | "mermaid" | "adr";
export type PanelTab = "inspect" | "review" | "simulate" | "history";

interface StudioState {
  engine: GraphEngine;
  runner: CommandRunner;
  snap: EngineState;
  selection: { nodes: string[]; edges: string[] };
  toasts: Toast[];
  pulses: Record<string, number>;
  fitSignal: number;
  exportOpen: ExportFormat | null;
  panel: PanelTab;
  panelOpen: boolean;
  chaos: boolean;
  voice: { status: AgentStatus; configured: boolean | null; error: string | null; captions: Caption[]; sessionEndsAt: number | null };
  saveState: "idle" | "saving" | "saved" | "error";

  // edits
  commit(commands: Command[], source: EditSource, label?: string): CommitInfo | null;
  runTool(name: string, args: unknown, source: EditSource): ToolOutcome;
  runText(text: string): void;
  addComponent(kind: ComponentKind, position?: XY): void;
  connect(source: string, target: string): void;
  canConnect(source: string, target: string): boolean;
  deleteSelection(nodes: string[], edges: string[]): void;
  moveNode(id: string, pos: XY): void;
  undo(): void;
  redo(): void;
  applySuggestion(s: Suggestion): void;

  // ui
  select(nodes: string[], edges: string[]): void;
  pushToast(t: Omit<Toast, "id">): void;
  dismissToast(id: number): void;
  requestFit(): void;
  setExport(f: ExportFormat | null): void;
  setPanel(tab: PanelTab, open?: boolean): void;
  togglePanel(): void;
  setChaos(on: boolean): void;
  setVoice(patch: Partial<StudioState["voice"]>): void;
  addCaption(c: Omit<Caption, "at">): void;
  setSaveState(s: StudioState["saveState"]): void;
}

let toastSeq = 0;
const engine = new GraphEngine();
const runner = new CommandRunner(engine);

export const useStudio = create<StudioState>((set, get) => {
  // Mirror engine state and turn every commit into a toast + update pulses.
  let lastSeq = 0;
  engine.subscribe((snap) => {
    const patch: Partial<StudioState> = { snap };
    const c = snap.lastCommit;
    if (c && c.seq !== lastSeq) {
      lastSeq = c.seq;
      const pulses = { ...get().pulses };
      for (const ch of c.changes) if (ch.type === "nodeUpdated" && !ch.fields.includes("position")) pulses[ch.id] = c.seq;
      patch.pulses = pulses;
      // Drop selection of things that no longer exist.
      const { nodes, edges } = get().selection;
      const nodeIds = new Set(snap.graph.nodes.map((n) => n.id));
      const edgeIds = new Set(snap.graph.edges.map((e) => e.id));
      patch.selection = { nodes: nodes.filter((id) => nodeIds.has(id)), edges: edges.filter((id) => edgeIds.has(id)) };
      const moveOnly = c.changes.length > 0 && c.changes.every((ch) => ch.type === "nodeUpdated" && ch.fields.includes("position"));
      if (!moveOnly && c.summary !== "No changes") {
        queueMicrotask(() =>
          get().pushToast({
            kind: "edit",
            source: c.source,
            title: c.summary,
            detail: c.notes.slice(0, 2).join(" "),
            undoable: c.source !== "system" || !c.summary.startsWith("Undid"),
          }),
        );
      }
    }
    set(patch);
  });

  const toastOutcome = (o: ToolOutcome, retry?: () => void) => {
    if (o.ok) {
      if (!o.commit) get().pushToast({ kind: "info", source: "voice", title: o.message });
      if (o.uiAction?.type === "export") set({ exportOpen: o.uiAction.format });
      if (o.uiAction?.type === "fit") get().requestFit();
      if (o.tool === "simulate") set({ panel: "simulate", panelOpen: true });
      return;
    }
    if (o.needsConfirmation && retry) {
      get().pushToast({ kind: "confirm", source: "voice", title: o.message.replace(/ Confirm.*$/, ""), confirm: { label: "Confirm", run: retry } });
      return;
    }
    get().pushToast({ kind: "error", source: "voice", title: o.message, suggestion: o.suggestion });
  };

  return {
    engine,
    runner,
    snap: engine.get(),
    selection: { nodes: [], edges: [] },
    toasts: [],
    pulses: {},
    fitSignal: 0,
    exportOpen: null,
    panel: "review",
    panelOpen: true,
    chaos: false,
    voice: { status: "idle", configured: null, error: null, captions: [], sessionEndsAt: null },
    saveState: "idle",

    commit(commands, source, label) {
      try {
        return engine.commit(commands, source, label);
      } catch (err) {
        if (err instanceof DomainError) {
          if (err.suggestion) engine.setSuggestion(err.suggestion);
          get().pushToast({ kind: "error", source, title: err.message, suggestion: err.suggestion });
          return null;
        }
        throw err;
      }
    },

    runTool(name, args, source) {
      const o = executeTool(engine, name, args, source);
      // Voice outcomes: toasts for errors/info; commits already toast via the subscription.
      if (source !== "voice") toastOutcome(o, () => get().runTool(name, { ...(args as object), confirmed: true }, source));
      else {
        if (o.ok) toastOutcome(o);
        else if (!o.needsConfirmation) get().pushToast({ kind: "error", source, title: o.message, suggestion: o.suggestion });
      }
      return o;
    },

    runText(text) {
      const steps = runner.run(text, "command");
      for (const s of steps) {
        if (s.parseError) get().pushToast({ kind: "error", source: "command", title: s.parseError });
        else if (s.outcome) {
          const call = s.call!;
          toastOutcome(s.outcome, () => get().runTool(call.name, { ...call.arguments, confirmed: true }, "command"));
        }
      }
    },

    addComponent(kind, position) {
      const { selection, snap } = get();
      const focus = selection.nodes.length === 1 ? selection.nodes[0] : undefined;
      if (focus) engine.setFocus(focus);
      const info = get().commit([{ type: "addNode", kind, position, autoConnect: !position || Boolean(focus) || snap.graph.nodes.length < 12 }], "ui");
      if (info) {
        const added = info.changes.find((c) => c.type === "nodeAdded");
        if (added) set({ selection: { nodes: [added.id], edges: [] } });
      }
    },

    connect(source, target) {
      get().commit([{ type: "connect", from: source, to: target }], "ui");
    },

    canConnect(source, target) {
      const g = engine.graph;
      const s = g.nodes.find((n) => n.id === source);
      const t = g.nodes.find((n) => n.id === target);
      if (!s || !t) return false;
      return checkConnection(g, s, t).ok;
    },

    deleteSelection(nodes, edges) {
      const g = engine.graph;
      const nodeIds = nodes.filter((id) => g.nodes.some((n) => n.id === id));
      const edgeIds = edges.filter((id) => g.edges.some((e) => e.id === id && !nodeIds.includes(e.source) && !nodeIds.includes(e.target)));
      const commands: Command[] = [];
      if (edgeIds.length) commands.push({ type: "removeEdges", ids: edgeIds });
      if (nodeIds.length) commands.push({ type: "removeNodes", ids: nodeIds });
      if (commands.length) get().commit(commands, "ui");
    },

    moveNode(id, pos) {
      engine.moveNode(id, Math.round(pos.x), Math.round(pos.y), true);
    },

    undo() {
      if (!engine.undo()) get().pushToast({ kind: "info", source: "ui", title: "Nothing to undo" });
    },

    redo() {
      if (!engine.redo()) get().pushToast({ kind: "info", source: "ui", title: "Nothing to redo" });
    },

    applySuggestion(s) {
      if (get().commit(s.commands, "fix", s.label)) engine.setSuggestion(null);
    },

    select(nodes, edges) {
      const cur = get().selection;
      if (cur.nodes.join() === nodes.join() && cur.edges.join() === edges.join()) return;
      set({ selection: { nodes, edges } });
      if (nodes.length === 1) engine.setFocus(nodes[0]);
      if (nodes.length || edges.length) set({ panel: "inspect", panelOpen: true });
    },

    pushToast(t) {
      const id = ++toastSeq;
      set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
      const ttl = t.kind === "confirm" ? 12000 : t.kind === "error" ? 9000 : 5200;
      setTimeout(() => get().dismissToast(id), ttl);
    },

    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },

    requestFit() {
      set((s) => ({ fitSignal: s.fitSignal + 1 }));
    },

    setExport(f) {
      set({ exportOpen: f });
    },

    setPanel(tab, open = true) {
      set({ panel: tab, panelOpen: open });
    },

    togglePanel() {
      set((s) => ({ panelOpen: !s.panelOpen }));
    },

    setChaos(on) {
      set({ chaos: on });
      if (on && !engine.get().sim) engine.startTraffic(1);
    },

    setVoice(patch) {
      set((s) => ({ voice: { ...s.voice, ...patch } }));
    },

    addCaption(c) {
      set((s) => {
        const caps = [...s.voice.captions];
        const last = caps[caps.length - 1];
        if (last && last.who === c.who && !last.final) caps[caps.length - 1] = { ...c, at: Date.now() };
        else caps.push({ ...c, at: Date.now() });
        return { voice: { ...s.voice, captions: caps.slice(-6) } };
      });
    },

    setSaveState(saveState) {
      set({ saveState });
    },
  };
});

export function studioEngine() {
  return engine;
}
