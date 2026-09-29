/**
 * The graph reducer. `applyCommands` runs a transaction of commands against an
 * immutable graph: either every command succeeds and a new graph comes back,
 * or a DomainError is thrown and the original graph is untouched.
 */
import { categoryOf, isComponentKind, spec, type ComponentKind } from "./catalog";
import { DomainError, type Command, type NodeRef } from "./commands";
import {
  edgeById,
  findEdge,
  nodeById,
  PLAINTEXT_PROTOCOLS,
  slugify,
  uniqueName,
  type ArchEdge,
  type ArchNode,
  type EdgeKind,
  type Graph,
  type Inference,
  type Protocol,
} from "./graph";
import { inferConnections, inferName } from "./infer";
import { layoutGraph } from "./layout";
import { checkConnection } from "./rules";

export type Change =
  | { type: "nodeAdded"; id: string }
  | { type: "nodeRemoved"; id: string; name: string }
  | { type: "nodeUpdated"; id: string; fields: string[] }
  | { type: "edgeAdded"; id: string }
  | { type: "edgeRemoved"; id: string; source: string; target: string }
  | { type: "edgeUpdated"; id: string; fields: string[] }
  | { type: "layout" }
  | { type: "replaced" };

export interface ApplyOptions {
  /** Re-run auto layout on unpinned nodes after structural edits (default true). */
  layout?: boolean;
  /** The node the user touched most recently; inference prefers it. */
  focusId?: string;
}

export interface ApplyResult {
  graph: Graph;
  changes: Change[];
  /** Inference and coercion notes, in order, for toasts and tool results. */
  notes: string[];
  /** Ids touched by this transaction, most recent last. */
  touched: string[];
  symbols: Record<string, string>;
}

const MAX_REPLICAS = 50;

class Tx {
  graph: Graph;
  changes: Change[] = [];
  notes: string[] = [];
  touched: string[] = [];
  symbols: Record<string, string> = {};
  structural = false;

  constructor(
    graph: Graph,
    private readonly opts: ApplyOptions,
  ) {
    this.graph = graph;
  }

  private nextId(prefix: "n" | "e"): string {
    this.graph = { ...this.graph, seq: this.graph.seq + 1 };
    return `${prefix}${this.graph.seq}`;
  }

  node(ref: NodeRef): ArchNode {
    const id = ref.startsWith("$") ? this.symbols[ref] : ref;
    const n = id ? nodeById(this.graph, id) : undefined;
    if (!n) throw new DomainError("not_found", `There's no component called ${ref.replace(/^\$/, "")} on the canvas.`);
    return n;
  }

  private touch(id: string) {
    this.touched = this.touched.filter((t) => t !== id).concat(id);
  }

  private putNode(node: ArchNode) {
    const exists = this.graph.nodes.some((n) => n.id === node.id);
    this.graph = {
      ...this.graph,
      nodes: exists ? this.graph.nodes.map((n) => (n.id === node.id ? node : n)) : [...this.graph.nodes, node],
    };
  }

  private putEdge(edge: ArchEdge) {
    const exists = this.graph.edges.some((e) => e.id === edge.id);
    this.graph = {
      ...this.graph,
      edges: exists ? this.graph.edges.map((e) => (e.id === edge.id ? edge : e)) : [...this.graph.edges, edge],
    };
  }

  connect(
    fromRef: NodeRef,
    toRef: NodeRef,
    req: { kind?: EdgeKind; protocol?: Protocol; encrypted?: boolean; label?: string },
    inferred: Inference | null,
  ): ArchEdge {
    const source = this.node(fromRef);
    const target = this.node(toRef);
    const verdict = checkConnection(this.graph, source, target, req);
    if (!verdict.ok) throw new DomainError(verdict.code, verdict.reason, verdict.suggestion);
    const edge: ArchEdge = {
      id: this.nextId("e"),
      source: source.id,
      target: target.id,
      kind: verdict.kind,
      protocol: verdict.protocol,
      encrypted: verdict.encrypted,
      label: req.label,
      inferred,
    };
    this.putEdge(edge);
    this.changes.push({ type: "edgeAdded", id: edge.id });
    for (const note of verdict.notes) if (!note.startsWith("Protocol")) this.notes.push(note);
    this.structural = true;
    return edge;
  }

  addNode(cmd: Extract<Command, { type: "addNode" }>, contextId?: string): ArchNode {
    if (!isComponentKind(cmd.kind)) throw new DomainError("invalid_value", `${cmd.kind} isn't in the component catalog.`);
    const replicas = clampReplicas(cmd.replicas ?? 1);
    const contextRef = contextId ?? cmd.connectFrom?.[0] ?? cmd.connectTo?.[0];
    const context = contextRef ? this.node(contextRef) : undefined;

    let name: string;
    let inferred: Inference | null = null;
    if (cmd.name && slugify(cmd.name)) {
      name = uniqueName(this.graph, slugify(cmd.name));
    } else {
      const guess = inferName(this.graph, cmd.kind, context);
      name = guess.name;
      inferred = { reason: guess.reason };
    }

    const node: ArchNode = {
      id: this.nextId("n"),
      kind: cmd.kind,
      name,
      replicas,
      position: cmd.position ?? context?.position ?? { x: 0, y: 0 },
      pinned: Boolean(cmd.position),
      inferred,
    };
    this.putNode(node);
    if (cmd.as) this.symbols[cmd.as.startsWith("$") ? cmd.as : `$${cmd.as}`] = node.id;
    this.changes.push({ type: "nodeAdded", id: node.id });
    this.touch(node.id);
    this.structural = true;

    const req = { kind: cmd.edgeKind, protocol: cmd.protocol };
    for (const from of cmd.connectFrom ?? []) this.connect(from, node.id, req, null);
    for (const to of cmd.connectTo ?? []) this.connect(node.id, to, req, null);

    const explicit = (cmd.connectFrom?.length ?? 0) + (cmd.connectTo?.length ?? 0) > 0;
    if (!explicit && cmd.autoConnect !== false) {
      for (const link of inferConnections(this.graph, node, this.opts.focusId)) {
        const s = nodeById(this.graph, link.from);
        const t = nodeById(this.graph, link.to);
        if (!s || !t) continue;
        const verdict = checkConnection(this.graph, s, t, {});
        if (!verdict.ok) continue;
        this.connect(link.from, link.to, {}, { reason: link.reason });
        this.notes.push(link.reason);
      }
      // An auto-named node that just gained an upstream gets a contextual name ("api-db").
      const upstream = this.graph.edges.find((e) => e.target === node.id);
      const current = nodeById(this.graph, node.id)!;
      if (!cmd.name && upstream && !context) {
        const ctxNode = nodeById(this.graph, upstream.source)!;
        const without = { ...this.graph, nodes: this.graph.nodes.filter((n) => n.id !== node.id) };
        const guess = inferName(without, cmd.kind, ctxNode);
        if (guess.name !== current.name) this.putNode({ ...current, name: guess.name, inferred: { reason: guess.reason } });
      }
    }
    return nodeById(this.graph, node.id)!;
  }

  insertBetween(cmd: Extract<Command, { type: "insertBetween" }>): ArchNode {
    const from = this.node(cmd.from);
    const to = this.node(cmd.to);
    if (from.id === to.id) throw new DomainError("invalid_value", "Pick two different components to insert between.");
    const direct = findEdge(this.graph, from.id, to.id);
    const reversed = direct ? undefined : findEdge(this.graph, to.id, from.id);
    const [a, b, existing] = reversed ? [to, from, reversed] : [from, to, direct];
    const newCat = categoryOf(cmd.kind);

    // A cache sits beside the store: the caller reads the cache and keeps its fallback edge.
    if (newCat === "cache" && categoryOf(b.kind) === "database") {
      const cache = this.addNode({
        type: "addNode",
        kind: cmd.kind,
        name: cmd.name,
        as: cmd.as,
        connectFrom: [a.id],
        autoConnect: false,
      }, b.id);
      if (!existing) this.connect(a.id, b.id, {}, { reason: `Falls back to ${b.name} on cache misses.` });
      this.notes.push(`${a.name} checks ${cache.name} first and falls back to ${b.name} on a miss.`);
      return cache;
    }

    if (existing) this.removeEdge(existing.id);
    const mid = this.addNode({ type: "addNode", kind: cmd.kind, name: cmd.name, as: cmd.as, autoConnect: false }, a.id);
    this.connect(a.id, mid.id, {}, null);

    // A queue can't write into a store on its own: add the consumer it obviously needs.
    const tail = categoryOf(b.kind);
    if (newCat === "queue" && tail !== "service" && tail !== "queue") {
      const worker = this.addNode({
        type: "addNode",
        kind: "worker",
        name: `${mid.name.replace(/-(queue|events|broker|topic)$/, "")}-worker`,
        connectFrom: [mid.id],
        connectTo: [b.id],
        autoConnect: false,
      });
      this.putNode({ ...worker, inferred: { reason: `A queue can't write to ${b.name} by itself, so I added a worker to consume it.` } });
      this.notes.push(`A queue can't write to ${b.name} by itself, so I added ${worker.name} to consume it.`);
    } else {
      this.connect(mid.id, b.id, {}, null);
    }
    return nodeById(this.graph, mid.id)!;
  }

  removeEdge(id: string) {
    const e = edgeById(this.graph, id);
    if (!e) throw new DomainError("not_found", `That connection no longer exists.`);
    this.graph = { ...this.graph, edges: this.graph.edges.filter((x) => x.id !== id) };
    this.changes.push({ type: "edgeRemoved", id, source: e.source, target: e.target });
    this.structural = true;
  }

  run(cmd: Command) {
    switch (cmd.type) {
      case "addNode":
        this.addNode(cmd);
        return;
      case "connect": {
        const e = this.connect(cmd.from, cmd.to, cmd, null);
        this.touch(e.target);
        return;
      }
      case "insertBetween":
        this.insertBetween(cmd);
        return;
      case "updateNode": {
        const n = this.node(cmd.id);
        const fields: string[] = [];
        let next: ArchNode = { ...n };
        if (cmd.name !== undefined) {
          const slug = slugify(cmd.name);
          if (!slug) throw new DomainError("invalid_value", "Names need at least one letter or number.");
          next.name = uniqueName(this.graph, slug, n.id);
          next.inferred = null;
          fields.push("name");
        }
        if (cmd.replicas !== undefined) {
          next.replicas = clampReplicas(cmd.replicas);
          fields.push("replicas");
        }
        if (cmd.notes !== undefined) {
          next.notes = cmd.notes.slice(0, 500);
          fields.push("notes");
        }
        if (cmd.kind !== undefined && cmd.kind !== n.kind) {
          if (!isComponentKind(cmd.kind)) throw new DomainError("invalid_value", `${cmd.kind} isn't in the catalog.`);
          next = { ...next, kind: cmd.kind };
          fields.push("kind");
          this.revalidateEdgesFor(next);
        }
        if (!fields.length) throw new DomainError("nothing_to_do", `Nothing to change on ${n.name}.`);
        this.putNode(next);
        this.changes.push({ type: "nodeUpdated", id: n.id, fields });
        this.touch(n.id);
        if (fields.includes("kind")) this.structural = true;
        return;
      }
      case "updateEdge": {
        const e = edgeById(this.graph, cmd.id);
        if (!e) throw new DomainError("not_found", "That connection no longer exists.");
        const fields: string[] = [];
        const next: ArchEdge = { ...e };
        if (cmd.kind && cmd.kind !== e.kind) {
          const others = { ...this.graph, edges: this.graph.edges.filter((x) => x.id !== e.id) };
          const verdict = checkConnection(others, this.node(e.source), this.node(e.target), { kind: cmd.kind, protocol: e.protocol });
          if (!verdict.ok) throw new DomainError(verdict.code, verdict.reason, verdict.suggestion);
          if (verdict.kind !== cmd.kind) throw new DomainError("illegal_connection", verdict.notes[0] ?? "That link type doesn't fit.");
          next.kind = verdict.kind;
          fields.push("kind");
        }
        if (cmd.protocol) {
          next.protocol = cmd.protocol;
          next.encrypted = cmd.encrypted ?? (PLAINTEXT_PROTOCOLS.has(cmd.protocol) ? false : true);
          fields.push("protocol");
        }
        if (cmd.encrypted !== undefined && !cmd.protocol) {
          next.encrypted = cmd.encrypted;
          if (cmd.encrypted && next.protocol === "HTTP") next.protocol = "HTTPS";
          fields.push("encrypted");
        }
        if (cmd.label !== undefined) {
          next.label = cmd.label.slice(0, 40) || undefined;
          fields.push("label");
        }
        if (!fields.length) throw new DomainError("nothing_to_do", "Nothing to change on that connection.");
        next.inferred = null;
        this.putEdge(next);
        this.changes.push({ type: "edgeUpdated", id: e.id, fields });
        return;
      }
      case "reverseEdge": {
        const e = edgeById(this.graph, cmd.id);
        if (!e) throw new DomainError("not_found", "That connection no longer exists.");
        this.removeEdge(e.id);
        this.connect(e.target, e.source, {}, null);
        return;
      }
      case "removeNodes": {
        const ids = new Set(cmd.ids.map((r) => this.node(r).id));
        if (!ids.size) throw new DomainError("nothing_to_do", "Nothing to remove.");
        for (const n of this.graph.nodes) if (ids.has(n.id)) this.changes.push({ type: "nodeRemoved", id: n.id, name: n.name });
        for (const e of this.graph.edges)
          if (ids.has(e.source) || ids.has(e.target)) this.changes.push({ type: "edgeRemoved", id: e.id, source: e.source, target: e.target });
        this.graph = {
          ...this.graph,
          nodes: this.graph.nodes.filter((n) => !ids.has(n.id)),
          edges: this.graph.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
        };
        this.touched = this.touched.filter((t) => !ids.has(t));
        this.structural = true;
        return;
      }
      case "removeEdges":
        for (const id of cmd.ids) this.removeEdge(id);
        return;
      case "moveNode": {
        const n = this.node(cmd.id);
        this.putNode({ ...n, position: cmd.position, pinned: cmd.pin ?? true });
        this.changes.push({ type: "nodeUpdated", id: n.id, fields: ["position"] });
        return;
      }
      case "replaceGraph":
        this.graph = structuredClone(cmd.graph);
        this.changes.push({ type: "replaced" });
        return;
      case "autoLayout":
        this.graph = layoutGraph(this.graph, { unpinAll: cmd.unpinAll ?? true });
        this.changes.push({ type: "layout" });
        return;
      case "clearInference": {
        const n = nodeById(this.graph, cmd.id);
        if (n) {
          this.putNode({ ...n, inferred: null });
          return;
        }
        const e = edgeById(this.graph, cmd.id);
        if (e) this.putEdge({ ...e, inferred: null });
        return;
      }
    }
  }

  private revalidateEdgesFor(node: ArchNode) {
    const probe = { ...this.graph, nodes: this.graph.nodes.map((n) => (n.id === node.id ? node : n)) };
    for (const e of this.graph.edges) {
      if (e.source !== node.id && e.target !== node.id) continue;
      const rest = { ...probe, edges: probe.edges.filter((x) => x.id !== e.id) };
      const s = nodeById(rest, e.source)!;
      const t = nodeById(rest, e.target)!;
      const verdict = checkConnection(rest, s, t, {});
      if (!verdict.ok) {
        throw new DomainError(
          "illegal_connection",
          `Changing ${node.name} to a ${spec(node.kind).label} would break its link with ${s.id === node.id ? t.name : s.name}: ${verdict.reason}`,
        );
      }
    }
  }
}

function clampReplicas(n: number): number {
  if (!Number.isFinite(n)) throw new DomainError("invalid_value", "Replicas must be a number.");
  return Math.max(1, Math.min(MAX_REPLICAS, Math.round(n)));
}

export function applyCommands(graph: Graph, commands: Command[], opts: ApplyOptions = {}): ApplyResult {
  const tx = new Tx(graph, opts);
  for (const cmd of commands) tx.run(cmd);
  let result = tx.graph;
  if (tx.structural && opts.layout !== false) result = layoutGraph(result);
  return { graph: result, changes: tx.changes, notes: tx.notes, touched: tx.touched, symbols: tx.symbols };
}

/** Compact human summary of a change list: "Added orders-db, connected api → orders-db". */
export function describeChanges(before: Graph, after: Graph, changes: Change[]): string {
  const name = (id: string) => nodeById(after, id)?.name ?? nodeById(before, id)?.name ?? id;
  const parts: string[] = [];
  const added = changes.filter((c) => c.type === "nodeAdded").map((c) => name(c.id));
  const removed = changes.filter((c): c is Extract<Change, { type: "nodeRemoved" }> => c.type === "nodeRemoved").map((c) => c.name);
  const edgesAdded = changes.filter((c) => c.type === "edgeAdded").length;
  const edgesRemoved = changes.filter((c) => c.type === "edgeRemoved").length;
  const updated = changes.filter((c): c is Extract<Change, { type: "nodeUpdated" }> => c.type === "nodeUpdated" && !c.fields.includes("position"));
  if (added.length) parts.push(`Added ${listNames(added)}`);
  if (removed.length) parts.push(`Removed ${listNames(removed)}`);
  if (updated.length) parts.push(`Updated ${listNames(updated.map((c) => name(c.id)))}`);
  if (edgesAdded && !added.length) parts.push(`${edgesAdded} new connection${edgesAdded > 1 ? "s" : ""}`);
  else if (edgesAdded) parts.push(`${edgesAdded} connection${edgesAdded > 1 ? "s" : ""}`);
  if (edgesRemoved && !removed.length) parts.push(`${edgesRemoved} connection${edgesRemoved > 1 ? "s" : ""} removed`);
  if (changes.some((c) => c.type === "edgeUpdated") && !parts.length) parts.push("Updated connection");
  if (changes.some((c) => c.type === "layout") && !parts.length) parts.push("Tidied the layout");
  if (changes.some((c) => c.type === "replaced")) parts.push("Loaded diagram");
  return parts.join(" · ") || "No changes";
}

function listNames(names: string[]): string {
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

export type { ComponentKind };
