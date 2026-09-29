import { PRODUCT } from "@/config/product";
import { catalogKeyterms } from "@/domain/catalog";
import type { Graph } from "@/domain/graph";
import type { EngineState } from "@/engine/engine";
import { buildSystemPrompt, TRANSCRIPTION_PROMPT } from "./prompt";
import type { SessionConfig } from "./protocol";
import { agentTools, assertValidToolSchemas } from "./tools";

const MAX_KEYTERMS = 100;

/** Catalog jargon plus the user's own component names, capped at the API's 100. */
export function keytermsFor(graph: Graph): string[] {
  // The user's own names first: they're the words the model has never seen.
  const out = new Set<string>();
  for (const n of graph.nodes) {
    const spoken = n.name.replace(/-/g, " ");
    if (spoken.length >= 3) out.add(spoken);
  }
  for (const k of catalogKeyterms()) out.add(k);
  return [...out].slice(0, MAX_KEYTERMS);
}

let validated = false;

export function initialSessionConfig(state: EngineState, opts: { greeting?: boolean; volume?: number } = {}): SessionConfig {
  const tools = agentTools();
  if (!validated) {
    assertValidToolSchemas(tools);
    validated = true;
  }
  return {
    system_prompt: buildSystemPrompt(state),
    ...(opts.greeting === false ? {} : { greeting: PRODUCT.greeting }),
    tools,
    input: {
      format: { encoding: "audio/pcm" },
      keyterms: keytermsFor(state.graph),
      transcription_prompt: TRANSCRIPTION_PROMPT,
    },
    output: { voice: PRODUCT.voice, format: { encoding: "audio/pcm" }, ...(opts.volume !== undefined ? { volume: opts.volume } : {}) },
  };
}

/** Mutable fields re-sent after edits so the agent always sees the live canvas. */
export function liveUpdate(state: EngineState, includeKeyterms: boolean): Pick<SessionConfig, "system_prompt" | "input"> {
  return {
    system_prompt: buildSystemPrompt(state),
    ...(includeKeyterms ? { input: { keyterms: keytermsFor(state.graph) } } : {}),
  };
}
