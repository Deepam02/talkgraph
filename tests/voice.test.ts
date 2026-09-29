import { describe, expect, it } from "vitest";
import { buildTemplate } from "@/domain/templates";
import { GraphEngine } from "@/engine/engine";
import { starterGraph } from "@/bench/run";
import { initialSessionConfig, keytermsFor } from "@/voice/config";
import { executeTool } from "@/voice/dispatch";
import { buildSystemPrompt } from "@/voice/prompt";
import { AgentProtocol, ToolResultGate, type ClientEvent, type ServerEvent } from "@/voice/protocol";
import { agentTools, assertValidToolSchemas, parseToolCall } from "@/voice/tools";

describe("tool schemas", () => {
  const tools = agentTools();

  it("are few, general, and valid JSON Schema objects", () => {
    expect(tools.length).toBeLessThanOrEqual(10);
    expect(() => assertValidToolSchemas(tools)).not.toThrow();
    for (const t of tools) {
      expect(t.type).toBe("function");
      expect(t.description.length).toBeGreaterThan(40);
      expect((t.parameters as { additionalProperties?: boolean }).additionalProperties).toBe(false);
    }
  });

  it("constrain component kinds to the catalog enum", () => {
    const add = tools.find((t) => t.name === "add_components")!;
    const json = JSON.stringify(add.parameters);
    expect(json).toContain('"postgres"');
    expect(json).toContain('"enum"');
  });

  it("validate strictly: unknown kinds and extra fields are rejected", () => {
    expect(() => parseToolCall("add_components", { items: [{ kind: "unicorn_db" }] })).toThrow(/Invalid/);
    expect(() => parseToolCall("connect_components", { from: "a", to: "b", color: "red" })).toThrow(/Invalid/);
    expect(() => parseToolCall("nope", {})).toThrow(/Unknown tool/);
    expect(parseToolCall("canvas", { action: "undo", steps: 2 }).args).toEqual({ action: "undo", steps: 2 });
  });

  it("session config carries tools, keyterms, prompt, and voice", () => {
    const engine = new GraphEngine(buildTemplate("ecommerce"));
    const cfg = initialSessionConfig(engine.get());
    expect(cfg.tools?.length).toBe(tools.length);
    expect(cfg.input?.keyterms?.length).toBeLessThanOrEqual(100);
    expect(cfg.input?.keyterms).toContain("orders db");
    expect(cfg.output?.voice).toBeTruthy();
    expect(cfg.system_prompt).toContain("orders-db");
    expect(keytermsFor(engine.graph)).toContain("Kafka");
  });

  it("system prompt leads with the most important rule and embeds live state", () => {
    const engine = new GraphEngine(starterGraph());
    const p = buildSystemPrompt(engine.get());
    expect(p.startsWith("EVERY change")).toBe(true);
    expect(p).toContain("LIVE CANVAS");
    expect(p).toContain("api (service)");
  });
});

describe("dispatcher", () => {
  it("adds, connects, rejects with a suggestion, and accepts it", () => {
    const engine = new GraphEngine(starterGraph());
    const add = executeTool(engine, "add_components", { items: [{ kind: "postgres" }], upstream: "the API" });
    expect(add.ok).toBe(true);
    const bad = executeTool(engine, "connect_components", { from: "web", to: "postgres" });
    expect(bad.ok).toBe(false);
    expect(bad.payload.suggestion).toBeTruthy();
    expect(engine.get().suggestion).not.toBeNull();
    const accept = executeTool(engine, "review_architecture", { action: "accept_suggestion" });
    expect(accept.ok).toBe(true);
    expect(engine.graph.nodes.filter((n) => n.kind === "service")).toHaveLength(2);
  });

  it("asks for confirmation before destructive removal", () => {
    const engine = new GraphEngine(starterGraph());
    const r = executeTool(engine, "remove", { components: ["api"] });
    expect(r.ok).toBe(false);
    expect(r.needsConfirmation).toBe(true);
    expect(engine.graph.nodes).toHaveLength(2);
    const r2 = executeTool(engine, "remove", { components: ["api"], confirmed: true });
    expect(r2.ok).toBe(true);
    expect(engine.graph.nodes).toHaveLength(1);
    executeTool(engine, "canvas", { action: "undo" });
    expect(engine.graph.nodes).toHaveLength(2);
  });

  it("returns invalid-argument errors instead of throwing", () => {
    const engine = new GraphEngine();
    const r = executeTool(engine, "add_components", { items: [] });
    expect(r.ok).toBe(false);
    expect(r.payload.code).toBe("invalid_arguments");
  });

  it("reports ambiguity so the agent can ask", () => {
    const engine = new GraphEngine(starterGraph());
    executeTool(engine, "add_components", { items: [{ kind: "postgres", name: "orders-db" }, { kind: "mysql", name: "users-db" }], upstream: "api" });
    const r = executeTool(engine, "simulate", { action: "kill", target: "the database" });
    expect(r.ok).toBe(false);
    expect(r.payload.code).toBe("ambiguous");
  });

  it("runs chaos and remedies end to end", () => {
    const engine = new GraphEngine(buildTemplate("ecommerce"));
    const k = executeTool(engine, "simulate", { action: "kill", target: "orders-db" });
    expect(k.ok).toBe(true);
    expect((k.payload.failing as string[]).length).toBeGreaterThan(0);
    const f = executeTool(engine, "simulate", { action: "fix" });
    expect(f.ok).toBe(true);
    expect(f.payload.error_rate_after).toBe("0%");
  });
});

describe("tool result gate", () => {
  const collect = () => {
    const sent: ClientEvent[] = [];
    return { sent, gate: new ToolResultGate((e) => sent.push(e)) };
  };

  it("holds results until reply.done is the latest event", () => {
    const { sent, gate } = collect();
    gate.observe({ type: "reply.started" });
    gate.enqueue({ call_id: "c1", result: "{}", is_error: false });
    expect(sent).toHaveLength(0);
    gate.observe({ type: "reply.done", status: "completed" });
    expect(sent).toEqual([{ type: "tool.result", call_id: "c1", result: "{}", is_error: false }]);
  });

  it("sends immediately when the reply already finished", () => {
    const { sent, gate } = collect();
    gate.observe({ type: "reply.done", status: "completed" });
    gate.enqueue({ call_id: "c2", result: "{}", is_error: false });
    expect(sent).toHaveLength(1);
  });

  it("holds while the user is speaking and drops results of an interrupted reply", () => {
    const { sent, gate } = collect();
    gate.observe({ type: "reply.done", status: "completed" });
    gate.observe({ type: "input.speech.started" });
    gate.enqueue({ call_id: "c3", result: "{}", is_error: false });
    expect(sent).toHaveLength(0);
    gate.observe({ type: "reply.done", status: "interrupted" });
    expect(sent).toHaveLength(0);
    expect(gate.pendingCount).toBe(0);
  });
});

describe("agent protocol", () => {
  function harness() {
    const sent: ClientEvent[] = [];
    const statuses: string[] = [];
    let flushed = 0;
    const engine = new GraphEngine(starterGraph());
    const proto = new AgentProtocol((e) => sent.push(e), {
      onStatus: (s) => statuses.push(s),
      onFlushAudio: () => flushed++,
      onToolCall: (name, args) => {
        const out = executeTool(engine, name, args);
        return { payload: out.payload, isError: !out.ok };
      },
    });
    const feed = (e: ServerEvent) => proto.handle(e);
    return { sent, statuses, feed, proto, engine, flushed: () => flushed };
  }

  it("opens with session.update and gates audio on session.ready", () => {
    const h = harness();
    h.proto.start({ system_prompt: "x" });
    expect(h.sent[0].type).toBe("session.update");
    h.proto.sendAudio("AAAA");
    expect(h.sent).toHaveLength(1);
    h.feed({ type: "session.ready", session_id: "sess_1" });
    h.proto.sendAudio("AAAA");
    expect(h.sent[1].type).toBe("input.audio");
  });

  it("applies the edit on tool.call immediately and answers after reply.done", () => {
    const h = harness();
    h.proto.start({});
    h.feed({ type: "session.ready", session_id: "s" });
    h.feed({ type: "reply.started", reply_id: "r1" });
    h.feed({ type: "tool.call", call_id: "call_1", name: "add_components", arguments: { items: [{ kind: "redis" }] } });
    expect(h.engine.graph.nodes.some((n) => n.kind === "redis")).toBe(true); // applied before result
    expect(h.sent.some((e) => e.type === "tool.result")).toBe(false);
    h.feed({ type: "reply.done", reply_id: "r1", status: "completed" });
    const result = h.sent.find((e) => e.type === "tool.result") as Extract<ClientEvent, { type: "tool.result" }>;
    expect(result.call_id).toBe("call_1");
    expect(JSON.parse(result.result).ok).toBe(true);
  });

  it("flushes playback on barge-in", () => {
    const h = harness();
    h.proto.start({});
    h.feed({ type: "session.ready", session_id: "s" });
    h.feed({ type: "reply.started" });
    h.feed({ type: "reply.audio", data: "AAAA" });
    h.feed({ type: "input.speech.started" });
    expect(h.flushed()).toBe(1);
    expect(h.statuses).toContain("speaking");
    expect(h.statuses.at(-1)).toBe("hearing");
  });

  it("ends cleanly with session.end and does not send after", () => {
    const h = harness();
    h.proto.start({});
    h.feed({ type: "session.ready", session_id: "s" });
    h.proto.end();
    expect(h.sent.at(-1)).toEqual({ type: "session.end" });
    h.feed({ type: "session.ended" });
    h.proto.sendAudio("AAAA");
    expect(h.sent.at(-1)).toEqual({ type: "session.end" });
  });

  it("injects typed text as a user message plus reply.create", () => {
    const h = harness();
    h.proto.start({});
    h.feed({ type: "session.ready", session_id: "s" });
    h.proto.sendText("add kafka");
    expect(h.sent.slice(-2).map((e) => e.type)).toEqual(["conversation.message", "reply.create"]);
  });
});
