"use client";

import { AnimatePresence, motion } from "motion/react";
import { CornerDownLeft, Mic, MicOff, Square, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStudio } from "@/store/studio";
import { useNow } from "@/lib/useNow";
import { level } from "@/voice/audio";
import { activeVoiceSession, useVoice } from "./useVoice";

const STATUS_LABEL: Record<string, string> = {
  idle: "Talk",
  connecting: "Connecting",
  listening: "Listening",
  hearing: "Hearing you",
  thinking: "Working",
  speaking: "Speaking",
  ending: "Ending",
  error: "Voice error",
};

const STARTERS_EMPTY = [
  "Add a web app and an API",
  "Load the e-commerce template",
  "Add a mobile app, an API gateway and an orders service",
];
const STARTERS_SMALL = ["Add a Postgres behind the API, put a queue between them", "Put a Redis cache in front of the database", "What's wrong with this design?"];
const STARTERS_BUILT = ["Simulate 10x traffic", "Kill the orders database", "Export the Terraform"];

/** Radial waveform around the mic orb, fed by the mic and agent analysers. */
function Waveform({ live }: { live: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const size = 96;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    const scratch = new Uint8Array(256);
    const freq = new Uint8Array(128);
    let raf = 0;
    let t = 0;
    let smoothMic = 0;
    let smoothOut = 0;
    const BARS = 48;
    const draw = () => {
      t += 1 / 60;
      const audio = activeVoiceSession()?.audio;
      const mic = level(audio?.micAnalyser ?? null, scratch);
      const out = level(audio?.outAnalyser ?? null, scratch);
      smoothMic += (mic - smoothMic) * 0.25;
      smoothOut += (out - smoothOut) * 0.25;
      const src = smoothOut > smoothMic ? audio?.outAnalyser : audio?.micAnalyser;
      if (src) src.getByteFrequencyData(freq);
      else freq.fill(0);
      const agent = smoothOut > smoothMic;
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const r0 = 31;
      for (let i = 0; i < BARS; i++) {
        const a = (i / BARS) * Math.PI * 2 - Math.PI / 2;
        const bin = freq[Math.floor(((i < BARS / 2 ? i : BARS - i) / (BARS / 2)) * 40) + 2] / 255;
        const idle = live ? 0.06 + 0.05 * Math.sin(t * 2.2 + i * 0.5) : 0.03 + 0.02 * Math.sin(t * 1.4 + i * 0.4);
        const amp = Math.max(idle, bin * (0.55 + Math.max(smoothMic, smoothOut)));
        const len = 3 + amp * 13;
        ctx.strokeStyle = agent ? `rgba(139,92,246,${0.35 + amp * 0.6})` : `rgba(91,108,255,${0.3 + amp * 0.65})`;
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * (r0 + len), cx + Math.sin(a) * (r0 + len));
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [live]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-24 -translate-x-1/2 -translate-y-1/2" />;
}

export function VoiceDock() {
  const { status, live, configured, toggle } = useVoice();
  const captions = useStudio((s) => s.voice.captions);
  const nodeCount = useStudio((s) => s.snap.graph.nodes.length);
  const findings = useStudio((s) => s.snap.findings);
  const sim = useStudio((s) => s.snap.sim);
  const { runText, commit, runTool, addCaption } = useStudio.getState();
  const [text, setText] = useState("");
  const [muted, setMuted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const now = useNow();

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener("tg:focus-command", focus);
    return () => window.removeEventListener("tg:focus-command", focus);
  }, []);

  const send = (value: string) => {
    const v = value.trim();
    if (!v) return;
    const session = activeVoiceSession();
    if (session?.ready) {
      addCaption({ who: "user", text: v, final: true });
      session.sendText(v);
    } else {
      runText(v);
    }
  };

  const recent = captions.filter((c) => now - c.at < 14000 || !c.final).slice(-2);
  const failing = sim ? Object.values(sim.result.nodes).some((n) => n.health === "failed" || (n.health === "down" && !n.failoverTo)) : false;
  const fixChips = !sim ? findings.filter((f) => f.fix && f.severity !== "low").slice(0, 2) : [];
  const starters = nodeCount === 0 ? STARTERS_EMPTY : nodeCount < 5 ? STARTERS_SMALL : STARTERS_BUILT;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex flex-col items-center gap-3 px-4">
      {/* Live captions */}
      <div className="flex min-h-[3.25rem] w-full max-w-[640px] flex-col items-center justify-end gap-1.5" aria-live="polite">
        <AnimatePresence initial={false}>
          {recent.map((c) => (
            <motion.p
              key={`${c.who}-${c.at}`}
              layout
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className={`max-w-full rounded-2xl px-3.5 py-1.5 text-center text-[14px] leading-snug ${c.who === "user" ? "bg-white/55 text-ink-soft backdrop-blur" : "bg-violet/10 font-medium text-ink backdrop-blur"}`}
            >
              {c.text}
            </motion.p>
          ))}
        </AnimatePresence>
      </div>

      {/* Suggestion chips */}
      <div className="pointer-events-auto flex max-w-[780px] flex-wrap justify-center gap-2">
        {failing && (
          <button type="button" className="chip !border-rose/30 !bg-rose/10 !text-rose" onClick={() => runTool("simulate", { action: "fix" }, "ui")}>
            <Wand2 size={13} /> Fix it
          </button>
        )}
        {fixChips.map((f) => (
          <button key={f.id} type="button" className="chip" onClick={() => commit(f.fix!.commands, "fix", `Fixed: ${f.title}`)} title={f.message}>
            <span className="size-1.5 rounded-full" style={{ background: f.severity === "high" ? "#F43F5E" : "#F59E0B" }} />
            {f.title}
            <span className="font-semibold text-indigo">{f.fix!.label}</span>
          </button>
        ))}
        {!fixChips.length &&
          !failing &&
          starters.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => send(s)}>
              &ldquo;{s}&rdquo;
            </button>
          ))}
      </div>

      {/* Dock */}
      <div className="glass-strong pointer-events-auto flex h-[68px] w-full max-w-[640px] items-center gap-3 rounded-[26px] pl-2.5 pr-3">
        <div className="relative size-[52px] shrink-0">
          <Waveform live={live} />
          <button
            type="button"
            onClick={toggle}
            aria-pressed={live}
            aria-label={live ? "Stop voice" : "Start voice"}
            title={live ? "Stop voice (Space)" : "Talk (Space)"}
            className="relative grid size-[52px] place-items-center rounded-full text-white transition-transform active:scale-95"
            style={{
              background: live ? "linear-gradient(145deg,#8B5CF6,#5B6CFF)" : "linear-gradient(145deg,#6B7BFF,#5B6CFF)",
              boxShadow: live ? "0 0 0 5px rgba(139,92,246,0.18), 0 12px 28px -8px rgba(91,108,255,0.8)" : "0 10px 24px -8px rgba(91,108,255,0.75), inset 0 1px 0 rgba(255,255,255,0.3)",
            }}
          >
            {status === "connecting" ? <span className="tg-breathe size-3 rounded-full bg-white" /> : live ? <Square size={16} fill="currentColor" /> : <Mic size={21} />}
          </button>
        </div>

        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
            setText("");
          }}
        >
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Command"
            placeholder={live ? "Speak, or type to the agent" : "Say or type what to build, like “add Redis in front of the database”"}
            className="h-10 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
          />
          {text ? (
            <button type="submit" className="btn btn-icon !size-8 text-indigo" aria-label="Run command">
              <CornerDownLeft size={16} />
            </button>
          ) : (
            <kbd className="hidden sm:inline">Ctrl K</kbd>
          )}
        </form>

        <div className="flex shrink-0 items-center gap-1.5">
          {live && (
            <button
              type="button"
              className="btn btn-icon !size-8"
              aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              onClick={() => {
                activeVoiceSession()?.setMuted(!muted);
                setMuted(!muted);
              }}
            >
              {muted ? <MicOff size={15} className="text-rose" /> : <Mic size={15} />}
            </button>
          )}
          <span className={`w-[5.5rem] text-right text-[12px] font-medium ${live ? "text-violet" : "text-ink-faint"}`}>
            {configured === false && !live ? "Voice off" : STATUS_LABEL[status] ?? status}
          </span>
        </div>
      </div>
    </div>
  );
}
