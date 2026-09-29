/**
 * Runs a typed or transcribed utterance through the offline parser and the
 * shared tool dispatcher, clause by clause, carrying "it"/"them" context
 * forward exactly like a conversation would.
 */
import type { EditSource, GraphEngine } from "@/engine/engine";
import { executeTool, type ToolOutcome } from "@/voice/dispatch";
import { contextAfter, parseClause, splitClauses, type ParseContext, type ToolCall } from "./parser";

export interface RunStep {
  clause: string;
  call?: ToolCall;
  outcome?: ToolOutcome;
  parseError?: string;
}

export class CommandRunner {
  private ctx: ParseContext;

  constructor(private readonly engine: GraphEngine) {
    this.ctx = { graph: engine.graph };
  }

  reset() {
    this.ctx = { graph: this.engine.graph };
  }

  run(text: string, source: EditSource = "command", overrides: Record<string, unknown> = {}): RunStep[] {
    const steps: RunStep[] = [];
    for (const clause of splitClauses(text)) {
      const state = this.engine.get();
      const focusName = state.focusId ? state.graph.nodes.find((n) => n.id === state.focusId)?.name : undefined;
      this.ctx = { ...this.ctx, graph: state.graph, focusName: this.ctx.focusName ?? focusName, simActive: Boolean(state.sim) };
      const parsed = parseClause(clause, this.ctx);
      if (!parsed.ok) {
        steps.push({ clause, parseError: parsed.error });
        break;
      }
      let stop = false;
      for (const call of parsed.calls) {
        const outcome = executeTool(this.engine, call.name, { ...call.arguments, ...overrides }, source);
        steps.push({ clause, call, outcome });
        const after = this.engine.get();
        const added = (outcome.commit?.changes ?? []).filter((c) => c.type === "edgeAdded").map((c) => (c as { id: string }).id);
        this.ctx = contextAfter(after.graph, this.ctx, added, after.focusId, Boolean(after.sim));
        if (!outcome.ok) {
          stop = true;
          break;
        }
      }
      if (stop) break;
    }
    return steps;
  }
}
