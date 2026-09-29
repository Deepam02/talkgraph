/**
 * Storage boundary. The app depends only on `DiagramRepository`; swapping the
 * browser store for a server database is a new implementation, not a refactor.
 */
import { z } from "zod";
import { COMPONENT_KINDS } from "@/domain/catalog";
import { EDGE_KINDS, PROTOCOLS, type Graph } from "@/domain/graph";

const inference = z.object({ reason: z.string().max(300) }).nullable();

export const graphSchema = z.object({
  seq: z.number().int().min(0),
  nodes: z
    .array(
      z.object({
        id: z.string().max(20),
        kind: z.enum(COMPONENT_KINDS),
        name: z.string().min(1).max(60),
        replicas: z.number().int().min(1).max(50),
        position: z.object({ x: z.number(), y: z.number() }),
        pinned: z.boolean(),
        inferred: inference,
        notes: z.string().max(500).optional(),
      }),
    )
    .max(300),
  edges: z
    .array(
      z.object({
        id: z.string().max(20),
        source: z.string().max(20),
        target: z.string().max(20),
        kind: z.enum(EDGE_KINDS),
        protocol: z.enum(PROTOCOLS),
        encrypted: z.boolean(),
        label: z.string().max(40).optional(),
        inferred: inference,
      }),
    )
    .max(1000),
});

export interface DiagramMeta {
  id: string;
  title: string;
  updatedAt: number;
  nodeCount: number;
}

export interface DiagramRecord extends DiagramMeta {
  graph: Graph;
}

export interface VersionRecord {
  id: string;
  diagramId: string;
  label: string;
  title: string;
  createdAt: number;
  nodeCount: number;
  graph: Graph;
}

export const diagramSchema = z.object({
  id: z.string().min(4).max(40),
  title: z.string().max(80),
  updatedAt: z.number(),
  nodeCount: z.number().int().min(0),
  graph: graphSchema,
});

export const versionSchema = z.object({
  id: z.string().min(4).max(40),
  diagramId: z.string().min(4).max(40),
  label: z.string().max(120),
  title: z.string().max(80),
  createdAt: z.number(),
  nodeCount: z.number().int().min(0),
  graph: graphSchema,
});

export interface DiagramRepository {
  readonly kind: "local" | "remote";
  list(): Promise<DiagramMeta[]>;
  get(id: string): Promise<DiagramRecord | null>;
  save(record: DiagramRecord): Promise<void>;
  remove(id: string): Promise<void>;
  listVersions(diagramId: string): Promise<VersionRecord[]>;
  addVersion(version: VersionRecord): Promise<void>;
}

export const MAX_VERSIONS = 30;

export function newId(prefix: string) {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rand}`;
}
