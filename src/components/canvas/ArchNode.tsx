"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion, useReducedMotion } from "motion/react";
import { Skull, Sparkles } from "lucide-react";
import { memo, useContext } from "react";
import { CATEGORY_META, spec } from "@/domain/catalog";
import { NODE_W } from "@/domain/layout";
import { fmt } from "@/domain/sim";
import { ComponentIcon } from "../ComponentIcon";
import { CanvasActionsContext } from "./context";
import { HEALTH_COLOR, type ArchFlowNode } from "./types";

const SEVERITY_COLOR = { high: "#F43F5E", medium: "#F59E0B", low: "#8A8FB3" } as const;

function glowFor(health: string | undefined, selected: boolean): string {
  const parts: string[] = [];
  if (selected) parts.push("0 0 0 2px #5B6CFF", "0 0 0 6px rgba(91,108,255,0.16)");
  switch (health) {
    case "healthy":
      parts.push("0 0 0 1.5px rgba(56,189,248,0.6)", "0 0 28px -4px rgba(56,189,248,0.55)");
      break;
    case "warning":
      parts.push("0 0 0 1.5px rgba(245,158,11,0.7)", "0 0 30px -4px rgba(245,158,11,0.55)");
      break;
    case "failed":
    case "down":
      parts.push("0 0 0 1.5px rgba(244,63,94,0.8)", "0 0 34px -2px rgba(244,63,94,0.6)");
      break;
  }
  parts.push("0 14px 30px -16px rgba(46,52,120,0.45)", "0 2px 6px -2px rgba(46,52,120,0.12)");
  return parts.join(", ");
}

function ArchNodeView({ data, selected }: NodeProps<ArchFlowNode>) {
  const { node, sim, simActive, severity, chaos } = data;
  const s = spec(node.kind);
  const cat = CATEGORY_META[s.category];
  const reduce = useReducedMotion();
  const actions = useContext(CanvasActionsContext);
  const health = simActive ? sim?.health : undefined;
  const down = health === "down";
  const util = sim ? Math.min(1, Number.isFinite(sim.utilization) ? sim.utilization : 1) : 0;
  const stack = Math.min(node.replicas - 1, 2);

  return (
    <div className="relative" style={{ width: NODE_W }} title={simActive && sim ? sim.reason : `${node.name}: ${s.label}. ${s.blurb}`}>
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="target" position={Position.Top} id="t" style={{ left: "50%" }} />

      {Array.from({ length: stack }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          className="absolute inset-0 rounded-[18px] border border-white/70"
          style={{
            transform: `translate(${(i + 1) * 5}px, ${(i + 1) * 5}px)`,
            background: `linear-gradient(135deg, rgba(252,251,255,0.8), ${cat.tint})`,
            boxShadow: "0 8px 18px -12px rgba(46,52,120,0.4)",
            zIndex: -1 - i,
          }}
        />
      ))}

      <motion.div
        initial={reduce ? false : { scale: 0.55, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: down ? 0.78 : 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 24, mass: 0.8 }}
        className="relative overflow-hidden rounded-[18px] border"
        style={{
          borderColor: down ? "rgba(244,63,94,0.55)" : "rgba(255,255,255,0.85)",
          borderStyle: down ? "dashed" : "solid",
          background: down
            ? "linear-gradient(135deg, rgba(255,241,244,0.95), rgba(252,232,238,0.9))"
            : `linear-gradient(140deg, rgba(253,252,255,0.95) 0%, rgba(249,248,255,0.9) 55%, ${cat.tint} 140%)`,
          boxShadow: glowFor(health, selected),
          cursor: chaos ? "crosshair" : undefined,
          transition: "box-shadow 380ms var(--ease-out), background 380ms",
        }}
        onClick={chaos ? () => actions.onKill?.(node.id) : undefined}
      >
        {!reduce && (
          <span
            key={data.pulse ?? "spawn"}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[18px]"
            style={{ boxShadow: `0 0 0 2px ${cat.color}`, animation: "tg-ripple 900ms var(--ease-out) forwards" }}
          />
        )}
        {health === "failed" && <span aria-hidden className="tg-breathe pointer-events-none absolute inset-0 rounded-[18px] bg-rose/10" />}

        <div className="flex items-center gap-3 px-3 py-3">
          <div
            className="grid size-11 shrink-0 place-items-center rounded-[13px]"
            style={{
              background: `linear-gradient(145deg, ${cat.tint}, #fdfcff)`,
              boxShadow: `inset 0 0 0 1px ${cat.color}33, 0 6px 14px -8px ${cat.color}`,
              color: down ? "#8A8FB3" : cat.color,
            }}
          >
            {down ? <Skull size={20} strokeWidth={1.8} /> : <ComponentIcon kind={node.kind} size={21} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold leading-tight tracking-[-0.01em] text-ink">{node.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-soft">
              <span className="truncate">{s.label}</span>
              {node.replicas > 1 && (
                <span className="rounded-md px-1 text-[10.5px] font-semibold" style={{ background: `${cat.color}1f`, color: cat.color }}>
                  ×{node.replicas}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 self-start">
            {severity && (
              <button
                type="button"
                aria-label={`${data.findings.length} finding${data.findings.length > 1 ? "s" : ""}`}
                title={data.findings.map((f) => f.title).join("\n")}
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onFindingClick?.(node.id);
                }}
                className="size-2.5 rounded-full"
                style={{ background: SEVERITY_COLOR[severity], boxShadow: `0 0 0 3px ${SEVERITY_COLOR[severity]}26` }}
              />
            )}
            {node.inferred && actions.onKeepInference && (
              <button
                type="button"
                title={`Inferred: ${node.inferred.reason} Click to keep.`}
                aria-label="Inferred name, click to keep"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onKeepInference?.(node.id);
                }}
                className="text-violet/70 transition-colors hover:text-violet"
              >
                <Sparkles size={12} />
              </button>
            )}
          </div>
        </div>

        {simActive && sim && (
          <div className="px-3 pb-2.5">
            <div className="mb-1 flex justify-between text-[10.5px] font-medium tabular-nums text-ink-soft">
              <span>{down ? (sim.failoverTo ? "failed over" : "down") : `${fmt(sim.load)} rps`}</span>
              <span style={{ color: HEALTH_COLOR[sim.health] }}>
                {down ? "offline" : Number.isFinite(sim.capacity) ? `${Math.round(Math.min(sim.utilization, 9.99) * 100)}%` : "source"}
              </span>
            </div>
            <div className="h-[3px] overflow-hidden rounded-full bg-ink/8">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${down ? 100 : Math.max(4, util * 100)}%`,
                  background: HEALTH_COLOR[sim.health],
                  transition: "width 600ms var(--ease-out), background 300ms",
                }}
              />
            </div>
          </div>
        )}
      </motion.div>

      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="source" position={Position.Bottom} id="b" style={{ left: "50%" }} />
    </div>
  );
}

export const ArchNodeComponent = memo(ArchNodeView);
