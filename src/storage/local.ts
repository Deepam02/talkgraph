import { PRODUCT } from "@/config/product";
import { diagramSchema, MAX_VERSIONS, versionSchema, type DiagramMeta, type DiagramRecord, type DiagramRepository, type VersionRecord } from "./types";

const KEY = `${PRODUCT.slug}:v1`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode): the canvas keeps working in memory.
  }
}

/** Browser-local repository (localStorage). Zero setup; per device. */
export class LocalRepository implements DiagramRepository {
  readonly kind = "local" as const;

  async list(): Promise<DiagramMeta[]> {
    return read<DiagramMeta[]>(`${KEY}:index`, []).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<DiagramRecord | null> {
    const raw = read<unknown>(`${KEY}:d:${id}`, null);
    const parsed = diagramSchema.safeParse(raw);
    return parsed.success ? (parsed.data as DiagramRecord) : null;
  }

  async save(record: DiagramRecord): Promise<void> {
    write(`${KEY}:d:${record.id}`, record);
    const index = (await this.list()).filter((m) => m.id !== record.id);
    index.unshift({ id: record.id, title: record.title, updatedAt: record.updatedAt, nodeCount: record.nodeCount });
    write(`${KEY}:index`, index.slice(0, 50));
  }

  async remove(id: string): Promise<void> {
    localStorage.removeItem(`${KEY}:d:${id}`);
    localStorage.removeItem(`${KEY}:v:${id}`);
    write(`${KEY}:index`, (await this.list()).filter((m) => m.id !== id));
  }

  async listVersions(diagramId: string): Promise<VersionRecord[]> {
    const raw = read<unknown[]>(`${KEY}:v:${diagramId}`, []);
    return raw.map((v) => versionSchema.safeParse(v)).filter((p) => p.success).map((p) => p.data as VersionRecord);
  }

  async addVersion(version: VersionRecord): Promise<void> {
    const list = await this.listVersions(version.diagramId);
    write(`${KEY}:v:${version.diagramId}`, [version, ...list].slice(0, MAX_VERSIONS));
  }
}
