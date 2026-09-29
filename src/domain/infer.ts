/**
 * Sensible defaults. When a component arrives without explicit wiring, infer
 * the obvious connection (and explain why) instead of asking. Every inferred
 * connection is marked so the UI can badge it and offer a one-tap undo.
 */
import { categoryOf, spec, type ComponentKind } from "./catalog";
import { incoming, nameStem, outgoing, slugify, uniqueName, type ArchNode, type Graph } from "./graph";

export interface InferredLink {
  from: string;
  to: string;
  reason: string;
}

const ENTRY_PRIORITY: ComponentKind[] = ["cdn", "waf", "load_balancer", "api_gateway"];
const APP_SERVICES: ReadonlySet<ComponentKind> = new Set([
  "service",
  "auth_service",
  "graphql_api",
  "websocket_server",
  "ml_inference",
]);

function services(graph: Graph, exclude: string) {
  return graph.nodes.filter((n) => n.id !== exclude && categoryOf(n.kind) === "service");
}

function pickFocus(graph: Graph, focusId: string | undefined, predicate: (n: ArchNode) => boolean): ArchNode | undefined {
  if (!focusId) return undefined;
  const n = graph.nodes.find((x) => x.id === focusId);
  return n && predicate(n) ? n : undefined;
}

/**
 * Obvious connections for a freshly added node. Only returns links when the
 * answer is unambiguous (exactly one candidate, or the node the user was just
 * working on); otherwise it leaves the node unconnected rather than guess.
 */
export function inferConnections(graph: Graph, node: ArchNode, focusId?: string): InferredLink[] {
  const cat = categoryOf(node.kind);
  const links: InferredLink[] = [];

  const upstreamService = (): InferredLink[] => {
    const focus = pickFocus(graph, focusId, (n) => n.id !== node.id && categoryOf(n.kind) === "service");
    if (focus) return [{ from: focus.id, to: node.id, reason: `Connected from ${focus.name} because you were just working on it.` }];
    const svc = services(graph, node.id).filter((n) => n.kind !== "scheduler");
    if (svc.length === 1) {
      return [{ from: svc[0].id, to: node.id, reason: `Connected from ${svc[0].name}, the only service so far.` }];
    }
    return [];
  };

  switch (cat) {
    case "database":
    case "cache":
      return upstreamService();

    case "service": {
      if (node.kind === "worker" || node.kind === "function") {
        const idleQueues = graph.nodes.filter(
          (n) => n.id !== node.id && categoryOf(n.kind) === "queue" && outgoing(graph, n.id).length === 0,
        );
        if (idleQueues.length === 1) {
          links.push({ from: idleQueues[0].id, to: node.id, reason: `Consumes ${idleQueues[0].name}, which had no consumer yet.` });
        }
        return links;
      }
      if (!APP_SERVICES.has(node.kind)) return links;
      const routers = graph.nodes.filter(
        (n) => n.id !== node.id && (n.kind === "api_gateway" || n.kind === "load_balancer" || n.kind === "graphql_api"),
      );
      if (routers.length === 1) {
        links.push({ from: routers[0].id, to: node.id, reason: `Routed from ${routers[0].name}, your only entry point.` });
        return links;
      }
      if (routers.length === 0) {
        const clients = graph.nodes.filter((n) => categoryOf(n.kind) === "client" && outgoing(graph, n.id).length === 0);
        if (clients.length === 1) {
          links.push({ from: clients[0].id, to: node.id, reason: `Called by ${clients[0].name}, which wasn't connected yet.` });
        }
      }
      return links;
    }

    case "gateway":
    case "security": {
      if (node.kind === "secrets_vault") return upstreamService();
      if (node.kind === "identity_provider") {
        const gw = graph.nodes.filter((n) => n.kind === "api_gateway" && n.id !== node.id);
        if (gw.length === 1) return [{ from: gw[0].id, to: node.id, reason: `${gw[0].name} verifies tokens with it.` }];
        const auth = graph.nodes.filter((n) => n.kind === "auth_service");
        if (auth.length === 1) return [{ from: auth[0].id, to: node.id, reason: `${auth[0].name} delegates identity to it.` }];
        return [];
      }
      // Entry points: unconnected clients call in, orphan services get routed to.
      for (const c of graph.nodes) {
        if (c.id === node.id || categoryOf(c.kind) !== "client") continue;
        if (outgoing(graph, c.id).length === 0) {
          links.push({ from: c.id, to: node.id, reason: `${c.name} now enters through ${node.name}.` });
        }
      }
      const downstream = graph.nodes.filter(
        (n) =>
          n.id !== node.id &&
          APP_SERVICES.has(n.kind) &&
          incoming(graph, n.id).filter((e) => e.kind === "sync").length === 0,
      );
      for (const s of downstream.slice(0, 4)) {
        links.push({ from: node.id, to: s.id, reason: `${node.name} routes to ${s.name}, which had no entry point.` });
      }
      if (downstream.length === 0 && node.kind !== "api_gateway") {
        // A CDN/WAF/LB in front of an existing gateway.
        const next = ENTRY_PRIORITY.slice(ENTRY_PRIORITY.indexOf(node.kind) + 1)
          .map((k) => graph.nodes.find((n) => n.kind === k && n.id !== node.id))
          .find(Boolean);
        if (next) links.push({ from: node.id, to: next.id, reason: `Sits in front of ${next.name}.` });
      }
      return links;
    }

    case "queue": {
      const focus = pickFocus(graph, focusId, (n) => n.id !== node.id && categoryOf(n.kind) === "service");
      if (focus) return [{ from: focus.id, to: node.id, reason: `${focus.name} publishes to it, since you were just working on it.` }];
      const svc = services(graph, node.id).filter((n) => APP_SERVICES.has(n.kind));
      if (svc.length === 1) return [{ from: svc[0].id, to: node.id, reason: `${svc[0].name} publishes to it, the only service so far.` }];
      return [];
    }

    case "client": {
      const entry = ENTRY_PRIORITY.map((k) => graph.nodes.find((n) => n.kind === k && n.id !== node.id)).find(Boolean);
      if (entry) return [{ from: node.id, to: entry.id, reason: `Enters through ${entry.name}.` }];
      return [];
    }

    case "external": {
      const focus = pickFocus(graph, focusId, (n) => categoryOf(n.kind) === "service");
      if (focus) return [{ from: focus.id, to: node.id, reason: `Called by ${focus.name}, since you were just working on it.` }];
      const stemMatch = services(graph, node.id).filter((s) =>
        spec(node.kind).aliases.some((a) => s.name.includes(slugify(a).split("-")[0])),
      );
      if (stemMatch.length === 1) return [{ from: stemMatch[0].id, to: node.id, reason: `Called by ${stemMatch[0].name}, going by its name.` }];
      return upstreamService();
    }

    default:
      return [];
  }
}

/**
 * Pick a name when the user didn't give one: contextual ("orders-db") when we
 * know what it serves, plain default ("postgres") otherwise.
 */
export function inferName(graph: Graph, kind: ComponentKind, context?: ArchNode): { name: string; reason: string } {
  const s = spec(kind);
  if (context && s.contextualName) {
    const stem = nameStem(context.name);
    if (stem && stem !== s.defaultName) {
      const name = uniqueName(graph, slugify(s.contextualName.replace("{stem}", stem)));
      return { name, reason: `Named after ${context.name}.` };
    }
  }
  return { name: uniqueName(graph, s.defaultName), reason: `Default name for a ${s.label}.` };
}
