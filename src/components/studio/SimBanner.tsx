"use client";

import { AnimatePresence, motion } from "motion/react";
import { Skull, Square, Wand2 } from "lucide-react";
import { fmt } from "@/domain/sim";
import { useStudio } from "@/store/studio";

export function SimBanner() {
  const sim = useStudio((s) => s.snap.sim);
  const chaos = useStudio((s) => s.chaos);
  const { engine, runTool, setChaos, setPanel } = useStudio.getState();
  const failing = sim ? Object.values(sim.result.nodes).filter((n) => n.health === "failed" || (n.health === "down" && !n.failoverTo)).length : 0;
  const err = sim ? Math.round(sim.result.errorRate * 100) : 0;

  return (
    <AnimatePresence>
      {sim && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="glass pointer-events-auto absolute left-1/2 top-4 z-30 flex h-12 -translate-x-1/2 items-center gap-3 rounded-2xl pl-4 pr-1.5"
        >
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ background: failing ? "#F43F5E" : "#38BDF8" }} />
            <span className="relative inline-flex size-2.5 rounded-full" style={{ background: failing ? "#F43F5E" : "#38BDF8" }} />
          </span>
          <button type="button" onClick={() => setPanel("simulate")} className="text-left text-[13px] font-medium text-ink">
            {sim.settings.multiplier}× traffic <span className="text-ink-soft">at {fmt(sim.result.totalRps)} rps,</span>{" "}
            <span style={{ color: err ? "#F43F5E" : "#0EA5E9" }}>{err}% errors</span>
          </button>
          {chaos && (
            <span className="flex items-center gap-1 rounded-lg bg-rose/10 px-2 py-1 text-[11.5px] font-semibold text-rose">
              <Skull size={12} /> Chaos: click to kill
            </span>
          )}
          {failing > 0 && (
            <button type="button" className="btn btn-primary !h-9" onClick={() => runTool("simulate", { action: "fix" }, "ui")}>
              <Wand2 size={14} /> Fix it
            </button>
          )}
          <button type="button" className="btn btn-icon !size-9" aria-label="Stop simulation" onClick={() => (setChaos(false), engine.stopSim())}>
            <Square size={13} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
