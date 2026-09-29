/**
 * Live benchmark driver: runs each scenario against the real AssemblyAI Voice
 * Agent. Turns are injected as text (`conversation.message` + `reply.create`)
 * so runs are repeatable; everything after that is the production path: the
 * agent's own tool calls, validated and applied by the same dispatcher, with
 * results returned under the same reply.done gating.
 */
import type { GraphEngine } from "@/engine/engine";
import { initialSessionConfig } from "@/voice/config";
import { executeTool } from "@/voice/dispatch";
import { AgentProtocol, VOICE_AGENT_WS_URL, type ServerEvent } from "@/voice/protocol";
import { fetchToken } from "@/voice/session";
import type { Driver, TurnLog } from "./run";

const QUIET_MS = 1600;
const TURN_TIMEOUT_MS = 30_000;

export function liveDriver(): Driver {
  let ws: WebSocket | null = null;
  let proto: AgentProtocol | null = null;
  let onEvent: ((e: ServerEvent) => void) | null = null;
  let calls: string[] = [];
  let replies: string[] = [];

  return {
    name: "live",
    async begin(engine: GraphEngine) {
      const { token } = await fetchToken();
      const url = new URL(VOICE_AGENT_WS_URL);
      url.searchParams.set("token", token);
      const socket = new WebSocket(url);
      ws = socket;
      proto = new AgentProtocol((e) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(e)), {
        onToolCall: (name, args) => {
          const o = executeTool(engine, name, args, "voice");
          calls.push(`${name}(${JSON.stringify(args)})${o.ok ? "" : " ✗"}`);
          return { payload: o.payload, isError: !o.ok && !o.needsConfirmation };
        },
        onAgentFinal: (text) => text && replies.push(text),
      });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Voice agent did not become ready")), 15_000);
        socket.onopen = () => proto!.start(initialSessionConfig(engine.get(), { greeting: false, volume: 0 }));
        socket.onmessage = (m) => {
          const e = JSON.parse(m.data as string) as ServerEvent;
          proto!.handle(e);
          onEvent?.(e);
          if (e.type === "session.ready") {
            clearTimeout(timer);
            resolve();
          }
          if (e.type === "session.error" && !proto!.isReady) {
            clearTimeout(timer);
            reject(new Error(e.message ?? "session error"));
          }
        };
        socket.onclose = () => {
          clearTimeout(timer);
          reject(new Error("Connection closed"));
        };
      });
    },

    async turn(_engine, text): Promise<TurnLog> {
      if (!proto || !ws) throw new Error("Live session not started");
      calls = [];
      replies = [];
      const done = new Promise<void>((resolve) => {
        let quiet: ReturnType<typeof setTimeout> | null = null;
        const hard = setTimeout(finish, TURN_TIMEOUT_MS);
        function finish() {
          if (quiet) clearTimeout(quiet);
          clearTimeout(hard);
          onEvent = null;
          resolve();
        }
        onEvent = (e) => {
          if (e.type === "reply.started" || e.type === "tool.call") {
            if (quiet) clearTimeout(quiet);
            quiet = null;
          }
          if (e.type === "reply.done" && proto!.gate.pendingCount === 0) {
            if (quiet) clearTimeout(quiet);
            quiet = setTimeout(finish, QUIET_MS);
          }
        };
      });
      proto.sendText(text);
      await done;
      return { text, calls: [...calls], reply: replies.join(" ") };
    },

    async end() {
      if (proto && ws?.readyState === WebSocket.OPEN) proto.end();
      const socket = ws;
      setTimeout(() => socket && socket.readyState <= WebSocket.OPEN && socket.close(1000), 1500);
      ws = null;
      proto = null;
    },
  };
}
