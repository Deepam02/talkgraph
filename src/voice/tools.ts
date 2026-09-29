/**
 * The agent's toolset: a few general tools (not one per component), each
 * defined once as a strict zod schema. The same schema validates arguments
 * locally before anything touches the graph, and is compiled to the JSON
 * Schema we send to the Voice Agent API, so the two can never drift apart.
 *
 * Enums come straight from the catalog, so the model cannot invent a component.
 */
import { z } from "zod";
import { COMPONENT_KINDS } from "@/domain/catalog";
import { EDGE_KINDS, PROTOCOLS } from "@/domain/graph";
import { TEMPLATE_IDS } from "@/domain/templates";

const ref = (description: string) =>
  z
    .string()
    .min(1)
    .max(60)
    .describe(description)
    .meta({ examples: ["api", "orders-db", "the database", "payments service"] });

const kind = z.enum(COMPONENT_KINDS).describe("Component kind from the catalog. Pick the closest match (e.g. 'a queue' → sqs, 'Postgres' → postgres, 'the backend' → service).");
const connection = z
  .enum(EDGE_KINDS)
  .describe("Link type. Omit to infer: anything touching a queue is async, db-to-db is replication, reads from a cache are cache.");
const protocol = z.enum(PROTOCOLS).describe("Wire protocol. Omit to infer a sensible default.");

export const TOOL_SCHEMAS = {
  add_components: z
    .object({
      items: z
        .array(
          z
            .object({
              kind,
              name: z
                .string()
                .max(40)
                .optional()
                .describe("Name the user said, e.g. 'orders' or 'payments service'. Omit to auto-name.")
                .meta({ examples: ["orders", "payments", "user-db"] }),
              count: z.number().int().min(1).max(5).optional().describe("How many separate components of this kind, e.g. 'three services' → 3."),
              replicas: z.number().int().min(1).max(50).optional().describe("Instances of one component, e.g. 'with three replicas' → 3."),
            })
            .strict(),
        )
        .min(1)
        .max(6)
        .describe("Components to add, in the order the user said them."),
      upstream: ref("Existing component that should CALL the new ones. 'behind the API' → upstream 'api'.").optional(),
      downstream: ref("Existing component the new ones should CALL. 'in front of orders' → downstream 'orders'.").optional(),
      connection: connection.optional(),
    })
    .strict(),

  connect_components: z
    .object({
      from: ref("The caller / producer (where the request starts)."),
      to: ref("The callee / consumer (where the request goes)."),
      connection: connection.optional(),
      protocol: protocol.optional(),
    })
    .strict(),

  insert_between: z
    .object({
      kind,
      from: ref("Upstream component."),
      to: ref("Downstream component."),
      name: z.string().max(40).optional().describe("Optional name for the inserted component."),
    })
    .strict(),

  update_component: z
    .object({
      target: ref("Component to change."),
      rename_to: z.string().min(1).max(40).optional().describe("New name."),
      replicas: z.number().int().min(1).max(50).optional().describe("Instance count, e.g. 'scale orders to 5' → 5."),
      change_kind_to: kind.optional(),
    })
    .strict(),

  update_connection: z
    .object({
      from: ref("Source of the existing connection."),
      to: ref("Target of the existing connection."),
      protocol: protocol.optional(),
      encrypted: z.boolean().optional().describe("true to turn on TLS, false for plaintext."),
      connection: connection.optional(),
      reverse: z.boolean().optional().describe("true to flip the direction."),
    })
    .strict(),

  remove: z
    .object({
      components: z.array(ref("Component to delete.")).max(10).optional(),
      connections: z
        .array(z.object({ from: ref("Source."), to: ref("Target.") }).strict())
        .max(10)
        .optional(),
      confirmed: z.boolean().optional().describe("Set true only after the user explicitly confirmed a destructive removal."),
    })
    .strict(),

  simulate: z
    .object({
      action: z
        .enum(["traffic", "kill", "fix", "stop", "status"])
        .describe("traffic: run load at a multiplier. kill: chaos, take a component down. fix: apply remedies to whatever is failing. stop: end the simulation. status: report."),
      multiplier: z.number().min(0.5).max(100).optional().describe("Traffic multiple of baseline, e.g. '10x traffic' → 10, 'double' → 2."),
      target: ref("For kill: which component to take down.").optional(),
    })
    .strict(),

  review_architecture: z
    .object({
      action: z
        .enum(["list", "fix", "fix_all", "accept_suggestion"])
        .describe("list: current findings. fix: fix one finding. fix_all: fix every finding that has a fix. accept_suggestion: apply the fix you just proposed after a rejected edit."),
      finding: z.string().max(80).optional().describe("For fix: the finding id, or words from its title like 'single point of failure' or 'orders-db'."),
    })
    .strict(),

  canvas: z
    .object({
      action: z
        .enum(["undo", "redo", "auto_layout", "fit_view", "load_template", "clear", "export", "rename_diagram"])
        .describe("Canvas-wide actions."),
      steps: z.number().int().min(1).max(20).optional().describe("For undo/redo: how many steps."),
      template: z.enum(TEMPLATE_IDS).optional().describe("For load_template."),
      format: z.enum(["terraform", "mermaid", "adr"]).optional().describe("For export."),
      title: z.string().max(60).optional().describe("For rename_diagram."),
      confirmed: z.boolean().optional().describe("Set true only after the user confirmed clearing or replacing a non-empty canvas."),
    })
    .strict(),
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;
export type ToolArgs<N extends ToolName> = z.infer<(typeof TOOL_SCHEMAS)[N]>;
export const TOOL_NAMES = Object.keys(TOOL_SCHEMAS) as ToolName[];

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  add_components:
    "Add one or more components to the diagram. Use whenever the user wants something new on the canvas ('add a Postgres behind the API', 'we need Redis', 'three workers'). Wire it with upstream/downstream when they say where it goes; otherwise omit both and obvious connections are inferred. Do not use to connect two existing components.",
  connect_components:
    "Connect two EXISTING components, pointing the way requests flow (caller → callee, producer → queue → consumer). Use for 'connect X to Y', 'X calls Y', 'Y reads from X'. Illegal links are rejected with a reason and a fix; say the reason and offer the fix.",
  insert_between:
    "Put a new component between two connected components, rewiring the link. Use for 'put a queue between them', 'add a cache in front of the database', 'a load balancer before the services'.",
  update_component: "Rename, rescale (replicas), or change the kind of an existing component.",
  update_connection: "Change an existing connection: protocol, TLS on/off, link type, or flip direction.",
  remove:
    "Delete components and/or connections. If the result says needs_confirmation, ask the user a yes/no question and call again with confirmed true only if they say yes.",
  simulate:
    "Traffic and chaos simulation. 'simulate 10x traffic' → traffic multiplier 10. 'kill the database' → kill target. 'fix it' or 'make it survive' while a simulation is running → fix. 'stop' → stop.",
  review_architecture:
    "The live linter. 'what's wrong', 'review this', 'any issues' → list. 'fix that', 'fix the single point of failure' → fix. 'fix everything' → fix_all. When the user says yes to a fix you offered after a rejected edit → accept_suggestion.",
  canvas:
    "Undo/redo ('undo', 'undo that', 'go back two steps'), tidy the layout, fit to screen, load a starter template, clear the canvas, export (Terraform, Mermaid, ADR), or rename the diagram.",
};

/** A tool definition in the Voice Agent API `session.tools` shape. */
export interface AgentToolDefinition {
  type: "function";
  name: ToolName;
  description: string;
  parameters: Record<string, unknown>;
  execution_mode?: "interactive" | "hold";
  timeout_seconds?: number;
}

function toParameters(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export function agentTools(): AgentToolDefinition[] {
  return TOOL_NAMES.map((name) => ({
    type: "function",
    name,
    description: TOOL_DESCRIPTIONS[name],
    parameters: toParameters(TOOL_SCHEMAS[name]),
    execution_mode: "interactive",
    timeout_seconds: 20,
  }));
}

/**
 * The Voice Agent API does not validate `parameters` at session.update time
 * (malformed schemas fail silently at runtime), so we check ours locally.
 */
export function assertValidToolSchemas(tools: AgentToolDefinition[]): void {
  for (const t of tools) {
    const p = t.parameters as { type?: string; properties?: Record<string, unknown>; required?: string[] };
    if (!/^[a-z][a-z0-9_]*$/.test(t.name)) throw new Error(`Tool ${t.name}: name must be snake_case`);
    if (p.type !== "object") throw new Error(`Tool ${t.name}: parameters.type must be "object"`);
    if (!p.properties || typeof p.properties !== "object") throw new Error(`Tool ${t.name}: parameters.properties missing`);
    for (const r of p.required ?? []) if (!(r in p.properties)) throw new Error(`Tool ${t.name}: required "${r}" is not a property`);
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== "object") return;
      const o = node as Record<string, unknown>;
      if ("enum" in o && (!Array.isArray(o.enum) || o.enum.length === 0)) throw new Error(`Tool ${t.name}: empty enum at ${path}`);
      for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
    };
    walk(p, t.name);
  }
}

export type ParsedArgs = { [N in ToolName]: { name: N; args: ToolArgs<N> } }[ToolName];

export class ToolArgumentError extends Error {
  constructor(
    public readonly tool: string,
    message: string,
  ) {
    super(message);
  }
}

/** Validate raw `tool.call` arguments with the strict schema. */
export function parseToolCall(name: string, rawArgs: unknown): ParsedArgs {
  if (!(name in TOOL_SCHEMAS)) throw new ToolArgumentError(name, `Unknown tool "${name}". Available: ${TOOL_NAMES.join(", ")}.`);
  const schema = TOOL_SCHEMAS[name as ToolName];
  const parsed = schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.length ? issue.path.join(".") : "arguments";
    throw new ToolArgumentError(name, `Invalid ${where}: ${issue.message}. Re-ask the user only for that value.`);
  }
  return { name, args: parsed.data } as ParsedArgs;
}
