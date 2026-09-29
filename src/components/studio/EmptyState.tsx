"use client";

import { motion } from "motion/react";
import { buildTemplate, TEMPLATES, type TemplateId } from "@/domain/templates";
import { useStudio } from "@/store/studio";

export function EmptyState() {
  const empty = useStudio((s) => s.snap.graph.nodes.length === 0);
  const { engine, requestFit } = useStudio.getState();
  if (!empty) return null;
  const load = (id: TemplateId) => {
    engine.replace(buildTemplate(id), `Loaded ${TEMPLATES[id].name}`, "ui", TEMPLATES[id].name);
    requestFit();
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-6 pb-40"
    >
      <div className="pointer-events-auto max-w-[520px] text-center">
        <h1 className="font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">Describe your system out loud.</h1>
        <p className="mx-auto mt-3 max-w-[420px] text-[14.5px] leading-relaxed text-ink-soft">
          Press the mic or Space and talk like you would at a whiteboard. Everything also works by dragging from the library or typing below.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2 text-left">
          {Object.values(TEMPLATES).map((t) => (
            <button key={t.id} type="button" onClick={() => load(t.id)} className="glass rounded-2xl px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="text-[13px] font-semibold text-ink">{t.name}</div>
              <div className="mt-0.5 text-[12px] leading-snug text-ink-soft">{t.description}</div>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
