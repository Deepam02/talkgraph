"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ComponentKind } from "@/domain/catalog";
import { useStudio } from "@/store/studio";
import { CanvasView } from "../canvas/CanvasView";
import { CanvasActionsContext, type CanvasActions } from "../canvas/context";
import { EmptyState } from "./EmptyState";
import { ExportDialog } from "./ExportDialog";
import { Inspector } from "./Inspector";
import { Palette } from "./Palette";
import { SimBanner } from "./SimBanner";
import { Toasts } from "./Toasts";
import { TopBar } from "./TopBar";
import { usePersistence } from "./usePersistence";
import { useVoice } from "./useVoice";
import { VoiceDock } from "./VoiceDock";

function useNarrow() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(max-width: 767px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

function Shortcuts() {
  const { toggle } = useVoice();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStudio.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        window.dispatchEvent(new Event("tg:focus-command"));
        return;
      }
      if (isTyping(e)) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
        return;
      }
      if (mod) return;
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        toggle();
      } else if (e.key === "l" || e.key === "L") st.commit([{ type: "autoLayout", unpinAll: true }], "ui", "Tidied the layout");
      else if (e.key === "f" || e.key === "F") st.requestFit();
      else if ((e.key === "e" || e.key === "E") && st.snap.graph.nodes.length) st.setExport("terraform");
      else if (e.key === "\\") st.togglePanel();
      else if (e.key === "Escape") {
        st.select([], []);
        if (st.chaos) st.setChaos(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
  return null;
}

export function Studio() {
  const graph = useStudio((s) => s.snap.graph);
  const sim = useStudio((s) => s.snap.sim);
  const findings = useStudio((s) => s.snap.findings);
  const selection = useStudio((s) => s.selection);
  const pulses = useStudio((s) => s.pulses);
  const fitSignal = useStudio((s) => s.fitSignal);
  const chaos = useStudio((s) => s.chaos);
  const panelOpen = useStudio((s) => s.panelOpen);
  const narrow = useNarrow();
  const fitInsets = useMemo(
    () => (narrow ? { top: 80, left: 16, right: 16, bottom: 210 } : { top: 84, left: 276, right: panelOpen ? 346 : 40, bottom: 190 }),
    [panelOpen, narrow],
  );
  const persistence = usePersistence();
  const st = useStudio.getState();

  const actions: CanvasActions = useMemo(
    () => ({
      onKill: (id) => {
        const o = useStudio.getState().runTool("simulate", { action: "kill", target: id }, "ui");
        if (!o.ok) return;
      },
      onFindingClick: (id) => {
        useStudio.getState().select([id], []);
      },
      onKeepInference: (id) => useStudio.getState().engine.commit([{ type: "clearInference", id }], "ui", "Kept inferred choice", { layout: false, recordHistory: false }),
      onUndoInference: (edgeId) => useStudio.getState().commit([{ type: "removeEdges", ids: [edgeId] }], "ui", "Removed inferred connection"),
    }),
    [],
  );

  return (
    <ReactFlowProvider>
      <main className="relative h-dvh w-full overflow-hidden" style={{ background: "linear-gradient(135deg, #E9EDFF 0%, #EEEBFF 50%, #F3EBFF 100%)" }}>
        <CanvasActionsContext.Provider value={actions}>
          <CanvasView
            graph={graph}
            sim={sim?.result ?? null}
            findings={findings}
            chaos={chaos}
            selectedNodes={selection.nodes}
            selectedEdges={selection.edges}
            pulses={pulses}
            fitSignal={fitSignal}
            fitInsets={fitInsets}
            onConnect={(s, t) => st.connect(s, t)}
            validateConnection={(s, t) => useStudio.getState().canConnect(s, t)}
            onMoveEnd={(id, p) => st.moveNode(id, p)}
            onSelectionChange={(n, e) => useStudio.getState().select(n, e)}
            onDropKind={(kind: ComponentKind, pos) => st.addComponent(kind, pos)}
            onDeleteSelection={(n, e) => st.deleteSelection(n, e)}
          >
          </CanvasView>
        </CanvasActionsContext.Provider>

        <div className="pointer-events-none absolute inset-0">
          <EmptyState />
          <TopBar onNewDiagram={() => void persistence.newDiagram()} />
          <SimBanner />
          <Palette />
          <Inspector versions={persistence.versions} onSaveVersion={() => void persistence.saveVersion("Saved by you")} onRestore={persistence.restore} />
          <Toasts />
          <VoiceDock />
        </div>
        <ExportDialog />
        <Shortcuts />
      </main>
    </ReactFlowProvider>
  );
}
