/**
 * Offline command parser: typed or transcribed English → the same tool calls
 * the voice agent makes. Powers the ⌘K command bar (works with no API key and
 * no microphone) and the CI half of the benchmark. It is a deterministic
 * grammar, not a model: fast, predictable, and honest about what it misses.
 */
import { categoryOf, kindFromPhrase, normalizePhrase, spec, type ComponentKind } from "@/domain/catalog";
import { incoming, type Graph, type Protocol } from "@/domain/graph";
import { rankMatches } from "@/domain/resolve";
import type { TemplateId } from "@/domain/templates";
import type { ToolName } from "@/voice/tools";

export interface ToolCall {
  name: ToolName;
  arguments: Record<string, unknown>;
}

export interface ParseContext {
  graph: Graph;
  /** Endpoints of the most recent connection made, for "them". */
  lastPair?: [string, string];
  /** The node most recently touched, for "it". */
  focusName?: string;
  simActive?: boolean;
}

export type ParseResult = { ok: true; calls: ToolCall[] } | { ok: false; error: string };

const NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  single: 1,
  two: 2,
  couple: 2,
  pair: 2,
  double: 2,
  three: 3,
  few: 3,
  triple: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twenty: 20,
  fifty: 50,
  hundred: 100,
};

const VERB_START =
  /^(add|create|put|insert|place|connect|link|wire|hook|remove|delete|drop|rename|call|scale|make|undo|redo|simulate|kill|fix|stop|export|clear|load|tidy|clean|review|check|lint|use|turn|encrypt|swap|give|spin|we need|i need|throw|stick|attach|go back|take down|crash|show|run|send|now)\b/;

const GENERIC_WORDS = new Set([
  "database",
  "db",
  "cache",
  "queue",
  "service",
  "services",
  "server",
  "instance",
  "cluster",
  "node",
  "component",
  "new",
  "another",
  "some",
  "of",
  "for",
  "the",
  "a",
  "an",
  "my",
  "our",
  "layer",
  "store",
  "app",
  "api",
  "system",
]);

const NAME_FROM_ALIAS: Record<string, string> = { api: "api", backend: "backend", frontend: "frontend", "front end": "frontend" };

function num(word: string | undefined): number | undefined {
  if (!word) return undefined;
  const w = word.toLowerCase();
  if (/^\d+(\.\d+)?$/.test(w)) return Number(w);
  return NUMBERS[w];
}

function clean(s: string) {
  return s
    .toLowerCase()
    .replace(/[“”"]/g, "")
    .replace(/’/g, "'")
    .replace(/\b(please|can you|could you|would you|let's|lets|go ahead and|just|okay|ok|so|hey|now|actually|um|uh|alright|straight|directly)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "");
}

/** Split an utterance into independent clauses ("add X, then connect Y"). */
export function splitClauses(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?;])\s+|\bthen\b|\band then\b/i)) {
    const parts = sentence.split(/,\s*(?:and\s+)?/);
    let cur = "";
    for (const part of parts) {
      const p = clean(part);
      if (!p) continue;
      if (cur && VERB_START.test(p)) {
        out.push(cur);
        cur = p;
      } else {
        cur = cur ? `${cur}, ${p}` : p;
      }
    }
    if (cur) out.push(cur);
  }
  return out.map((c) => c.replace(/^(and|also)\s+/, "").trim()).filter(Boolean);
}

function refOf(phrase: string, ctx: ParseContext): string {
  const p = phrase.replace(/^(the|a|an|my|our)\s+/, "").trim();
  if (/^(it|that|this|this one|that one|the new one)$/.test(p) && ctx.focusName) return ctx.focusName;
  return p;
}

function pairOf(phrase: string, ctx: ParseContext): [string, string] | undefined {
  if (/^(them|those|those two|these|both|the two)$/.test(phrase.trim()) && ctx.lastPair) return ctx.lastPair;
  const m = phrase.match(/^(.+?)\s+and\s+(.+)$/);
  if (m) return [refOf(m[1], ctx), refOf(m[2], ctx)];
  return undefined;
}

function protocolIn(text: string): { protocol?: Protocol; connection?: "async" | "sync" } {
  const t = ` ${text} `;
  const out: { protocol?: Protocol; connection?: "async" | "sync" } = {};
  if (/\b(plain ?text|unencrypted|without tls|no tls|plain http|over http)\b/.test(t) && !/https/.test(t)) out.protocol = "HTTP";
  else if (/\bgrpc\b/.test(t)) out.protocol = "gRPC";
  else if (/\bhttps\b/.test(t)) out.protocol = "HTTPS";
  else if (/\bgraphql\b/.test(t)) out.protocol = "GraphQL";
  else if (/\bweb ?sockets?\b/.test(t)) out.protocol = "WebSocket";
  else if (/\bamqp\b/.test(t)) out.protocol = "AMQP";
  else if (/\bmqtt\b/.test(t)) out.protocol = "MQTT";
  else if (/\bhttp\b/.test(t)) out.protocol = "HTTP";
  if (/\basync(hronous(ly)?)?\b/.test(t)) out.connection = "async";
  return out;
}

function stripProtocolWords(s: string) {
  return s
    .replace(/\s+(over|via|using|with)\s+(plain ?text|unencrypted|plain http|https?|grpc|graphql|web ?sockets?|amqp|mqtt|tls)\b.*$/, "")
    .replace(/\s+(async(hronously)?|synchronously|without tls|unencrypted)\b.*$/, "")
    .trim();
}

interface Item {
  kind: ComponentKind;
  name?: string;
  count?: number;
  replicas?: number;
}

function parseItem(phrase: string): Item | null {
  let p = phrase.trim().replace(/^(a couple of|a few|a pair of)\s+/, (m) => (m.includes("couple") || m.includes("pair") ? "two " : "three "));
  let name: string | undefined;
  const named = p.match(/\s+(?:called|named)\s+([a-z0-9][a-z0-9 -]*)$/);
  if (named) {
    name = named[1].trim();
    p = p.slice(0, named.index).trim();
  }
  let replicas: number | undefined;
  const rep = p.match(/\s+with\s+(\w+)\s+(replicas|instances|nodes|copies)$/);
  if (rep) {
    replicas = num(rep[1]);
    p = p.slice(0, rep.index).trim();
  }
  const words = p.split(" ");
  let count: number | undefined;
  if (words.length > 1 && num(words[0]) !== undefined) {
    count = num(words.shift());
  }
  const body = words.join(" ");
  const kind = kindFromPhrase(body);
  if (!kind) return null;

  if (!name) {
    // Leftover words that aren't part of the kind's own vocabulary become the name ("orders service" → orders).
    const vocab = new Set(
      [spec(kind).label, ...spec(kind).aliases]
        .map(normalizePhrase)
        .flatMap((a) => a.split(" ")),
    );
    const leftover = normalizePhrase(body)
      .split(" ")
      .filter((w) => w && !vocab.has(w) && !vocab.has(w.replace(/s$/, "")) && !GENERIC_WORDS.has(w));
    if (leftover.length && leftover.length <= 3) name = leftover.join("-");
    else {
      const aliasName = Object.keys(NAME_FROM_ALIAS).find((a) => normalizePhrase(body) === a);
      if (aliasName) name = NAME_FROM_ALIAS[aliasName];
    }
  }
  return { kind, name, count: count && count > 1 ? Math.min(count, 5) : undefined, replicas };
}

function parseItems(list: string): Item[] | null {
  const parts = list
    .split(/\s*,\s*|\s+and\s+|\s+plus\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const items: Item[] = [];
  for (const part of parts) {
    const item = parseItem(part);
    if (!item) return null;
    items.push(item);
  }
  return items.length ? items : null;
}

function singleCaller(graph: Graph, targetRef: string): string | undefined {
  const target = rankMatches(graph, targetRef)[0]?.node;
  if (!target) return undefined;
  const callers = incoming(graph, target.id).filter((e) => e.kind === "sync");
  if (callers.length !== 1) return undefined;
  return graph.nodes.find((n) => n.id === callers[0].source)?.name;
}

const TEMPLATE_WORDS: [RegExp, TemplateId][] = [
  [/e-?commerce|shop|store|checkout|retail/, "ecommerce"],
  [/chat|messaging|slack|whatsapp/, "chat"],
  [/rag|ai assistant|assistant|llm app|chatbot/, "rag"],
  [/ride|uber|lyft|taxi|dispatch/, "rides"],
];

export function parseClause(input: string, ctx: ParseContext): ParseResult {
  const text = clean(input);
  if (!text) return { ok: false, error: "Say or type a command." };
  const call = (name: ToolName, args: Record<string, unknown>): ParseResult => ({ ok: true, calls: [{ name, arguments: args }] });
  let m: RegExpMatchArray | null;

  // ── History ──
  if ((m = text.match(/^(undo|go back|revert|take that back|scratch that)\b(?:.*?\b(\w+)\s+(?:times|steps|changes|edits))?/))) {
    return call("canvas", { action: "undo", ...(num(m[2]) ? { steps: num(m[2]) } : {}) });
  }
  if ((m = text.match(/^redo\b(?:.*?\b(\w+)\s+(?:times|steps))?/))) return call("canvas", { action: "redo", ...(num(m[1]) ? { steps: num(m[1]) } : {}) });

  // ── Simulation ──
  if (/^(stop|end|turn off|cancel|pause)\b.*\b(simulation|traffic|chaos|sim|test)\b/.test(text)) return call("simulate", { action: "stop" });
  if ((m = text.match(/\b(\d+(?:\.\d+)?|two|three|four|five|ten|twenty|fifty|hundred)\s*(?:x|times)\b.*\b(traffic|load|users|requests)\b/)) || (m = text.match(/\b(double|triple)\b.*\b(traffic|load)\b/))) {
    return call("simulate", { action: "traffic", multiplier: num(m[1]) ?? 10 });
  }
  if (/\b(black friday|super bowl|go viral|goes viral|traffic spike|launch day)\b/.test(text)) return call("simulate", { action: "traffic", multiplier: 20 });
  if (/^(simulate|run|start|show)\b.*\b(traffic|load|simulation)\b/.test(text)) return call("simulate", { action: "traffic", multiplier: 1 });
  if ((m = text.match(/^(?:kill|take down|crash|break|fail|knock out|nuke|shut down|unplug|what if we lose|what happens if (?:we lose|i kill))\s+(.+)$/))) {
    return call("simulate", { action: "kill", target: refOf(m[1].replace(/\?$/, "").replace(/\s+(dies|fails|goes down)$/, ""), ctx) });
  }
  if ((m = text.match(/^(?:fix|repair|heal|solve)\s*(it|that|this|everything|all|all of (?:it|them)|the (.+))?$/)) || /^make it (survive|work|resilient|hold|scale)/.test(text)) {
    const what = m?.[1];
    if (ctx.simActive && (!what || /^(it|that|this)$/.test(what))) return call("simulate", { action: "fix" });
    if (what && /^(everything|all)/.test(what)) return call("review_architecture", { action: "fix_all" });
    if (m?.[2]) return call("review_architecture", { action: "fix", finding: m[2] });
    if (ctx.simActive) return call("simulate", { action: "fix" });
    return call("review_architecture", { action: "fix" });
  }
  if (/^(yes|yeah|yep|sure|do it|go for it|sounds good|apply (it|that|the suggestion))\b/.test(text)) return call("review_architecture", { action: "accept_suggestion" });

  // ── Review / export / canvas ──
  if (/(what'?s wrong|whats wrong|review|lint|audit|(check|critique) (the |my |this )?(architecture|design|diagram|system)|any (issues|problems|risks)|what could go wrong)/.test(text)) {
    return call("review_architecture", { action: "list" });
  }
  if ((m = text.match(/\b(terraform|mermaid|adr|decision record|architecture decision)\b/)) && /\b(export|generate|give|show|make|write|download|create)\b/.test(text)) {
    const f = m[1] === "terraform" ? "terraform" : m[1] === "mermaid" ? "mermaid" : "adr";
    return call("canvas", { action: "export", format: f });
  }
  if (/^(clear|wipe|reset|erase|start over|start fresh|blank)\b/.test(text)) return call("canvas", { action: "clear" });
  if (/\b(tidy|clean) (it |this |things )?up\b|auto ?-?layout|re-?arrange|arrange (it|this|everything)|re-?layout|organi[sz]e/.test(text)) return call("canvas", { action: "auto_layout" });
  if (/\b(fit|zoom) (to )?(the )?(screen|view|everything|all)|zoom out|show everything\b/.test(text)) return call("canvas", { action: "fit_view" });
  if (/\b(load|use|open|start (from|with)|show me|give me)\b.*\b(template|example|starter)\b/.test(text) || /^(load|start with|start from)\b/.test(text)) {
    const hit = TEMPLATE_WORDS.find(([re]) => re.test(text));
    if (hit) return call("canvas", { action: "load_template", template: hit[1] });
  }
  if ((m = text.match(/^(?:rename|call|name) (?:the |this )?(?:diagram|system|project|architecture) (?:to )?(.+)$/))) return call("canvas", { action: "rename_diagram", title: m[1] });

  // ── Removal ──
  if ((m = text.match(/^(?:remove|delete|drop|disconnect|cut|get rid of)\s+(?:the\s+)?(?:connection|link|edge|arrow|line)\s+(?:from|between)\s+(.+?)\s+(?:to|and)\s+(.+)$/)) || (m = text.match(/^disconnect\s+(.+?)\s+(?:from|and)\s+(.+)$/))) {
    return call("remove", { connections: [{ from: refOf(m[1], ctx), to: refOf(m[2], ctx) }] });
  }
  if ((m = text.match(/^(?:remove|delete|drop|get rid of|kill off|lose)\s+(.+)$/))) {
    const pair = pairOf(m[1], ctx);
    const targets = pair ?? m[1].split(/\s*,\s*|\s+and\s+/).map((t) => refOf(t, ctx));
    return call("remove", { components: targets });
  }

  // ── Rename / scale / retype ──
  if ((m = text.match(/^(?:rename|call|name)\s+(.+?)\s+(?:to|as)\s+(.+)$/)) || (m = text.match(/^(?:call|name|rename)\s+(it|that|this)\s+(.+)$/))) {
    return call("update_component", { target: refOf(m[1], ctx), rename_to: m[2] });
  }
  if ((m = text.match(/^(?:scale|make|run|bump|set)\s+(.+?)\s+(?:to|up to|out to|have|at|with)\s+(\w+)\s*(?:replicas|instances|nodes|copies|pods|x)?$/))) {
    const n = num(m[2]);
    if (n) return call("update_component", { target: refOf(m[1], ctx), replicas: Math.round(n) });
  }
  if ((m = text.match(/^(?:scale up|scale out)\s+(.+)$/))) {
    const target = rankMatches(ctx.graph, refOf(m[1], ctx))[0]?.node;
    return call("update_component", { target: refOf(m[1], ctx), replicas: Math.max(3, (target?.replicas ?? 1) * 2) });
  }
  if ((m = text.match(/^(?:add|create|give)\s+(?:a\s+)?(?:read\s+|standby\s+|hot\s+)?replica\s+(?:to|of|for)\s+(.+)$/))) {
    const target = rankMatches(ctx.graph, refOf(m[1], ctx))[0]?.node;
    if (!target) return { ok: false, error: `I couldn't find ${m[1]} on the canvas.` };
    return call("add_components", { items: [{ kind: target.kind, name: `${target.name}-replica` }], upstream: target.name, connection: "replication" });
  }
  if ((m = text.match(/^(?:swap|change|switch|replace|turn|make)\s+(.+?)\s+(?:to|into|with|for)\s+(?:a |an )?(.+)$/))) {
    const kind = kindFromPhrase(m[2]);
    const target = refOf(m[1], ctx);
    if (kind && rankMatches(ctx.graph, target).length) return call("update_component", { target, change_kind_to: kind });
  }

  // ── Connection updates ──
  if ((m = text.match(/^(?:encrypt|secure|add tls to|turn on tls (?:for|on)|enable tls (?:for|on))\s+(?:the\s+)?(?:connection|link|traffic)?\s*(?:from|between)?\s*(.+?)\s+(?:to|and)\s+(.+)$/))) {
    return call("update_connection", { from: refOf(m[1], ctx), to: refOf(m[2], ctx), encrypted: true });
  }
  if ((m = text.match(/^(?:use|switch to|make it)\s+(grpc|https|http|graphql|websockets?|amqp|mqtt)\s+(?:between|from|for)\s+(.+?)\s+(?:and|to)\s+(.+)$/))) {
    const { protocol } = protocolIn(m[1]);
    return call("update_connection", { from: refOf(m[2], ctx), to: refOf(m[3], ctx), protocol });
  }
  if ((m = text.match(/^(?:flip|reverse)\s+(?:the\s+)?(?:connection|link|arrow)?\s*(?:from|between)?\s*(.+?)\s+(?:to|and)\s+(.+)$/))) {
    return call("update_connection", { from: refOf(m[1], ctx), to: refOf(m[2], ctx), reverse: true });
  }

  // ── Insert between / in front of ──
  if ((m = text.match(/^(?:put|insert|add|place|stick|drop|slot|throw)\s+(?:in\s+)?(.+?)\s+between\s+(.+)$/))) {
    const item = parseItem(m[1]);
    const pair = pairOf(m[2], ctx);
    if (!item) return { ok: false, error: `I don't know what "${m[1]}" is. Try a queue, cache, gateway, or service.` };
    if (!pair) return { ok: false, error: "Between which two components?" };
    return call("insert_between", { kind: item.kind, from: pair[0], to: pair[1], ...(item.name ? { name: item.name } : {}) });
  }
  if ((m = text.match(/^(?:put|insert|add|place|stick)\s+(.+?)\s+in front of\s+(.+)$/))) {
    const item = parseItem(m[1]);
    if (!item) return { ok: false, error: `I don't know what "${m[1]}" is.` };
    const target = refOf(m[2], ctx);
    const caller = singleCaller(ctx.graph, target);
    if (caller) return call("insert_between", { kind: item.kind, from: caller, to: target, ...(item.name ? { name: item.name } : {}) });
    return call("add_components", { items: [item], downstream: target });
  }

  // ── Connect ──
  const flow = protocolIn(text);
  const extra = { ...(flow.protocol ? { protocol: flow.protocol } : {}), ...(flow.connection ? { connection: flow.connection } : {}) };
  if ((m = text.match(/^(?:connect|link|wire|hook up|hook|point|route)\s+(.+?)\s+(?:up\s+)?(?:to|with|into|and|at)\s+(.+)$/))) {
    return call("connect_components", { from: refOf(m[1], ctx), to: refOf(stripProtocolWords(m[2]), ctx), ...extra });
  }
  // ── Add ──
  if (
    (m = text.match(
      /^(?:add|create|put|place|spin up|we need|i need|we'll need|give me|i want|include|deploy|throw in|drop in|stand up|set up|let's have|there's|there is|also)\s+(?:in\s+)?(.+)$/,
    ))
  ) {
    let rest = m[1];
    let upstream: string | undefined;
    let downstream: string | undefined;
    let connection: string | undefined;
    const loc = rest.match(/\s+(behind|after|connected to|attached to|hooked up to|for|used by|called by|fed by|that consumes from|that consumes|which consumes|consuming from|consuming|reading from|that reads from|downstream of|below|under|in front of|before|that calls|which calls|calling|that talks to|talking to|that writes to|writing to|upstream of|above|between)\s+(.+)$/);
    if (loc) {
      rest = rest.slice(0, loc.index).trim();
      const where = loc[1];
      const target = refOf(stripProtocolWords(loc[2]), ctx);
      if (where === "between") {
        const item = parseItem(rest);
        const pair = pairOf(loc[2], ctx);
        if (item && pair) return call("insert_between", { kind: item.kind, from: pair[0], to: pair[1], ...(item.name ? { name: item.name } : {}) });
      }
      if (/^(in front of|before|upstream of|above)$/.test(where)) {
        const item = parseItem(rest);
        const cat = item ? categoryOf(item.kind) : undefined;
        const caller = singleCaller(ctx.graph, target);
        if (item && caller && (cat === "gateway" || cat === "security" || cat === "cache" || cat === "queue")) {
          return call("insert_between", { kind: item.kind, from: caller, to: target, ...(item.name ? { name: item.name } : {}) });
        }
        downstream = target;
      } else if (/^(that calls|which calls|calling|that talks to|talking to|that writes to|writing to|consuming|consuming from|that consumes|that consumes from|which consumes|reading from|that reads from)$/.test(where)) {
        if (/consum|reading|reads/.test(where)) upstream = target;
        else downstream = target;
      } else {
        upstream = target;
      }
      if (flow.connection) connection = flow.connection;
    }
    const items = parseItems(rest);
    if (!items) return { ok: false, error: `I don't have "${rest}" in the component library. Try Postgres, Redis, Kafka, a queue, a gateway, or a service.` };
    // Explicit "a replica" of an existing store.
    if (upstream && items.length === 1) {
      const up = rankMatches(ctx.graph, upstream)[0]?.node;
      if (up && up.kind === items[0].kind && categoryOf(up.kind) === "database") connection = "replication";
    }
    return call("add_components", {
      items,
      ...(upstream ? { upstream } : {}),
      ...(downstream ? { downstream } : {}),
      ...(connection ? { connection } : {}),
    });
  }

  // ── Flow verbs: "X calls Y", "the worker consumes the queue" ──
  if ((m = text.match(/^(.+?)\s+(?:calls|talks to|hits|sends (?:requests )?to|writes to|publishes to|pushes to|queries|uses|depends on|reads from|should call|needs to call)\s+(.+)$/))) {
    return call("connect_components", { from: refOf(m[1], ctx), to: refOf(stripProtocolWords(m[2]), ctx), ...extra });
  }
  if ((m = text.match(/^(.+?)\s+(?:consumes(?: from)?|subscribes to|listens to|reads messages from|pulls from)\s+(.+)$/))) {
    return call("connect_components", { from: refOf(m[2], ctx), to: refOf(m[1], ctx), ...extra });
  }

  // A bare component name ("redis", "a kafka cluster") means add it.
  const bare = parseItems(text);
  if (bare && text.split(" ").length <= 5) return call("add_components", { items: bare });

  return { ok: false, error: `I didn't catch a command in "${input}". Try "add a Postgres behind the API" or "simulate 10x traffic".` };
}

/** Context for "them"/"it" after an edit: the last connection made and last node touched. */
export function contextAfter(graph: Graph, prev: ParseContext, addedEdgeIds: string[], focusId?: string, simActive?: boolean): ParseContext {
  const edges = addedEdgeIds.map((id) => graph.edges.find((e) => e.id === id)).filter(Boolean);
  const last = edges.at(-1);
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name;
  const pair = last ? ([name(last.source), name(last.target)] as [string, string]) : prev.lastPair;
  const focus = focusId ? name(focusId) : prev.focusName;
  return {
    graph,
    lastPair: pair,
    focusName: focus,
    simActive,
  };
}
