"use client";

import Link from "next/link";
import { Check, ChevronDown, Mic, Play, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { liveDriver } from "@/bench/live-driver";
import { offlineDriver, runAll, type ScenarioRun } from "@/bench/run";
import { SCENARIOS } from "@/bench/scenarios";
import { Wordmark } from "../Logo";

type Mode = "offline" | "live";

export function BenchView() {
  const [runs, setRuns] = useState<Record<Mode, ScenarioRun[]>>({ offline: [], live: [] });
  const [running, setRunning] = useState<Mode | null>(null);
  const [mode, setMode] = useState<Mode>("offline");
  const [voice, setVoice] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const runId = useRef(0);
  const run = useCallback(async (m: Mode) => {
    const id = ++runId.current;
    setMode(m);
    setRunning(m);
    setError(null);
    setRuns((r) => ({ ...r, [m]: [] }));
    try {
      await runAll(m === "offline" ? offlineDriver() : liveDriver(), SCENARIOS, (r) => {
        if (id === runId.current) setRuns((prev) => ({ ...prev, [m]: [...prev[m], r] }));
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (id === runId.current) setRunning(null);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void run("offline"), 0);
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => setVoice(Boolean(h.voice)))
      .catch(() => setVoice(false));
    return () => clearTimeout(t);
  }, [run]);

  const list = runs[mode];
  const passed = list.filter((r) => r.pass).length;
  const pct = list.length ? Math.round((passed / list.length) * 100) : 0;
  const avgMs = list.length ? Math.round(list.reduce((s, r) => s + r.ms, 0) / list.length) : 0;

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-[1100px] items-center justify-between px-5 py-5 md:px-8">
        <Link href="/">
          <Wordmark />
        </Link>
        <Link href="/app" className="btn btn-primary">
          Open the canvas
        </Link>
      </header>

      <main className="mx-auto max-w-[1100px] px-5 pb-20 md:px-8">
        <h1 className="mt-6 font-display text-[clamp(2.2rem,5vw,3.6rem)] font-semibold leading-[0.98] tracking-[-0.04em]">Does it do what you said?</h1>
        <p className="mt-4 max-w-[44rem] text-[16px] leading-relaxed text-ink-soft">
          Each scenario is something people actually say to a whiteboard, paired with the graph that should exist afterwards. We score the resulting typed graph, never the agent&rsquo;s words. Offline runs the deterministic command parser (it also runs in CI). Live sends the same turns to the AssemblyAI Voice Agent and applies its own tool calls.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="glass min-w-0 self-start rounded-[26px] p-6">
            <div className="flex gap-1 rounded-[14px] bg-ink/[0.045] p-0.5">
              {(["offline", "live"] as Mode[]).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded-[11px] py-1.5 text-[13px] font-medium transition ${mode === m ? "bg-white/90 text-ink shadow-sm" : "text-ink-soft"}`}>
                  {m === "offline" ? "Offline parser" : "Live voice agent"}
                </button>
              ))}
            </div>
            <div className="mt-6 font-display text-[72px] font-semibold leading-none tracking-[-0.05em] tabular-nums" style={{ color: pct === 100 ? "#5B6CFF" : pct >= 80 ? "#1E2340" : "#F43F5E" }}>
              {list.length ? `${pct}%` : "—"}
            </div>
            <p className="mt-2 text-[14px] text-ink-soft">
              {list.length ? `${passed} of ${list.length} scenarios pass` : mode === "live" ? "Not run yet" : "Running"}
              {running === mode && ` (running ${list.length + 1} of ${SCENARIOS.length})`}
            </p>
            {list.length > 0 && <p className="mt-1 text-[13px] text-ink-faint">Average {avgMs < 1000 ? `${avgMs} ms` : `${(avgMs / 1000).toFixed(1)} s`} per scenario</p>}
            <div className="mt-6 flex flex-col gap-2">
              <button type="button" className="btn btn-quiet justify-center" disabled={running !== null} onClick={() => run("offline")}>
                <Play size={14} /> Run offline
              </button>
              <button type="button" className="btn btn-primary justify-center" disabled={running !== null || voice === false} onClick={() => run("live")}>
                <Mic size={14} /> Run against the live agent
              </button>
              {voice === false && <p className="text-[12.5px] leading-snug text-ink-faint">Live runs need ASSEMBLYAI_API_KEY on the server. Each scenario opens its own short session.</p>}
              {error && <p className="text-[12.5px] text-rose">{error}</p>}
            </div>
          </div>

          <ul className="min-w-0 space-y-2">
            {SCENARIOS.map((s) => {
              const r = list.find((x) => x.scenario.id === s.id);
              const isOpen = open === s.id;
              return (
                <li key={s.id} className="glass overflow-hidden rounded-2xl">
                  <button type="button" onClick={() => setOpen(isOpen ? null : s.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <span
                      className="grid size-6 shrink-0 place-items-center rounded-full"
                      style={{ background: !r ? "rgba(30,35,64,0.06)" : r.pass ? "rgba(91,108,255,0.14)" : "rgba(244,63,94,0.14)", color: !r ? "#8A8FB3" : r.pass ? "#5B6CFF" : "#F43F5E" }}
                    >
                      {!r ? <span className="size-1.5 rounded-full bg-current" /> : r.pass ? <Check size={14} /> : <X size={14} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-ink">{s.title}</span>
                      <span className="block truncate text-[13px] text-ink-soft">&ldquo;{s.turns.join("” → “")}&rdquo;</span>
                    </span>
                    <span className="hidden text-[12px] text-ink-faint sm:block">{s.tags.slice(0, 2).join(", ")}</span>
                    <ChevronDown size={16} className={`text-ink-faint transition ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="border-t border-ink/8 px-4 py-3 text-[12.5px]">
                      {r ? (
                        <>
                          {r.turns.map((t, i) => (
                            <div key={i} className="mb-2">
                              <div className="font-medium text-ink">&ldquo;{t.text}&rdquo;</div>
                              {t.calls.map((c, j) => (
                                <div key={j} className="mt-0.5 break-all font-mono text-[11.5px] text-ink-soft">
                                  {c}
                                </div>
                              ))}
                              {t.reply && <div className="mt-0.5 text-violet">{t.reply}</div>}
                              {t.error && <div className="mt-0.5 text-rose">{t.error}</div>}
                            </div>
                          ))}
                          <ul className="mt-2 space-y-0.5">
                            {r.results.map((x, i) => (
                              <li key={i} className={x.pass ? "text-ink-soft" : "text-rose"}>
                                {x.pass ? "✓" : "✗"} {x.detail}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <span className="text-ink-faint">Not run in this mode yet.</span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </main>
    </div>
  );
}
