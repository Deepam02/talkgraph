/**
 * Resolve how people refer to components ("the API", "orders db", "the
 * database", "Postgres") to node ids. Asks only when ambiguity is real: a
 * single best match wins, a tie raises an `ambiguous` error naming the options.
 */
import { CATEGORIES, CATEGORY_META, kindFromPhrase, normalizePhrase, spec, type Category } from "./catalog";
import { DomainError } from "./commands";
import type { ArchNode, Graph } from "./graph";

const FILLER = /\b(the|a|an|my|our|your|this|that|new|existing|one|component|node|box)\b/g;

const CATEGORY_WORDS: Record<string, Category> = {
  database: "database",
  databases: "database",
  db: "database",
  store: "database",
  datastore: "database",
  storage: "database",
  queue: "queue",
  broker: "queue",
  stream: "queue",
  cache: "cache",
  gateway: "gateway",
  service: "service",
  services: "service",
  backend: "service",
  client: "client",
  frontend: "client",
};

function compact(s: string) {
  return s.replace(/[\s-]+/g, "");
}

export interface Match {
  node: ArchNode;
  score: number;
}

export function rankMatches(graph: Graph, phrase: string): Match[] {
  const raw = normalizePhrase(phrase);
  const text = raw.replace(FILLER, " ").replace(/\s+/g, " ").trim() || raw;
  if (!text) return [];
  const flat = compact(text);
  // A bare category word ("the database") must not favour one engine over another.
  const kind = CATEGORY_WORDS[text] ? null : kindFromPhrase(text);
  const catWord = CATEGORY_WORDS[text] ?? (CATEGORIES as readonly string[]).find((c) => c === text || CATEGORY_META[c as Category].label.toLowerCase() === text);

  const matches: Match[] = [];
  for (const node of graph.nodes) {
    const name = node.name;
    const nameFlat = compact(name);
    const nameWords = name.split("-");
    let score = 0;
    if (nameFlat === flat) score = 100;
    else if (nameWords.join(" ") === text) score = 100;
    else if (flat.length >= 2 && (nameFlat.startsWith(flat) || nameWords.includes(text))) score = 85;
    else if (flat.length >= 3 && nameFlat.includes(flat)) score = 75;
    else if (text.split(" ").length > 1 && text.split(" ").every((w) => nameWords.some((nw) => nw.startsWith(w) || w.startsWith(nw)))) score = 70;

    if (kind && node.kind === kind) score = Math.max(score, 60);
    const specLabel = spec(node.kind).label.toLowerCase();
    if (specLabel === text) score = Math.max(score, 62);
    if (catWord && spec(node.kind).category === catWord) score = Math.max(score, 45);
    // "orders db": name stem + category word.
    const words = text.split(" ");
    if (words.length >= 2) {
      const last = words[words.length - 1];
      const cat = CATEGORY_WORDS[last];
      const rest = compact(words.slice(0, -1).join(" "));
      if (cat && spec(node.kind).category === cat && rest.length >= 2 && nameFlat.includes(rest)) score = Math.max(score, 90);
    }
    if (score > 0) matches.push({ node, score });
  }
  return matches.sort((a, b) => b.score - a.score);
}

/** Resolve a reference to exactly one node or throw a DomainError the agent can relay. */
export function resolveNode(graph: Graph, phrase: string): ArchNode {
  const direct = graph.nodes.find((n) => n.id === phrase);
  if (direct) return direct;
  const matches = rankMatches(graph, phrase);
  if (!matches.length) {
    const names = graph.nodes.map((n) => n.name);
    throw new DomainError(
      "not_found",
      names.length
        ? `I couldn't find "${phrase}" on the canvas. It has ${names.slice(0, 12).join(", ")}.`
        : `The canvas is empty, so there's no "${phrase}" yet.`,
      undefined,
      names,
    );
  }
  const top = matches[0].score;
  const tied = matches.filter((m) => m.score === top);
  if (tied.length > 1) {
    const names = tied.map((m) => m.node.name);
    throw new DomainError(
      "ambiguous",
      `"${phrase}" could mean ${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}. Ask the user which one.`,
      undefined,
      names,
    );
  }
  return matches[0].node;
}
