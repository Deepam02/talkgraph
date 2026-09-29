"use client";

import { createContext } from "react";

/** Optional interactions for canvas nodes and edges; the landing demo passes none. */
export interface CanvasActions {
  onKill?(nodeId: string): void;
  onFindingClick?(nodeId: string): void;
  onKeepInference?(id: string): void;
  onUndoInference?(edgeId: string): void;
}

export const CanvasActionsContext = createContext<CanvasActions>({});
