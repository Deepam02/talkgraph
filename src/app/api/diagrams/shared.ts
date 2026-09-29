import { remoteStorageConfigured } from "@/config/env";

export function workspaceOf(request: Request): string | null {
  const ws = request.headers.get("x-workspace");
  return ws && /^ws_[a-zA-Z0-9-]{6,40}$/.test(ws) ? ws : null;
}

export function guard(request: Request): { ws: string } | Response {
  if (!remoteStorageConfigured) return Response.json({ error: "remote_storage_not_configured" }, { status: 501 });
  const ws = workspaceOf(request);
  if (!ws) return Response.json({ error: "missing_workspace" }, { status: 400 });
  return { ws };
}
