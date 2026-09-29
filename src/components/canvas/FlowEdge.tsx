"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { LockOpen, Sparkles, Undo2 } from "lucide-react";
import { memo, useContext, useState } from "react";
import { EDGE_KIND_META, type EdgeKind } from "@/domain/graph";
import { fmt } from "@/domain/sim";
import { CanvasActionsContext } from "./context";
import { HEALTH_COLOR, type ArchFlowEdge } from "./types";

export const EDGE_STYLE: Record<EdgeKind, { color: string; width: number; dash?: string; cap?: "round" }> = {
  sync: { color: "#5B6CFF", width: 2 },
  async: { color: "#F59E0B", width: 2, dash: "7 6" },
  replication: { color: "#8B5CF6", width: 2.2, dash: "0.1 6", cap: "round" },
  cache: { color: "#FB7185", width: 1.25 },
};

function packetCount(rps: number) {
  if (rps <= 0) return 0;
  return Math.max(1, Math.min(5, Math.round(Math.log10(rps + 1) * 1.4)));
}

function FlowEdgeView(props: EdgeProps<ArchFlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props;
  const actions = useContext(CanvasActionsContext);
  const [hover, setHover] = useState(false);
  if (!data) return null;
  const { edge, sim, simActive, severity } = data;
  const style = EDGE_STYLE[edge.kind];
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.32 });

  const health = simActive ? sim?.health : undefined;
  const flowing = simActive && sim && sim.rps > 0;
  const stroke = health === "failed" || health === "down" ? HEALTH_COLOR.failed : style.color;
  const n = flowing ? packetCount(sim!.rps) : 0;
  const dur = flowing ? Math.max(0.9, 3.2 - Math.log10(sim!.rps + 1) * 0.55) : 0;
  const packetColor = health ? HEALTH_COLOR[health] : "#38BDF8";
  const maskId = `tg-mask-${id}`;
  const warn = !edge.encrypted;

  return (
    <>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-100000} y={-100000} width={200000} height={200000}>
          <path d={path} pathLength={1} fill="none" stroke="#fff" strokeWidth={18} className="tg-draw" />
        </mask>
      </defs>

      {(severity === "high" || health === "failed" || health === "down") && (
        <path d={path} fill="none" stroke="#F43F5E" strokeOpacity={0.16} strokeWidth={10} strokeLinecap="round" mask={`url(#${maskId})`} />
      )}
      {selected && <path d={path} fill="none" stroke="#5B6CFF" strokeOpacity={0.14} strokeWidth={10} strokeLinecap="round" />}

      <g mask={`url(#${maskId})`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <BaseEdge
          id={id}
          path={path}
          className="tg-edge-main"
          markerEnd={`url(#tg-arrow-${health === "failed" || health === "down" ? "failed" : edge.kind})`}
          interactionWidth={22}
          style={{
            stroke,
            strokeWidth: style.width + (selected ? 0.6 : 0),
            strokeDasharray: style.dash,
            strokeLinecap: style.cap ?? "butt",
            animation: edge.kind === "async" ? "tg-march 1.1s linear infinite" : undefined,
            opacity: simActive && !flowing && edge.kind !== "replication" ? 0.45 : 1,
            transition: "stroke 300ms, opacity 300ms",
          }}
        />
      </g>

      {Array.from({ length: n }).map((_, i) => (
        <circle key={`${i}-${n}`} r={edge.kind === "cache" ? 2.4 : 3.4} fill={packetColor} style={{ filter: `drop-shadow(0 0 5px ${packetColor})` }}>
          <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${(-i * dur) / n}s`} path={path} rotate="auto" />
        </circle>
      ))}

      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute flex items-center gap-1"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {(hover || selected || warn || simActive || (edge.inferred && actions.onKeepInference)) && edge.kind !== "replication" && (
            <span
              className="flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[10px] font-semibold tabular-nums shadow-sm backdrop-blur"
              style={{
                background: warn ? "rgba(255,238,242,0.92)" : "rgba(250,249,255,0.9)",
                borderColor: warn ? "rgba(244,63,94,0.35)" : "rgba(30,35,64,0.08)",
                color: warn ? "#E11D48" : "#4A5078",
              }}
              title={`${EDGE_KIND_META[edge.kind].label} over ${edge.protocol}${warn ? " (plaintext)" : " (TLS)"}`}
            >
              {warn && <LockOpen size={10} />}
              {flowing ? `${fmt(sim!.rps)}/s` : edge.protocol}
            </span>
          )}
          {edge.inferred && !simActive && actions.onKeepInference && (
            <span className="group relative flex items-center">
              <button
                type="button"
                aria-label={`Inferred connection: ${edge.inferred.reason}`}
                className="grid size-[18px] place-items-center rounded-full border border-violet/25 bg-[#F6F1FF] text-violet shadow-sm transition hover:scale-110"
                onClick={() => actions.onKeepInference?.(edge.id)}
              >
                <Sparkles size={10} />
              </button>
              <span className="pointer-events-none absolute left-1/2 top-6 z-10 w-56 -translate-x-1/2 rounded-xl border border-white/80 bg-[#FAF9FF]/95 p-2.5 text-[11px] leading-snug text-ink-soft opacity-0 shadow-lg transition group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
                <span className="mb-1.5 block font-semibold text-ink">Inferred</span>
                {edge.inferred.reason}
                <span className="mt-2 flex gap-1.5">
                  <button type="button" className="chip !py-0.5" onClick={() => actions.onUndoInference?.(edge.id)}>
                    <Undo2 size={11} /> Undo
                  </button>
                  <button type="button" className="chip !py-0.5" onClick={() => actions.onKeepInference?.(edge.id)}>
                    Keep
                  </button>
                </span>
              </span>
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const FlowEdgeComponent = memo(FlowEdgeView);

/** Arrow markers, one per link style, rendered once per canvas. */
export function EdgeMarkers() {
  const kinds: [string, string][] = [
    ...(Object.entries(EDGE_STYLE).map(([k, v]) => [k, v.color]) as [string, string][]),
    ["failed", "#F43F5E"],
  ];
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        {kinds.map(([k, color]) => (
          <marker key={k} id={`tg-arrow-${k}`} viewBox="0 0 12 12" refX="10" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
            <path d="M2 2.2 L10 6 L2 9.8 Q3.6 6 2 2.2 Z" fill={color} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}
