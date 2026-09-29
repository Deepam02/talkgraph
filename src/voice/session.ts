/**
 * Browser voice session: one WebSocket to the AssemblyAI Voice Agent API,
 * authenticated with a short-lived server-minted token (the API key never
 * reaches the browser). Wires the protocol core to audio, the graph engine,
 * and the UI, and keeps the agent's view of the canvas current.
 */
import type { GraphEngine } from "@/engine/engine";
import { AudioIO } from "./audio";
import { initialSessionConfig, liveUpdate } from "./config";
import { AgentProtocol, VOICE_AGENT_WS_URL, type AgentStatus, type ServerEvent, type ToolExecution } from "./protocol";

export interface VoiceSessionHooks {
  onStatus(s: AgentStatus): void;
  onCaption(who: "user" | "agent", text: string, final: boolean): void;
  onToolCall(name: string, args: unknown): ToolExecution;
  onError(message: string): void;
  onEnded(): void;
  onReady?(expiresAt: number | null): void;
}

export class VoiceError extends Error {
  constructor(
    message: string,
    public readonly code: "not_configured" | "rate_limited" | "token" | "mic" | "network",
  ) {
    super(message);
  }
}

export async function fetchToken(): Promise<{ token: string; maxSessionSeconds: number }> {
  let res: Response;
  try {
    res = await fetch("/api/voice-token", { cache: "no-store" });
  } catch {
    throw new VoiceError("Couldn't reach the server to start voice.", "network");
  }
  if (res.status === 503) throw new VoiceError("Voice is off: the server has no AssemblyAI key. Typed commands still work.", "not_configured");
  if (res.status === 429) throw new VoiceError("Too many voice sessions just now. Try again in a minute.", "rate_limited");
  if (!res.ok) throw new VoiceError("Couldn't start a voice session. Check the AssemblyAI key on the server.", "token");
  return res.json();
}

export class VoiceSession {
  private ws: WebSocket | null = null;
  private proto: AgentProtocol | null = null;
  readonly audio = new AudioIO();
  private unsub: (() => void) | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastNames = "";
  private closed = false;
  private agentText = "";
  private liveReply: string | undefined;

  constructor(
    private readonly engine: GraphEngine,
    private readonly hooks: VoiceSessionHooks,
  ) {}

  get status() {
    return this.ws?.readyState;
  }

  /** Call from a click/keypress handler. */
  async start(): Promise<void> {
    this.hooks.onStatus("connecting");
    // Open audio first, inside the user gesture, then fetch the single-use token right before connecting.
    try {
      await this.audio.open();
    } catch {
      throw new VoiceError("This browser blocked audio playback.", "mic");
    }
    // Ask for the mic before minting a token, so a denied prompt never opens a billable session.
    try {
      await this.audio.startMic((b64) => this.proto?.sendAudio(b64));
    } catch {
      this.audio.close();
      throw new VoiceError("Microphone access was blocked. Allow it in the address bar, or type commands instead.", "mic");
    }
    let token: string;
    try {
      ({ token } = await fetchToken());
    } catch (err) {
      this.audio.close();
      throw err;
    }

    const url = new URL(VOICE_AGENT_WS_URL);
    url.searchParams.set("token", token);
    const ws = new WebSocket(url);
    this.ws = ws;

    const proto = new AgentProtocol((e) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(e)), {
      onStatus: (s) => this.hooks.onStatus(s),
      onReady: (_id, expiresAt) => this.hooks.onReady?.(expiresAt ? expiresAt * 1000 : null),
      onUserPartial: (t) => this.hooks.onCaption("user", t, false),
      onUserFinal: (t) => this.hooks.onCaption("user", t, true),
      onAgentDelta: (replyId, word) => {
        if (replyId !== this.liveReply) {
          this.liveReply = replyId;
          this.agentText = "";
        }
        this.agentText = this.agentText ? `${this.agentText} ${word}`.replace(/\s+([,.!?;:])/g, "$1") : word;
        this.hooks.onCaption("agent", this.agentText, false);
      },
      onAgentFinal: (text) => {
        this.agentText = "";
        this.liveReply = undefined;
        if (text.trim()) this.hooks.onCaption("agent", text, true);
      },
      onAudio: (b64) => this.audio.play(b64),
      onFlushAudio: () => this.audio.flush(),
      onToolCall: (name, args) => this.hooks.onToolCall(name, args),
      onError: (code, message, fatal) => {
        if (fatal) this.hooks.onError(humanError(code, message));
        else console.warn(`[voice] ${code}: ${message}`);
      },
      onEnded: () => this.cleanup(),
    });
    this.proto = proto;

    ws.onopen = () => {
      const state = this.engine.get();
      this.lastNames = state.graph.nodes.map((n) => n.name).join("|");
      proto.start(initialSessionConfig(state));
    };
    ws.onmessage = (ev) => {
      try {
        proto.handle(JSON.parse(ev.data as string) as ServerEvent);
      } catch (err) {
        console.warn("[voice] bad frame", err);
      }
    };
    ws.onclose = (ev) => {
      if (!this.closed && !proto.isReady) this.hooks.onError(ev.code === 1008 ? "The voice token was rejected. Try again." : "The voice connection closed before it was ready.");
      this.cleanup();
    };
    ws.onerror = () => {};

    // Keep the agent's picture of the canvas current: debounce, then send prompt (+ keyterms when names change).
    this.unsub = this.engine.subscribe(() => {
      if (this.pushTimer) clearTimeout(this.pushTimer);
      this.pushTimer = setTimeout(() => this.pushState(), 300);
    });

    window.addEventListener("pagehide", this.onPageHide);
  }

  private pushState() {
    if (!this.proto?.isReady) return;
    const state = this.engine.get();
    const names = state.graph.nodes.map((n) => n.name).join("|");
    const namesChanged = names !== this.lastNames;
    this.lastNames = names;
    this.proto.update(liveUpdate(state, namesChanged));
  }

  /** Route typed text through the live agent instead of the offline parser. */
  sendText(text: string): boolean {
    if (!this.proto?.isReady) return false;
    this.proto.sendText(text);
    return true;
  }

  setMuted(m: boolean) {
    this.audio.setMuted(m);
  }

  get ready() {
    return Boolean(this.proto?.isReady);
  }

  /** Clean shutdown: session.end, wait briefly for session.ended, then tear down. */
  stop() {
    if (this.closed) return;
    if (this.ws?.readyState === WebSocket.OPEN && this.proto) {
      this.proto.end();
      const ws = this.ws;
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) ws.close(1000);
        this.cleanup();
      }, 2500);
      this.audio.flush();
    } else {
      this.cleanup();
    }
  }

  private onPageHide = () => {
    // Synchronous: async work won't finish before the page is torn down.
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "session.end" }));
  };

  private cleanup() {
    if (this.closed) return;
    this.closed = true;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.unsub?.();
    window.removeEventListener("pagehide", this.onPageHide);
    this.audio.close();
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close(1000);
    this.hooks.onStatus("idle");
    this.hooks.onEnded();
  }
}

function humanError(code: string, message: string): string {
  switch (code) {
    case "UNAUTHORIZED":
    case "unauthorized":
      return "The voice token expired or was rejected. Start voice again.";
    case "at_capacity":
    case "server_error":
      return "The voice service is busy right now. Try again in a moment.";
    case "concurrency_exceeded":
      return "Too many voice sessions are open on this account.";
    case "session_expired":
      return "The voice session reached its time limit. Start a new one to keep going.";
    default:
      return message || "The voice session stopped unexpectedly.";
  }
}
