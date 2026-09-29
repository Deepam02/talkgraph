import "server-only";
import { env } from "@/config/env";
import { MAX_VERSIONS, type DiagramMeta, type DiagramRecord, type VersionRecord } from "./types";

/** Minimal Upstash Redis REST client (no SDK): one pipeline call per operation. */
async function redis<T = unknown>(...commands: (string | number)[][]): Promise<T[]> {
  const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const out = (await res.json()) as { result?: T; error?: string }[];
  const err = out.find((o) => o.error);
  if (err) throw new Error(err.error);
  return out.map((o) => o.result as T);
}

const k = (ws: string, ...parts: string[]) => ["tg", ws, ...parts].join(":");

export const upstashStore = {
  async list(ws: string): Promise<DiagramMeta[]> {
    const [raw] = await redis<string[]>(["HVALS", k(ws, "index")]);
    return (raw ?? []).map((s) => JSON.parse(s) as DiagramMeta).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async get(ws: string, id: string): Promise<DiagramRecord | null> {
    const [raw] = await redis<string | null>(["GET", k(ws, "d", id)]);
    return raw ? (JSON.parse(raw) as DiagramRecord) : null;
  },
  async save(ws: string, rec: DiagramRecord) {
    const meta: DiagramMeta = { id: rec.id, title: rec.title, updatedAt: rec.updatedAt, nodeCount: rec.nodeCount };
    await redis(["SET", k(ws, "d", rec.id), JSON.stringify(rec)], ["HSET", k(ws, "index"), rec.id, JSON.stringify(meta)]);
  },
  async remove(ws: string, id: string) {
    await redis(["DEL", k(ws, "d", id)], ["DEL", k(ws, "v", id)], ["HDEL", k(ws, "index"), id]);
  },
  async listVersions(ws: string, id: string): Promise<VersionRecord[]> {
    const [raw] = await redis<string[]>(["LRANGE", k(ws, "v", id), 0, MAX_VERSIONS - 1]);
    return (raw ?? []).map((s) => JSON.parse(s) as VersionRecord);
  },
  async addVersion(ws: string, v: VersionRecord) {
    await redis(["LPUSH", k(ws, "v", v.diagramId), JSON.stringify(v)], ["LTRIM", k(ws, "v", v.diagramId), 0, MAX_VERSIONS - 1]);
  },
};
