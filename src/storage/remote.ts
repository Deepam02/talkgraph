import { PRODUCT } from "@/config/product";
import { newId, type DiagramMeta, type DiagramRecord, type DiagramRepository, type VersionRecord } from "./types";

/**
 * Server-backed repository (the /api/diagrams routes, Upstash Redis behind
 * them). Diagrams are scoped to an anonymous workspace id kept in the browser;
 * swap this for your auth's user or org id.
 */
export class RemoteRepository implements DiagramRepository {
  readonly kind = "remote" as const;
  private workspace: string;

  constructor() {
    const key = `${PRODUCT.slug}:workspace`;
    let ws = "";
    try {
      ws = localStorage.getItem(key) ?? "";
      if (!ws) {
        ws = newId("ws");
        localStorage.setItem(key, ws);
      }
    } catch {
      ws = newId("ws");
    }
    this.workspace = ws;
  }

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`/api/diagrams${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "X-Workspace": this.workspace, ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Storage request failed (${res.status})`);
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  list() {
    return this.call<DiagramMeta[]>("");
  }
  get(id: string) {
    return this.call<DiagramRecord | null>(`/${encodeURIComponent(id)}`);
  }
  async save(record: DiagramRecord) {
    await this.call(`/${encodeURIComponent(record.id)}`, { method: "PUT", body: JSON.stringify(record) });
  }
  async remove(id: string) {
    await this.call(`/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
  listVersions(diagramId: string) {
    return this.call<VersionRecord[]>(`/${encodeURIComponent(diagramId)}/versions`);
  }
  async addVersion(version: VersionRecord) {
    await this.call(`/${encodeURIComponent(version.diagramId)}/versions`, { method: "POST", body: JSON.stringify(version) });
  }
}
