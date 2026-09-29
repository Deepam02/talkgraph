"use client";

import Link from "next/link";
import { Check, ChevronDown, CloudOff, FileCode2, FilePlus2, Gauge, Link2, LayoutTemplate, PanelRight, Redo2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { buildTemplate, TEMPLATES, type TemplateId } from "@/domain/templates";
import { useStudio } from "@/store/studio";
import { LogoMark } from "../Logo";
import { shareUrl } from "./usePersistence";

export function TopBar({ onNewDiagram }: { onNewDiagram(): void }) {
  const title = useStudio((s) => s.snap.title);
  const canUndo = useStudio((s) => s.snap.past.length > 0);
  const canRedo = useStudio((s) => s.snap.future.length > 0);
  const saveState = useStudio((s) => s.saveState);
  const nodeCount = useStudio((s) => s.snap.graph.nodes.length);
  const { engine, undo, redo, setExport, pushToast, togglePanel, requestFit } = useStudio.getState();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  const loadTemplate = (id: TemplateId) => {
    setMenu(false);
    engine.replace(buildTemplate(id), `Loaded ${TEMPLATES[id].name}`, "ui", TEMPLATES[id].name);
    requestFit();
  };

  const share = async () => {
    const s = engine.get();
    const url = shareUrl(s.graph, s.title);
    try {
      await navigator.clipboard.writeText(url);
      pushToast({ kind: "info", source: "ui", title: "Share link copied", detail: "Anyone with the link opens a copy of this diagram." });
    } catch {
      pushToast({ kind: "info", source: "ui", title: "Copy this link", detail: url });
    }
  };

  return (
    <>
      <div className="glass pointer-events-auto absolute left-4 top-4 z-30 flex h-12 items-center gap-2 rounded-2xl pl-2.5 pr-3">
        <Link href="/" aria-label="Home" className="rounded-lg">
          <LogoMark size={28} />
        </Link>
        <input
          key={title}
          aria-label="Diagram name"
          defaultValue={title}
          onBlur={(e) => e.target.value !== title && engine.setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="w-[13rem] max-md:w-[7.5rem] max-sm:w-[6.5rem] truncate rounded-lg bg-transparent px-1.5 py-1 font-display text-[15px] font-semibold tracking-[-0.01em] text-ink outline-none transition hover:bg-white/50 focus:bg-white/70"
        />
        <span className="flex items-center gap-1 text-[11.5px] text-ink-faint max-sm:hidden" aria-live="polite">
          {saveState === "error" ? (
            <>
              <CloudOff size={13} /> Not saved
            </>
          ) : saveState === "saving" ? (
            "Saving"
          ) : saveState === "saved" ? (
            <>
              <Check size={13} /> Saved
            </>
          ) : null}
        </span>
      </div>

      <div className="glass pointer-events-auto absolute right-4 top-4 z-30 flex h-12 items-center gap-0.5 rounded-2xl px-1.5">
        <button type="button" className="btn btn-icon" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
          <Undo2 size={17} />
        </button>
        <button type="button" className="btn btn-icon" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
          <Redo2 size={17} />
        </button>
        <span className="mx-1 h-5 w-px bg-ink/10 max-sm:hidden" />
        <div className="relative max-sm:hidden" ref={menuRef}>
          <button type="button" className="btn" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
            <LayoutTemplate size={16} /> <span className="max-lg:hidden">Templates</span> <ChevronDown size={14} className="text-ink-faint max-lg:hidden" />
          </button>
          {menu && (
            <div className="glass-strong absolute right-0 top-11 w-72 rounded-2xl p-1.5">
              {Object.values(TEMPLATES).map((t) => (
                <button key={t.id} type="button" onClick={() => loadTemplate(t.id)} className="w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-indigo/8">
                  <div className="text-[13px] font-semibold text-ink">{t.name}</div>
                  <div className="text-[12px] text-ink-soft">{t.description}</div>
                </button>
              ))}
              <div className="my-1 h-px bg-ink/8" />
              <button type="button" onClick={() => (setMenu(false), onNewDiagram())} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-ink transition hover:bg-indigo/8">
                <FilePlus2 size={15} /> New blank diagram
              </button>
            </div>
          )}
        </div>
        <button type="button" className="btn max-sm:hidden" onClick={share} disabled={!nodeCount}>
          <Link2 size={16} /> <span className="max-lg:hidden">Share</span>
        </button>
        <Link href="/bench" className="btn max-sm:hidden" title="Voice command benchmark">
          <Gauge size={16} /> <span className="max-lg:hidden">Benchmark</span>
        </Link>
        <button type="button" className="btn btn-primary ml-1" onClick={() => setExport("terraform")} disabled={!nodeCount}>
          <FileCode2 size={16} /> <span className="max-md:hidden">Export</span>
        </button>
        <button type="button" className="btn btn-icon max-md:hidden" onClick={togglePanel} aria-label="Toggle side panel" title="Toggle panel (\\)">
          <PanelRight size={17} />
        </button>
      </div>
    </>
  );
}
