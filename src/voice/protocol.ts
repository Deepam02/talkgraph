/**
 * Voice Agent API protocol core, free of DOM and audio so it is unit-testable.
 * Implements the documented contract:
 *  - first message is session.update; audio only after session.ready
 *  - tool.call edits are applied immediately, but tool.result is sent only
 *    when reply.done is the latest event (held on reply.started /
 *    input.speech.started, dropped on an interrupted reply.done)
 *  - barge-in flushes queued playback on input.speech.started
 *  - clean shutdown with session.end, then wait for session.ended
 * https://www.assemblyai.com/docs/voice-agents/voice-agent-api/tools/client-side-tools
 */
import type { AgentToolDefinition } from "./tools";

export const VOICE_AGENT_WS_URL = "wss://agents.assemblyai.com/v1/ws";

export interface SessionConfig {
  system_prompt?: string;
  greeting?: string;
  tools?: AgentToolDefinition[];
  input?: {
    format?: { encoding: "audio/pcm" };
    keyterms?: string[];
    transcription_prompt?: string;
    transcription_mode?: "min_latency" | "balanced" | "max_accuracy";
    turn_detection?: { interrupt_response?: boolean };
  };
  output?: { voice?: string; format?: { encoding: "audio/pcm" }; volume?: number };
}

export type ServerEvent =
  | { type: "session.ready"; session_id: string; expires_at?: number }
  | { type: "session.updated" }
  | { type: "session.ended"; session_duration_seconds?: number }
  | { type: "session.error"; code?: string; error_code?: string; message?: string }
  | { type: "input.speech.started" }
  | { type: "input.speech.stopped" }
  | { type: "transcript.user.delta"; item_id?: string; text: string }
  | { type: "transcript.user"; item_id?: string; text: string }
  | { type: "reply.started"; reply_id?: string }
  | { type: "reply.audio"; data: string }
  | { type: "transcript.agent.delta"; reply_id?: string; delta: string }
  | { type: "transcript.agent"; reply_id?: string; text: string; interrupted?: boolean }
  | { type: "reply.done"; reply_id?: string; status?: "completed" | "interrupted" }
  | { type: "tool.call"; call_id: string; name: string; arguments: unknown };

export type ClientEvent =
  | { type: "session.update"; session: SessionConfig }
  | { type: "input.audio"; audio: string }
  | { type: "tool.result"; call_id: string; result: string; is_error?: boolean }
  | { type: "reply.create"; instructions?: string }
  | { type: "conversation.message"; role: "user" | "system"; content: string }
  | { type: "session.end" };

export interface PendingResult {
  call_id: string;
  result: string;
  is_error: boolean;
}

/**
 * Holds tool results until it is safe to send them. Sending while the agent is
 * mid-reply or while the user is talking breaks turn-taking.
 */
export class ToolResultGate {
  private last: string | null = null;
  private pending: PendingResult[] = [];

  constructor(private readonly send: (e: ClientEvent) => void) {}

  get pendingCount() {
    return this.pending.length;
  }

  get lastEvent() {
    return this.last;
  }

  enqueue(r: PendingResult) {
    this.pending.push(r);
    this.flushIfIdle();
  }

  observe(event: ServerEvent) {
    if (event.type === "reply.started" || event.type === "input.speech.started") {
      this.last = event.type;
    } else if (event.type === "reply.done") {
      this.last = "reply.done";
      if (event.status === "interrupted") this.pending = [];
      else this.flushIfIdle();
    }
  }

  private flushIfIdle() {
    if (this.last !== "reply.done" || !this.pending.length) return;
    const batch = this.pending;
    this.pending = [];
    for (const r of batch) this.send({ type: "tool.result", call_id: r.call_id, result: r.result, is_error: r.is_error });
  }
}

export type AgentStatus = "idle" | "connecting" | "listening" | "hearing" | "thinking" | "speaking" | "ending" | "error";

export interface ToolExecution {
  payload: Record<string, unknown>;
  isError: boolean;
}

export interface ProtocolHandlers {
  onStatus?(s: AgentStatus): void;
  onReady?(sessionId: string, expiresAt?: number): void;
  onUserPartial?(text: string): void;
  onUserFinal?(text: string): void;
  onAgentDelta?(replyId: string | undefined, word: string): void;
  onAgentFinal?(text: string, interrupted: boolean): void;
  onAudio?(base64: string): void;
  onFlushAudio?(): void;
  onToolCall(name: string, args: unknown, callId: string): ToolExecution;
  onError?(code: string, message: string, fatal: boolean): void;
  onEnded?(): void;
  onRaw?(direction: "in" | "out", type: string): void;
}

const RETRYABLE = new Set(["at_capacity", "concurrency_exceeded", "internal_error"]);
const NON_FATAL = new Set(["invalid_format", "invalid_audio", "invalid_value", "immutable_field", "invalid_config", "server_error"]);

export class AgentProtocol {
  readonly gate: ToolResultGate;
  private ready = false;
  private status: AgentStatus = "idle";
  private replyAudible = false;
  private ended = false;
  sessionId: string | null = null;

  constructor(
    private readonly transport: (e: ClientEvent) => void,
    private readonly h: ProtocolHandlers,
  ) {
    this.gate = new ToolResultGate((e) => this.send(e));
  }

  get isReady() {
    return this.ready;
  }

  private send(e: ClientEvent) {
    this.h.onRaw?.("out", e.type);
    this.transport(e);
  }

  private setStatus(s: AgentStatus) {
    if (s === this.status) return;
    this.status = s;
    this.h.onStatus?.(s);
  }

  /** First message after the socket opens. */
  start(config: SessionConfig) {
    this.setStatus("connecting");
    this.send({ type: "session.update", session: config });
  }

  /** Mid-session update of mutable fields (system_prompt, keyterms, tools, ...). */
  update(config: Pick<SessionConfig, "system_prompt" | "tools" | "input">) {
    if (!this.ready) return;
    this.send({ type: "session.update", session: config });
  }

  sendAudio(base64: string) {
    if (!this.ready || this.ended) return;
    this.transport({ type: "input.audio", audio: base64 });
  }

  /** Typed input routed through the real agent (command bar, benchmark). */
  sendText(text: string) {
    if (!this.ready) return;
    this.send({ type: "conversation.message", role: "user", content: text });
    this.send({ type: "reply.create" });
  }

  end() {
    if (this.ended) return;
    this.ended = true;
    this.setStatus("ending");
    this.send({ type: "session.end" });
  }

  handle(event: ServerEvent) {
    this.h.onRaw?.("in", event.type);
    this.gate.observe(event);
    switch (event.type) {
      case "session.ready":
        this.ready = true;
        this.sessionId = event.session_id;
        this.h.onReady?.(event.session_id, event.expires_at);
        this.setStatus("listening");
        break;
      case "input.speech.started":
        // Barge-in: stop the agent mid-word immediately.
        this.h.onFlushAudio?.();
        this.replyAudible = false;
        this.setStatus("hearing");
        break;
      case "input.speech.stopped":
        this.setStatus("thinking");
        break;
      case "transcript.user.delta":
        this.h.onUserPartial?.(event.text);
        break;
      case "transcript.user":
        this.h.onUserFinal?.(event.text);
        break;
      case "reply.started":
        this.replyAudible = false;
        this.setStatus("thinking");
        break;
      case "reply.audio":
        if (!this.replyAudible) {
          this.replyAudible = true;
          this.setStatus("speaking");
        }
        this.h.onAudio?.(event.data);
        break;
      case "transcript.agent.delta":
        this.h.onAgentDelta?.(event.reply_id, event.delta);
        break;
      case "transcript.agent":
        this.h.onAgentFinal?.(event.text, Boolean(event.interrupted));
        break;
      case "reply.done":
        if (event.status === "interrupted") this.h.onFlushAudio?.();
        this.setStatus(this.gate.pendingCount ? "thinking" : "listening");
        break;
      case "tool.call": {
        let exec: ToolExecution;
        try {
          exec = this.h.onToolCall(event.name, event.arguments, event.call_id);
        } catch (err) {
          exec = { payload: { ok: false, error: `Tool failed: ${(err as Error).message}` }, isError: true };
        }
        this.gate.enqueue({ call_id: event.call_id, result: JSON.stringify(exec.payload), is_error: exec.isError });
        this.setStatus("thinking");
        break;
      }
      case "session.error": {
        const code = event.code ?? event.error_code ?? "unknown";
        const fatal = !NON_FATAL.has(code) && !RETRYABLE.has(code);
        this.h.onError?.(code, event.message ?? "Voice session error", fatal);
        if (fatal) this.setStatus("error");
        break;
      }
      case "session.ended":
        this.ready = false;
        this.ended = true;
        this.setStatus("idle");
        this.h.onEnded?.();
        break;
      default:
        break;
    }
  }
}

export function isRetryable(code: string) {
  return RETRYABLE.has(code);
}
