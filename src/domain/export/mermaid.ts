import { CATEGORY_META, categoryOf, spec, type Category } from "../catalog";
import type { Graph } from "../graph";

const SHAPE: Record<Category, (id: string, label: string) => string> = {
  client: (id, l) => `${id}(["${l}"])`,
  gateway: (id, l) => `${id}{{"${l}"}}`,
  service: (id, l) => `${id}["${l}"]`,
  database: (id, l) => `${id}[("${l}")]`,
  queue: (id, l) => `${id}>"${l}"]`,
  cache: (id, l) => `${id}(("${l}"))`,
  security: (id, l) => `${id}[/"${l}"\\]`,
  observability: (id, l) => `${id}[["${l}"]]`,
  external: (id, l) => `${id}(["${l}"])`,
};

const ARROW = { sync: "-->", async: "-.->", replication: "==>", cache: "-->" } as const;

function mid(name: string) {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

function esc(s: string) {
  return s.replace(/"/g, "'");
}

/** Mermaid flowchart with category shapes, colors, and edge styles. */
export function toMermaid(graph: Graph, title?: string): string {
  const lines: string[] = [];
  if (title) lines.push("---", `title: ${esc(title)}`, "---");
  lines.push("flowchart LR");
  for (const n of graph.nodes) {
    const cat = categoryOf(n.kind);
    const label = `${n.name}${n.replicas > 1 ? ` ×${n.replicas}` : ""}<br/><small>${spec(n.kind).label}</small>`;
    lines.push(`  ${SHAPE[cat](mid(n.name), esc(label))}:::${cat}`);
  }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const cacheLinks: number[] = [];
  graph.edges.forEach((e, i) => {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) return;
    const label = e.kind === "replication" ? "replication" : `${e.protocol}${e.encrypted ? "" : " ⚠ plaintext"}`;
    lines.push(`  ${mid(s.name)} ${ARROW[e.kind]}|${esc(label)}| ${mid(t.name)}`);
    if (e.kind === "cache") cacheLinks.push(i);
  });
  for (const cat of Object.keys(CATEGORY_META) as Category[]) {
    const c = CATEGORY_META[cat];
    lines.push(`  classDef ${cat} fill:${c.tint},stroke:${c.color},color:#1E2340,stroke-width:1.5px`);
  }
  if (cacheLinks.length) lines.push(`  linkStyle ${cacheLinks.join(",")} stroke:#FB7185,stroke-width:1px`);
  return lines.join("\n") + "\n";
}
