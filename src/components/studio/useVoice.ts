"use client";

import { useCallback, useEffect, useRef } from "react";
import { useStudio } from "@/store/studio";
import { VoiceError, VoiceSession } from "@/voice/session";

let active: VoiceSession | null = null;

/** Exposes the live session (if any) to other components, e.g. the command bar. */
export function activeVoiceSession() {
  return active;
}

export function useVoice() {
  const engine = useStudio((s) => s.engine);
  const status = useStudio((s) => s.voice.status);
  const configured = useStudio((s) => s.voice.configured);
  const starting = useRef(false);

  const stop = useCallback(() => {
    active?.stop();
  }, []);

  const start = useCallback(async () => {
    if (active || starting.current) return;
    const st = useStudio.getState();
    if (st.voice.configured === false) {
      st.pushToast({
        kind: "info",
        source: "system",
        title: "Voice is off on this deployment",
        detail: "Add ASSEMBLYAI_API_KEY on the server to talk to the canvas. Typed commands work the same way.",
      });
      return;
    }
    starting.current = true;
    st.setVoice({ error: null, captions: [] });
    const session = new VoiceSession(engine, {
      onStatus: (s) => useStudio.getState().setVoice({ status: s }),
      onCaption: (who, text, final) => useStudio.getState().addCaption({ who, text, final }),
      onToolCall: (name, args) => {
        const o = useStudio.getState().runTool(name, args, "voice");
        return { payload: o.payload, isError: !o.ok && !o.needsConfirmation };
      },
      onError: (message) => {
        useStudio.getState().setVoice({ error: message });
        useStudio.getState().pushToast({ kind: "error", source: "voice", title: message });
      },
      onReady: (expiresAt) => useStudio.getState().setVoice({ sessionEndsAt: expiresAt }),
      onEnded: () => {
        active = null;
        useStudio.getState().setVoice({ status: "idle", sessionEndsAt: null });
      },
    });
    active = session;
    try {
      await session.start();
    } catch (err) {
      active = null;
      session.stop();
      const message = err instanceof VoiceError ? err.message : "Couldn't start voice.";
      if (err instanceof VoiceError && err.code === "not_configured") useStudio.getState().setVoice({ configured: false });
      useStudio.getState().setVoice({ status: "idle", error: message });
      useStudio.getState().pushToast({ kind: "error", source: "voice", title: message });
    } finally {
      starting.current = false;
    }
  }, [engine]);

  const toggle = useCallback(() => {
    if (active) stop();
    else void start();
  }, [start, stop]);

  useEffect(() => () => active?.stop(), []);

  const live = status !== "idle" && status !== "error";
  return { status, live, configured, start, stop, toggle };
}
