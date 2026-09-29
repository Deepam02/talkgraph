"use client";

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { useCallback, useEffect, useRef, useState } from "react";
import { PRODUCT } from "@/config/product";
import type { Graph } from "@/domain/graph";
import { LocalRepository } from "@/storage/local";
import { RemoteRepository } from "@/storage/remote";
import { graphSchema, newId, type DiagramRepository, type VersionRecord } from "@/storage/types";
import { useStudio } from "@/store/studio";

const CURRENT_KEY = `${PRODUCT.slug}:current`;
const AUTO_VERSION_EVERY = 8;

export function shareUrl(graph: Graph, title: string): string {
  const payload = compressToEncodedURIComponent(JSON.stringify({ t: title, g: graph }));
  return `${location.origin}/app#share=${payload}`;
}

function readShare(): { title: string; graph: Graph } | null {
  const m = location.hash.match(/share=([^&]+)/);
  if (!m) return null;
  try {
    const raw = JSON.parse(decompressFromEncodedURIComponent(m[1]) ?? "null") as { t?: string; g?: unknown };
    const parsed = graphSchema.safeParse(raw?.g);
    return parsed.success ? { title: raw.t ?? "Shared system", graph: parsed.data as Graph } : null;
  } catch {
    return null;
  }
}

/** Load on mount, autosave on change, and keep a version history. */
export function usePersistence() {
  const engine = useStudio((s) => s.engine);
  const setSaveState = useStudio((s) => s.setSaveState);
  const repoRef = useRef<DiagramRepository>(new LocalRepository());
  const idRef = useRef<string>("");
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [ready, setReady] = useState(false);
  const commitsSinceVersion = useRef(0);

  const refreshVersions = useCallback(async () => {
    if (!idRef.current) return;
    try {
      setVersions(await repoRef.current.listVersions(idRef.current));
    } catch {
      /* offline */
    }
  }, []);

  const saveVersion = useCallback(
    async (label: string) => {
      const s = engine.get();
      if (!idRef.current || !s.graph.nodes.length) return;
      const v: VersionRecord = {
        id: newId("v"),
        diagramId: idRef.current,
        label,
        title: s.title,
        createdAt: Date.now(),
        nodeCount: s.graph.nodes.length,
        graph: s.graph,
      };
      try {
        await repoRef.current.addVersion(v);
        commitsSinceVersion.current = 0;
        await refreshVersions();
      } catch {
        setSaveState("error");
      }
    },
    [engine, refreshVersions, setSaveState],
  );

  // Initial load: share link > last opened diagram > empty canvas.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const health = await fetch("/api/health", { cache: "no-store" }).then((r) => r.json());
        useStudio.getState().setVoice({ configured: Boolean(health.voice) });
        if (health.storage === "remote") repoRef.current = new RemoteRepository();
      } catch {
        useStudio.getState().setVoice({ configured: false });
      }
      // StrictMode runs this effect twice in dev: only the surviving run may claim an id.
      if (cancelled) return;
      const shared = readShare();
      if (shared) {
        idRef.current = newId("d");
        engine.load(shared.graph, shared.title);
        history.replaceState(null, "", "/app");
        useStudio.getState().pushToast({ kind: "info", source: "system", title: `Opened shared diagram "${shared.title}"` });
      } else {
        const current = (() => {
          try {
            return localStorage.getItem(CURRENT_KEY);
          } catch {
            return null;
          }
        })();
        const rec = current ? await repoRef.current.get(current).catch(() => null) : null;
        if (cancelled) return;
        if (rec) {
          idRef.current = rec.id;
          engine.load(rec.graph, rec.title);
        } else {
          idRef.current = newId("d");
        }
      }
      try {
        localStorage.setItem(CURRENT_KEY, idRef.current);
      } catch {
        /* private mode */
      }
      if (!cancelled) {
        setReady(true);
        useStudio.getState().requestFit();
        void refreshVersions();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engine, refreshVersions]);

  // Autosave (debounced) + automatic versions every few edits and before big replacements.
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastGraph = engine.get().graph;
    let lastTitle = engine.get().title;
    let lastSeq = engine.get().lastCommit?.seq ?? 0;
    const unsub = engine.subscribe((s) => {
      if (s.lastCommit && s.lastCommit.seq !== lastSeq) {
        lastSeq = s.lastCommit.seq;
        commitsSinceVersion.current++;
        const replaced = s.lastCommit.changes.some((c) => c.type === "replaced") && s.lastCommit.before.nodes.length >= 3;
        if (replaced) {
          // Snapshot what was there before a template load or clear.
          const before = s.lastCommit.before;
          void repoRef.current
            .addVersion({ id: newId("v"), diagramId: idRef.current, label: `Before: ${s.lastCommit.summary}`, title: lastTitle, createdAt: Date.now(), nodeCount: before.nodes.length, graph: before })
            .then(refreshVersions)
            .catch(() => {});
        } else if (commitsSinceVersion.current >= AUTO_VERSION_EVERY) {
          void saveVersion(`Autosave: ${s.lastCommit.summary}`);
        }
      }
      if (s.graph === lastGraph && s.title === lastTitle) return;
      lastGraph = s.graph;
      lastTitle = s.title;
      setSaveState("saving");
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const st = engine.get();
        try {
          await repoRef.current.save({ id: idRef.current, title: st.title, updatedAt: Date.now(), nodeCount: st.graph.nodes.length, graph: st.graph });
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
      }, 700);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [ready, engine, saveVersion, refreshVersions, setSaveState]);

  const restore = useCallback(
    (v: VersionRecord) => {
      engine.replace(v.graph, `Restored "${v.label}"`, "system", v.title);
      useStudio.getState().requestFit();
    },
    [engine],
  );

  const newDiagram = useCallback(async () => {
    const s = engine.get();
    if (s.graph.nodes.length) await saveVersion("Before starting a new diagram");
    idRef.current = newId("d");
    try {
      localStorage.setItem(CURRENT_KEY, idRef.current);
    } catch {
      /* ignore */
    }
    engine.load({ nodes: [], edges: [], seq: 0 }, "Untitled system");
    setVersions([]);
  }, [engine, saveVersion]);

  return { ready, versions, saveVersion, restore, newDiagram, storageKind: () => repoRef.current.kind };
}
