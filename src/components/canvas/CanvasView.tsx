"use client";

import {
  Background,
  BackgroundVariant,
  ReactFlow,
  useNodesInitialized,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type IsValidConnection,

  type NodeChange,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { ComponentKind } from "@/domain/catalog";
import type { Graph } from "@/domain/graph";
import type { Finding, Severity } from "@/domain/lint";
import type { SimResult } from "@/domain/sim";
import { NODE_H, NODE_W } from "@/domain/layout";
import { ArchNodeComponent } from "./ArchNode";
import { EdgeMarkers, FlowEdgeComponent } from "./FlowEdge";
import type { ArchFlowEdge, ArchFlowNode } from "./types";

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const nodeTypes = { arch: ArchNodeComponent };
const edgeTypes = { flow: FlowEdgeComponent };
const SEV_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const TWEEN_MS = 560;

export interface CanvasViewProps {
  graph: Graph;
  sim: SimResult | null;
  findings: Finding[];
  interactive?: boolean;
  chaos?: boolean;
  selectedNodes?: string[];
  selectedEdges?: string[];
  pulses?: Record<string, number>;
  fitSignal?: number;
  /** Screen-space insets kept clear of floating panels when fitting. */
  fitInsets?: Insets;
  maxFitZoom?: number;
  onConnect?(source: string, target: string): void;
  validateConnection?(source: string, target: string): boolean;
  onMoveEnd?(id: string, pos: XYPosition): void;
  onSelectionChange?(nodes: string[], edges: string[]): void;
  onDropKind?(kind: ComponentKind, pos: XYPosition): void;
  onDeleteSelection?(nodes: string[], edges: string[]): void;
  children?: ReactNode;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function CanvasView(props: CanvasViewProps) {
  const { graph, sim, findings, interactive = true, chaos = false } = props;
  const rf = useReactFlow();
  const shown = useRef(new Map<string, XYPosition>());
  const dragging = useRef(new Set<string>());
  const [positions, setPositions] = useState<Map<string, XYPosition>>(() => new Map(graph.nodes.map((n) => [n.id, n.position])));
  const raf = useRef<number | null>(null);

  // Tween displayed positions toward the graph's positions. New nodes grow out of their upstream.
  useEffect(() => {
    const from = new Map<string, XYPosition>();
    const to = new Map<string, XYPosition>();
    for (const n of graph.nodes) {
      to.set(n.id, n.position);
      let start = shown.current.get(n.id);
      if (!start) {
        const up = graph.edges.find((e) => e.target === n.id && shown.current.has(e.source));
        start = up ? shown.current.get(up.source)! : n.position;
      }
      if (dragging.current.has(n.id)) start = n.position;
      from.set(n.id, start);
    }
    const t0 = performance.now();
    if (raf.current) cancelAnimationFrame(raf.current);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / TWEEN_MS);
      const k = ease(t);
      const next = new Map<string, XYPosition>();
      for (const [id, a] of from) {
        const b = to.get(id)!;
        const p = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
        next.set(id, p);
      }
      shown.current = next;
      setPositions(next);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [graph]);

  const findingsByNode = useMemo(() => {
    const m = new Map<string, Finding[]>();
    for (const f of findings) for (const id of f.nodeIds.slice(0, 1)) m.set(id, [...(m.get(id) ?? []), f]);
    return m;
  }, [findings]);

  const edgeSeverity = useMemo(() => {
    const m = new Map<string, Severity>();
    for (const f of findings)
      for (const id of f.edgeIds) {
        const cur = m.get(id);
        if (!cur || SEV_RANK[f.severity] < SEV_RANK[cur]) m.set(id, f.severity);
      }
    return m;
  }, [findings]);

  const selectedNodes = useMemo(() => new Set(props.selectedNodes ?? []), [props.selectedNodes]);
  const selectedEdges = useMemo(() => new Set(props.selectedEdges ?? []), [props.selectedEdges]);

  const nodes: ArchFlowNode[] = useMemo(
    () =>
      graph.nodes.map((n) => {
        const fs = findingsByNode.get(n.id) ?? [];
        const severity = fs.reduce<Severity | undefined>((acc, f) => (!acc || SEV_RANK[f.severity] < SEV_RANK[acc] ? f.severity : acc), undefined);
        return {
          id: n.id,
          type: "arch" as const,
          position: positions.get(n.id) ?? n.position,
          data: { node: n, sim: sim?.nodes[n.id], simActive: Boolean(sim), severity, findings: fs, pulse: props.pulses?.[n.id], chaos },
          selected: selectedNodes.has(n.id),
          draggable: interactive,
          connectable: interactive,
        };
      }),
    [graph.nodes, positions, sim, findingsByNode, props.pulses, chaos, selectedNodes, interactive],
  );

  const edges: ArchFlowEdge[] = useMemo(
    () =>
      graph.edges.map((e) => {
        const replication = e.kind === "replication";
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: replication ? "b" : "r",
          targetHandle: replication ? "t" : "l",
          type: "flow" as const,
          selected: selectedEdges.has(e.id),
          data: { edge: e, sim: sim?.edges[e.id], simActive: Boolean(sim), severity: edgeSeverity.get(e.id), replication },
        };
      }),
    [graph.edges, sim, edgeSeverity, selectedEdges],
  );

  // Fit to where nodes are going (not where the tween currently has them), keeping
  // floating panels clear. Runs on request and whenever components come or go.
  const wrapRef = useRef<HTMLDivElement>(null);
  const nodeKey = graph.nodes.map((n) => n.id).join(",");
  const measured = useNodesInitialized();
  useEffect(() => {
    const el = wrapRef.current;
    if (!graph.nodes.length || !el || dragging.current.size) return;
    const fit = () => {
      const ins = props.fitInsets ?? { top: 40, right: 40, bottom: 40, left: 40 };
      const W = el.clientWidth;
      const H = el.clientHeight;
      const xs = graph.nodes.map((n) => n.position.x);
      const ys = graph.nodes.map((n) => n.position.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const bw = Math.max(...xs) - minX + NODE_W;
      const bh = Math.max(...ys) - minY + NODE_H + (sim ? 30 : 0);
      const availW = Math.max(200, W - ins.left - ins.right);
      const availH = Math.max(160, H - ins.top - ins.bottom);
      const zoom = Math.min(availW / (bw + 80), availH / (bh + 60), props.maxFitZoom ?? 1.1);
      const x = ins.left + (availW - bw * zoom) / 2 - minX * zoom;
      const y = ins.top + (availH - bh * zoom) / 2 - minY * zoom;
      void rf.setViewport({ x, y, zoom }, { duration: 650 });
    };
    // Once right away, and once more after the layout tween settles (the first pass can
    // land before React Flow has initialized its viewport).
    const a = setTimeout(fit, 60);
    const b = setTimeout(fit, TWEEN_MS + 120);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [props.fitSignal, nodeKey, measured, rf]); // eslint-disable-line react-hooks/exhaustive-deps

  const onNodesChange = useCallback(
    (changes: NodeChange<ArchFlowNode>[]) => {
      let moved = false;
      const next = new Map(shown.current);
      for (const c of changes) {
        if (c.type === "position" && c.position) {
          next.set(c.id, c.position);
          moved = true;
          if (c.dragging) dragging.current.add(c.id);
          else if (dragging.current.has(c.id)) {
            dragging.current.delete(c.id);
            props.onMoveEnd?.(c.id, c.position);
          }
        }
      }
      if (moved) {
        shown.current = next;
        setPositions(next);
      }
      const sel = changes.filter((c) => c.type === "select");
      if (sel.length) {
        const set = new Set(selectedNodes);
        for (const c of sel) {
          if (c.type !== "select") continue;
          if (c.selected) set.add(c.id);
          else set.delete(c.id);
        }
        props.onSelectionChange?.([...set], [...selectedEdges]);
      }
    },
    [props, selectedNodes, selectedEdges],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<ArchFlowEdge>[]) => {
      const sel = changes.filter((c) => c.type === "select");
      if (sel.length) {
        const set = new Set(selectedEdges);
        for (const c of sel) {
          if (c.type !== "select") continue;
          if (c.selected) set.add(c.id);
          else set.delete(c.id);
        }
        props.onSelectionChange?.([...selectedNodes], [...set]);
      }
    },
    [props, selectedNodes, selectedEdges],
  );

  const isValidConnection: IsValidConnection = useCallback(
    (c) => (c.source && c.target ? (props.validateConnection?.(c.source, c.target) ?? true) : false),
    [props],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      const kind = e.dataTransfer.getData("application/talkgraph-kind") as ComponentKind;
      if (!kind) return;
      e.preventDefault();
      const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      props.onDropKind?.(kind, { x: p.x - 104, y: p.y - 38 });
    },
    [props, rf],
  );

  return (
    <div ref={wrapRef} className="absolute inset-0" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <EdgeMarkers />
      <ReactFlow<ArchFlowNode, ArchFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={(c: Connection) => c.source && c.target && props.onConnect?.(c.source, c.target)}
        isValidConnection={isValidConnection}
        onDelete={({ nodes: ns, edges: es }) => props.onDeleteSelection?.(ns.map((n) => n.id), es.map((e) => e.id))}
        nodesDraggable={interactive}
        nodesConnectable={interactive}
        elementsSelectable={interactive}
        panOnDrag={interactive}
        zoomOnScroll={interactive}
        zoomOnPinch={interactive}
        zoomOnDoubleClick={false}
        preventScrolling={interactive}
        deleteKeyCode={interactive ? ["Delete", "Backspace"] : null}
        minZoom={0.2}
        maxZoom={2}
        attributionPosition={interactive ? "bottom-center" : "bottom-right"}
        connectionRadius={28}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.1} color="rgba(30,35,64,0.12)" />
        {props.children}
      </ReactFlow>
    </div>
  );
}
