"use client";

import { ArrowLeftRight, ArrowRight, Bookmark, History, Lock, LockOpen, Minus, Play, Plus, RotateCcw, ScanSearch, Skull, Square, Trash2, Wand2, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { CATEGORY_META, COMPONENTS, spec } from "@/domain/catalog";
import { EDGE_KIND_META, EDGE_KINDS, PROTOCOLS, type ArchEdge, type EdgeKind, type Protocol } from "@/domain/graph";
import type { Finding } from "@/domain/lint";
import { fmt } from "@/domain/sim";
import type { VersionRecord } from "@/storage/types";
import { useNow } from "@/lib/useNow";
import { useStudio, type PanelTab } from "@/store/studio";
import { ComponentIcon } from "../ComponentIcon";
import { EDGE_STYLE } from "../canvas/FlowEdge";
import { HEALTH_COLOR } from "../canvas/types";

const SEV = {
  high: { color: "#F43F5E", label: "High" },
  medium: { color: "#F59E0B", label: "Medium" },
  low: { color: "#8A8FB3", label: "Low" },
} as const;

const TABS: { id: PanelTab; label: string; icon: ReactNode }[] = [
  { id: "inspect", label: "Inspect", icon: <ScanSearch size={14} /> },
  { id: "review", label: "Review", icon: <Wand2 size={14} /> },
  { id: "simulate", label: "Simulate", icon: <Zap size={14} /> },
  { id: "history", label: "History", icon: <History size={14} /> },
];

export function Inspector(props: { versions: VersionRecord[]; onSaveVersion(): void; onRestore(v: VersionRecord): void }) {
  const panel = useStudio((s) => s.panel);
  const open = useStudio((s) => s.panelOpen);
  const findings = useStudio((s) => s.snap.findings);
  const simOn = useStudio((s) => Boolean(s.snap.sim));
  const setPanel = useStudio((s) => s.setPanel);
  if (!open) return null;

  return (
    <aside aria-label="Inspector" className="glass pointer-events-auto absolute bottom-4 right-4 top-20 z-20 flex w-[316px] flex-col overflow-hidden rounded-[22px] max-md:hidden">
      <div role="tablist" className="m-2 grid grid-cols-4 gap-0.5 rounded-[14px] bg-ink/[0.045] p-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={panel === t.id}
            type="button"
            onClick={() => setPanel(t.id)}
            className={`relative flex items-center justify-center gap-1 rounded-[11px] py-1.5 text-[12px] font-medium transition ${panel === t.id ? "bg-white/90 text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
          >
            {t.icon}
            {t.label}
            {t.id === "review" && findings.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-amber px-1 text-[9.5px] font-bold text-white">{findings.length}</span>
            )}
            {t.id === "simulate" && simOn && <span className="tg-breathe absolute right-1 top-1 size-1.5 rounded-full bg-sky" />}
          </button>
        ))}
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-3 pb-4">
        {panel === "inspect" && <InspectTab />}
        {panel === "review" && <ReviewTab />}
        {panel === "simulate" && <SimulateTab />}
        {panel === "history" && <HistoryTab {...props} />}
      </div>
    </aside>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 mt-4 text-[11.5px] font-semibold text-ink-soft">{children}</div>;
}

// ── Inspect ──────────────────────────────────────────────────────────────

function InspectTab() {
  const selection = useStudio((s) => s.selection);
  const graph = useStudio((s) => s.snap.graph);
  const node = selection.nodes.length === 1 ? graph.nodes.find((n) => n.id === selection.nodes[0]) : undefined;
  const edge = !node && selection.edges.length === 1 ? graph.edges.find((e) => e.id === selection.edges[0]) : undefined;
  const count = selection.nodes.length + selection.edges.length;

  if (node) return <NodeInspector id={node.id} />;
  if (edge) return <EdgeInspector edge={edge} />;
  if (count > 1)
    return (
      <div className="pt-4">
        <p className="text-[13px] text-ink">{count} items selected.</p>
        <button type="button" className="btn btn-quiet mt-3 w-full justify-center text-rose" onClick={() => useStudio.getState().deleteSelection(selection.nodes, selection.edges)}>
          <Trash2 size={15} /> Delete selection
        </button>
      </div>
    );
  return (
    <div className="px-1 pt-5 text-[13px] leading-relaxed text-ink-soft">
      <p className="text-ink">Select a component or connection to edit it.</p>
      <p className="mt-2">Or just say what you want: &ldquo;scale orders to five&rdquo;, &ldquo;use gRPC between api and orders&rdquo;.</p>
      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[12px]">
        {[
          ["Space", "Talk"],
          ["Ctrl K", "Type a command"],
          ["Ctrl Z", "Undo"],
          ["Del", "Remove selection"],
          ["L", "Tidy layout"],
          ["F", "Fit to screen"],
        ].map(([k, v]) => (
          <div key={k} className="contents">
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function NodeInspector({ id }: { id: string }) {
  const graph = useStudio((s) => s.snap.graph);
  const findings = useStudio((s) => s.snap.findings);
  const sim = useStudio((s) => s.snap.sim);
  const node = graph.nodes.find((n) => n.id === id)!;
  const { commit, deleteSelection } = useStudio.getState();
  const s = spec(node.kind);
  const meta = CATEGORY_META[s.category];
  const siblings = COMPONENTS.filter((c) => c.category === s.category);
  const edges = graph.edges.filter((e) => e.source === id || e.target === id);
  const nodeFindings = findings.filter((f) => f.nodeIds.includes(id));
  const ns = sim?.result.nodes[id];

  return (
    <div className="pt-2">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-[13px]" style={{ background: meta.tint, color: meta.color, boxShadow: `inset 0 0 0 1px ${meta.color}33` }}>
          <ComponentIcon kind={node.kind} size={21} />
        </span>
        <div className="min-w-0">
          <div className="truncate font-display text-[17px] font-semibold tracking-[-0.01em]">{node.name}</div>
          <div className="text-[12px] text-ink-soft">{s.blurb}</div>
        </div>
      </div>
      {node.inferred && (
        <p className="mt-3 rounded-xl bg-violet/8 px-3 py-2 text-[12px] text-ink-soft">
          <span className="font-semibold text-violet">Inferred.</span> {node.inferred.reason}
        </p>
      )}

      <Label>Name</Label>
      <input
        key={node.name}
        defaultValue={node.name}
        className="field"
        onBlur={(e) => e.target.value !== node.name && commit([{ type: "updateNode", id, name: e.target.value }], "ui")}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />

      <div className="mt-1 grid grid-cols-2 gap-2">
        <div>
          <Label>Kind</Label>
          <select className="field" value={node.kind} onChange={(e) => commit([{ type: "updateNode", id, kind: e.target.value as typeof node.kind }], "ui")}>
            {siblings.map((c) => (
              <option key={c.kind} value={c.kind}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Instances</Label>
          <div className="flex h-[2.1rem] items-center justify-between rounded-[0.65rem] border border-ink/10 bg-white/55 px-1">
            <button type="button" className="btn btn-icon !size-7" aria-label="Fewer instances" disabled={node.replicas <= 1} onClick={() => commit([{ type: "updateNode", id, replicas: node.replicas - 1 }], "ui")}>
              <Minus size={14} />
            </button>
            <span className="text-[13px] font-semibold tabular-nums">{node.replicas}</span>
            <button type="button" className="btn btn-icon !size-7" aria-label="More instances" onClick={() => commit([{ type: "updateNode", id, replicas: node.replicas + 1 }], "ui")}>
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>

      {ns && (
        <>
          <Label>Under simulation</Label>
          <div className="rounded-xl border border-ink/8 bg-white/50 px-3 py-2 text-[12.5px]">
            <div className="flex justify-between">
              <span className="font-semibold" style={{ color: HEALTH_COLOR[ns.health] }}>
                {ns.health[0].toUpperCase() + ns.health.slice(1)}
              </span>
              <span className="tabular-nums text-ink-soft">
                {fmt(ns.load)} / {fmt(ns.capacity)} rps
              </span>
            </div>
            <p className="mt-1 text-ink-soft">{ns.reason}</p>
          </div>
        </>
      )}

      <Label>Connections ({edges.length})</Label>
      {edges.length === 0 && <p className="text-[12.5px] text-ink-faint">Drag from the right edge of this component to another one, or say &ldquo;connect {node.name} to …&rdquo;.</p>}
      <ul className="space-y-1.5">
        {edges.map((e) => (
          <EdgeRow key={e.id} edge={e} self={id} />
        ))}
      </ul>

      {nodeFindings.length > 0 && (
        <>
          <Label>Findings</Label>
          <ul className="space-y-2">
            {nodeFindings.map((f) => (
              <FindingCard key={f.id} f={f} />
            ))}
          </ul>
        </>
      )}

      <button type="button" className="btn btn-quiet mt-5 w-full justify-center text-rose" onClick={() => deleteSelection([id], [])}>
        <Trash2 size={15} /> Remove {node.name}
      </button>
    </div>
  );
}

function EdgeRow({ edge, self }: { edge: ArchEdge; self: string }) {
  const graph = useStudio((s) => s.snap.graph);
  const { commit } = useStudio.getState();
  const outgoing = edge.source === self;
  const other = graph.nodes.find((n) => n.id === (outgoing ? edge.target : edge.source));
  return (
    <li className="flex items-center gap-2 rounded-xl border border-ink/8 bg-white/45 px-2 py-1.5">
      <span className="h-0.5 w-4 shrink-0 rounded" style={{ background: EDGE_STYLE[edge.kind].color }} title={EDGE_KIND_META[edge.kind].label} />
      <span className="min-w-0 flex-1 truncate text-[12.5px]">
        {outgoing ? "to" : "from"} <span className="font-semibold">{other?.name}</span>
      </span>
      <select
        aria-label="Protocol"
        className="h-7 rounded-lg border border-ink/8 bg-white/60 px-1 text-[11.5px]"
        value={edge.protocol}
        onChange={(e) => commit([{ type: "updateEdge", id: edge.id, protocol: e.target.value as Protocol }], "ui")}
      >
        {PROTOCOLS.map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
      <button
        type="button"
        className="grid size-7 place-items-center rounded-lg transition hover:bg-white"
        aria-label={edge.encrypted ? "Encrypted, click to disable TLS" : "Plaintext, click to enable TLS"}
        title={edge.encrypted ? "TLS on" : "Plaintext"}
        onClick={() => commit([{ type: "updateEdge", id: edge.id, encrypted: !edge.encrypted }], "ui")}
      >
        {edge.encrypted ? <Lock size={13} className="text-sky" /> : <LockOpen size={13} className="text-rose" />}
      </button>
      <button type="button" className="grid size-7 place-items-center rounded-lg text-ink-faint transition hover:bg-white hover:text-rose" aria-label="Remove connection" onClick={() => commit([{ type: "removeEdges", ids: [edge.id] }], "ui")}>
        <Trash2 size={13} />
      </button>
    </li>
  );
}

function EdgeInspector({ edge }: { edge: ArchEdge }) {
  const graph = useStudio((s) => s.snap.graph);
  const { commit } = useStudio.getState();
  const s = graph.nodes.find((n) => n.id === edge.source);
  const t = graph.nodes.find((n) => n.id === edge.target);
  return (
    <div className="pt-3">
      <div className="flex items-center gap-2 font-display text-[16px] font-semibold">
        {s?.name} <ArrowRight size={16} className="text-ink-faint" /> {t?.name}
      </div>
      <p className="mt-1 text-[12px] text-ink-soft">{EDGE_KIND_META[edge.kind].description}</p>
      {edge.inferred && (
        <p className="mt-3 rounded-xl bg-violet/8 px-3 py-2 text-[12px] text-ink-soft">
          <span className="font-semibold text-violet">Inferred.</span> {edge.inferred.reason}
        </p>
      )}
      <Label>Link type</Label>
      <div className="grid grid-cols-2 gap-1.5">
        {EDGE_KINDS.map((k: EdgeKind) => (
          <button
            key={k}
            type="button"
            onClick={() => k !== edge.kind && commit([{ type: "updateEdge", id: edge.id, kind: k }], "ui")}
            className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-[12px] font-medium transition ${edge.kind === k ? "border-indigo/40 bg-indigo/8 text-ink" : "border-ink/8 bg-white/40 text-ink-soft hover:text-ink"}`}
          >
            <svg width="22" height="6" aria-hidden>
              <line x1="0" y1="3" x2="22" y2="3" stroke={EDGE_STYLE[k].color} strokeWidth={EDGE_STYLE[k].width} strokeDasharray={EDGE_STYLE[k].dash} strokeLinecap={EDGE_STYLE[k].cap ?? "butt"} />
            </svg>
            {EDGE_KIND_META[k].label}
          </button>
        ))}
      </div>
      <Label>Protocol</Label>
      <div className="flex gap-2">
        <select className="field" value={edge.protocol} onChange={(e) => commit([{ type: "updateEdge", id: edge.id, protocol: e.target.value as Protocol }], "ui")}>
          {PROTOCOLS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <button type="button" className={`btn btn-quiet shrink-0 ${edge.encrypted ? "" : "text-rose"}`} onClick={() => commit([{ type: "updateEdge", id: edge.id, encrypted: !edge.encrypted }], "ui")}>
          {edge.encrypted ? <Lock size={14} /> : <LockOpen size={14} />} {edge.encrypted ? "TLS" : "Plaintext"}
        </button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-quiet justify-center" onClick={() => commit([{ type: "reverseEdge", id: edge.id }], "ui")}>
          <ArrowLeftRight size={14} /> Reverse
        </button>
        <button type="button" className="btn btn-quiet justify-center text-rose" onClick={() => commit([{ type: "removeEdges", ids: [edge.id] }], "ui")}>
          <Trash2 size={14} /> Remove
        </button>
      </div>
    </div>
  );
}

// ── Review ───────────────────────────────────────────────────────────────

export function FindingCard({ f }: { f: Finding }) {
  const { commit, select } = useStudio.getState();
  return (
    <li className="rounded-2xl border border-ink/8 bg-white/55 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: SEV[f.severity].color, boxShadow: `0 0 0 3px ${SEV[f.severity].color}22` }} />
        <div className="min-w-0 flex-1">
          <button type="button" className="text-left text-[13px] font-semibold leading-snug text-ink hover:text-indigo" onClick={() => select(f.nodeIds.slice(0, 1), f.edgeIds.slice(0, 1))}>
            {f.title}
          </button>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">{f.message}</p>
          {f.fix && (
            <button type="button" className="btn btn-quiet mt-2 !h-8 !text-[12px]" onClick={() => commit(f.fix!.commands, "fix", `Fixed: ${f.title}`)}>
              <Wand2 size={13} /> {f.fix.label}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function ReviewTab() {
  const findings = useStudio((s) => s.snap.findings);
  const nodes = useStudio((s) => s.snap.graph.nodes.length);
  const runTool = useStudio((s) => s.runTool);
  const fixable = findings.filter((f) => f.fix).length;
  if (!nodes) return <p className="px-1 pt-5 text-[13px] text-ink-soft">The linter checks your diagram live for single points of failure, missing caches and queues, plaintext links, and more. Add a few components to see it work.</p>;
  if (!findings.length)
    return (
      <div className="px-1 pt-5">
        <p className="font-display text-[17px] font-semibold">No findings</p>
        <p className="mt-1 text-[13px] text-ink-soft">Nothing on the checklist is flagged. Try a 10x traffic simulation to find limits the linter can&rsquo;t see.</p>
      </div>
    );
  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity]++;
  return (
    <div className="pt-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex gap-3 text-[12px] text-ink-soft">
          {(["high", "medium", "low"] as const).map((s) =>
            counts[s] ? (
              <span key={s} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: SEV[s].color }} />
                {counts[s]} {SEV[s].label.toLowerCase()}
              </span>
            ) : null,
          )}
        </div>
        {fixable > 1 && (
          <button type="button" className="btn !h-8 !px-2.5 !text-[12px] text-indigo" onClick={() => runTool("review_architecture", { action: "fix_all" }, "ui")}>
            <Wand2 size={13} /> Fix all
          </button>
        )}
      </div>
      <ul className="mt-3 space-y-2">
        {findings.map((f) => (
          <FindingCard key={f.id} f={f} />
        ))}
      </ul>
    </div>
  );
}

// ── Simulate ─────────────────────────────────────────────────────────────

const PRESETS = [1, 5, 10, 20, 50];

function SimulateTab() {
  const sim = useStudio((s) => s.snap.sim);
  const graph = useStudio((s) => s.snap.graph);
  const chaos = useStudio((s) => s.chaos);
  const { engine, runTool, setChaos } = useStudio.getState();
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? id;

  if (!graph.nodes.length) return <p className="px-1 pt-5 text-[13px] text-ink-soft">Add a few components, then push traffic through them to see where the system bends.</p>;

  const failing = sim ? Object.entries(sim.result.nodes).filter(([, s]) => s.health === "failed" || (s.health === "down" && !s.failoverTo)) : [];
  const warnings = sim ? Object.entries(sim.result.nodes).filter(([, s]) => s.health === "warning" || (s.health === "down" && s.failoverTo)) : [];
  const killed = sim ? Object.keys(sim.settings.killed) : [];

  return (
    <div className="pt-2">
      <Label>Traffic</Label>
      <div className="grid grid-cols-5 gap-1">
        {PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => runTool("simulate", { action: "traffic", multiplier: m }, "ui")}
            className={`rounded-xl border py-2 text-[12.5px] font-semibold tabular-nums transition ${sim?.settings.multiplier === m ? "border-indigo/40 bg-indigo/10 text-indigo" : "border-ink/8 bg-white/45 text-ink-soft hover:text-ink"}`}
          >
            {m}×
          </button>
        ))}
      </div>

      {sim ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat label="Requests / sec" value={fmt(sim.result.totalRps)} />
            <Stat label="Error rate" value={`${Math.round(sim.result.errorRate * 100)}%`} tone={sim.result.errorRate > 0 ? "#F43F5E" : "#38BDF8"} />
          </div>

          {failing.length > 0 && (
            <>
              <Label>Failing</Label>
              <ul className="space-y-1.5">
                {failing.map(([id, s]) => (
                  <li key={id} className="rounded-xl border border-rose/20 bg-rose/5 px-3 py-2 text-[12px]">
                    <span className="font-semibold text-ink">{name(id)}</span> <span className="text-ink-soft">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {warnings.length > 0 && (
            <>
              <Label>Under strain</Label>
              <ul className="space-y-1.5">
                {warnings.slice(0, 6).map(([id, s]) => (
                  <li key={id} className="rounded-xl border border-amber/25 bg-amber/5 px-3 py-2 text-[12px]">
                    <span className="font-semibold text-ink">{name(id)}</span> <span className="text-ink-soft">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-primary justify-center" disabled={!failing.length && !warnings.length && !killed.length} onClick={() => runTool("simulate", { action: "fix" }, "ui")}>
              <Wand2 size={15} /> Fix it
            </button>
            <button type="button" className="btn btn-quiet justify-center" onClick={() => (setChaos(false), engine.stopSim())}>
              <Square size={13} /> Stop
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="btn btn-primary mt-3 w-full justify-center" onClick={() => runTool("simulate", { action: "traffic", multiplier: 10 }, "ui")}>
          <Play size={14} /> Simulate 10× traffic
        </button>
      )}

      <Label>Chaos</Label>
      <button
        type="button"
        onClick={() => setChaos(!chaos)}
        className={`flex w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition ${chaos ? "border-rose/40 bg-rose/8" : "border-ink/8 bg-white/45 hover:bg-white/70"}`}
      >
        <Skull size={16} className={chaos ? "text-rose" : "text-ink-soft"} />
        <span className="text-[12.5px]">
          <span className="block font-semibold text-ink">{chaos ? "Click a component to kill it" : "Chaos mode"}</span>
          <span className="text-ink-soft">{chaos ? "Replicated components lose one instance at a time." : "Take components down and watch failures spread."}</span>
        </span>
      </button>
      {killed.length > 0 && (
        <button type="button" className="btn mt-2 w-full justify-center" onClick={() => engine.revive(killed)}>
          <RotateCcw size={14} /> Restore {killed.length} killed component{killed.length > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-ink/8 bg-white/50 px-3 py-2.5">
      <div className="text-[11.5px] text-ink-soft">{label}</div>
      <div className="font-display text-[22px] font-semibold tabular-nums tracking-[-0.02em]" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}

// ── History ──────────────────────────────────────────────────────────────

function ActivityFeed() {
  const activity = useStudio((s) => s.activity);
  if (!activity.length) return null;
  return (
    <>
      <Label>Agent activity</Label>
      <ol className="space-y-1.5">
        {activity.slice(0, 12).map((a) => (
          <li key={a.id} className="rounded-xl border border-ink/8 bg-white/45 px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: a.ok ? "#5B6CFF" : "#F43F5E" }} />
              <code className="font-mono text-[11.5px] font-semibold text-ink">{a.tool}</code>
              <span className="ml-auto text-[10.5px] text-ink-faint">{a.source === "voice" ? "voice" : a.source === "command" ? "typed" : a.source}</span>
            </div>
            <div className="mt-0.5 break-all font-mono text-[10.5px] leading-snug text-ink-faint">{a.args.length > 140 ? `${a.args.slice(0, 140)}…` : a.args}</div>
            <div className={`mt-0.5 text-[11.5px] leading-snug ${a.ok ? "text-ink-soft" : "text-rose"}`}>{a.message}</div>
          </li>
        ))}
      </ol>
    </>
  );
}

function HistoryTab({ versions, onSaveVersion, onRestore }: { versions: VersionRecord[]; onSaveVersion(): void; onRestore(v: VersionRecord): void }) {
  const past = useStudio((s) => s.snap.past);
  const future = useStudio((s) => s.snap.future);
  const { engine } = useStudio.getState();
  const now = useNow();
  const rel = (t: number) => {
    const d = Math.round((now - t) / 60000);
    return d < 1 ? "just now" : d < 60 ? `${d} min ago` : new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };
  return (
    <div className="pt-2">
      <ActivityFeed />
      <div className="flex items-center justify-between">
        <Label>Versions</Label>
        <button type="button" className="btn !h-8 !px-2.5 !text-[12px] text-indigo" onClick={onSaveVersion}>
          <Bookmark size={13} /> Save version
        </button>
      </div>
      {versions.length === 0 && <p className="text-[12.5px] text-ink-faint">Versions are saved automatically every few edits and before any template load or clear.</p>}
      <ul className="space-y-1.5">
        {versions.map((v) => (
          <li key={v.id} className="group flex items-center gap-2 rounded-xl border border-ink/8 bg-white/45 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium text-ink">{v.label}</div>
              <div className="text-[11.5px] text-ink-faint">
                {rel(v.createdAt)}, {v.nodeCount} components
              </div>
            </div>
            <button type="button" className="btn !h-7 !px-2 !text-[11.5px] opacity-70 group-hover:opacity-100" onClick={() => onRestore(v)}>
              Restore
            </button>
          </li>
        ))}
      </ul>

      <Label>This session</Label>
      {past.length === 0 && future.length === 0 && <p className="text-[12.5px] text-ink-faint">Edits you make appear here. Say &ldquo;undo&rdquo; or press Ctrl Z to step back.</p>}
      <ol className="space-y-1">
        {future
          .slice()
          .reverse()
          .map((h, i) => (
            <li key={`f${i}`} className="rounded-lg px-2 py-1 text-[12px] text-ink-faint line-through decoration-ink/20">
              {h.label}
            </li>
          ))}
        {past
          .slice()
          .reverse()
          .map((h, i) => (
            <li key={`p${i}`}>
              <button type="button" onClick={() => engine.undo(i + 1)} className="w-full rounded-lg px-2 py-1 text-left text-[12px] text-ink-soft transition hover:bg-white/70 hover:text-ink" title="Undo back to before this edit">
                <span className="mr-1.5 text-[10.5px] text-ink-faint">{h.source}</span>
                {h.label}
              </button>
            </li>
          ))}
      </ol>
    </div>
  );
}
