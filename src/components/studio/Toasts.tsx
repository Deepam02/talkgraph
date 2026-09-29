"use client";

import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, Info, Keyboard, Mic, MousePointer2, Undo2, Wand2, X } from "lucide-react";
import { useStudio, type Toast } from "@/store/studio";

function SourceIcon({ t }: { t: Toast }) {
  if (t.kind === "error") return <AlertTriangle size={15} className="text-rose" />;
  if (t.kind === "confirm") return <AlertTriangle size={15} className="text-amber" />;
  if (t.kind === "info") return <Info size={15} className="text-indigo" />;
  switch (t.source) {
    case "voice":
      return <Mic size={15} className="text-violet" />;
    case "command":
      return <Keyboard size={15} className="text-indigo" />;
    case "fix":
      return <Wand2 size={15} className="text-indigo" />;
    case "ui":
      return <MousePointer2 size={15} className="text-indigo" />;
    default:
      return <Check size={15} className="text-sky" />;
  }
}

/** A toast after every edit, with one-tap undo; rejections carry their suggested fix. */
export function Toasts() {
  const toasts = useStudio((s) => s.toasts);
  const { dismissToast, undo, applySuggestion } = useStudio.getState();
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[5.25rem] z-40 flex flex-col items-center gap-2 px-4" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.16 } }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="glass-strong pointer-events-auto flex max-w-[560px] items-start gap-2.5 rounded-2xl py-2.5 pl-3 pr-2"
            style={t.kind === "error" ? { borderColor: "rgba(244,63,94,0.3)" } : undefined}
            role={t.kind === "error" ? "alert" : "status"}
          >
            <span className="mt-0.5">
              <SourceIcon t={t} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-snug text-ink">{t.title}</p>
              {t.detail && <p className="mt-0.5 break-words text-[12px] leading-snug text-ink-soft">{t.detail}</p>}
              {t.suggestion && (
                <button
                  type="button"
                  className="btn btn-quiet mt-2 !h-8 !text-[12px] text-indigo"
                  onClick={() => {
                    applySuggestion(t.suggestion!);
                    dismissToast(t.id);
                  }}
                >
                  <Wand2 size={13} /> {t.suggestion.label}
                </button>
              )}
              {t.confirm && (
                <button
                  type="button"
                  className="btn btn-primary mt-2 !h-8 !text-[12px]"
                  onClick={() => {
                    t.confirm!.run();
                    dismissToast(t.id);
                  }}
                >
                  {t.confirm.label}
                </button>
              )}
            </div>
            {t.undoable && (
              <button
                type="button"
                className="btn !h-7 !px-2 !text-[12px] text-indigo"
                onClick={() => {
                  undo();
                  dismissToast(t.id);
                }}
              >
                <Undo2 size={13} /> Undo
              </button>
            )}
            <button type="button" aria-label="Dismiss" className="grid size-7 place-items-center rounded-lg text-ink-faint transition hover:bg-white/70 hover:text-ink" onClick={() => dismissToast(t.id)}>
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
