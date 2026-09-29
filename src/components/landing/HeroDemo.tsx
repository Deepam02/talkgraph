"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Mic } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { GraphEngine } from "@/engine/engine";
import { CommandRunner } from "@/nlu/runner";
import { CanvasView } from "../canvas/CanvasView";

/** A scripted session run through the real engine, parser, and canvas. */
const SCRIPT: { say: string; reply: string }[] = [
  { say: "Add a web app, an API gateway and an orders service.", reply: "Done. The gateway routes to orders." },
  { say: "Put Postgres behind orders, then put a queue between them.", reply: "Queue's in. I added a worker to drain it into Postgres." },
  { say: "Put a Redis cache in front of the database.", reply: "Cached. Reads hit Redis first." },
  { say: "Simulate ten x traffic.", reply: "Orders is overloaded, and the gateway is right behind it." },
  { say: "Fix it.", reply: "Scaled both out. Zero errors at ten x." },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function HeroDemo() {
  const engine = useMemo(() => new GraphEngine(), []);
  const runner = useMemo(() => new CommandRunner(engine), [engine]);
  const state = useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.get(),
    () => engine.get(),
  );
  const reduce = useReducedMotion();
  const [said, setSaid] = useState("");
  const [reply, setReply] = useState("");
  const [speaking, setSpeaking] = useState<"user" | "agent" | null>(null);
  const [fit, setFit] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      await sleep(700);
      while (alive) {
        engine.load({ nodes: [], edges: [], seq: 0 }, "Demo");
        runner.reset();
        setReply("");
        setSaid("");
        for (const step of SCRIPT) {
          if (!alive) return;
          setSpeaking("user");
          const words = step.say.split(" ");
          for (let i = 1; i <= words.length; i++) {
            if (!alive) return;
            setSaid(words.slice(0, i).join(" "));
            await sleep(reduce ? 0 : 150);
          }
          await sleep(350);
          runner.run(step.say, "voice");
          setFit((f) => f + 1);
          setSpeaking("agent");
          await sleep(500);
          setReply(step.reply);
          await sleep(2300);
        }
        setSpeaking(null);
        await sleep(3200);
        engine.stopSim();
      }
    })();
    return () => {
      alive = false;
    };
  }, [engine, runner, reduce]);

  return (
    <div className="relative h-full w-full">
      <ReactFlowProvider>
        <CanvasView
          graph={state.graph}
          sim={state.sim?.result ?? null}
          findings={[]}
          interactive={false}
          fitSignal={fit}
          fitInsets={{ top: 36, left: 40, right: 40, bottom: 130 }}
          maxFitZoom={1}
        />
      </ReactFlowProvider>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4">
        <AnimatePresence mode="popLayout">
          {reply && (
            <motion.p
              key={reply}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl bg-violet/10 px-3.5 py-1.5 text-center text-[13.5px] font-medium text-ink backdrop-blur"
            >
              {reply}
            </motion.p>
          )}
        </AnimatePresence>
        <div className="glass-strong flex w-full max-w-[520px] items-center gap-3 rounded-[22px] py-2 pl-2 pr-4">
          <span
            className="relative grid size-10 shrink-0 place-items-center rounded-full text-white"
            style={{ background: "linear-gradient(145deg,#8B5CF6,#5B6CFF)", boxShadow: "0 8px 20px -8px rgba(91,108,255,0.8)" }}
          >
            {speaking === "user" && <span className="absolute inset-0 animate-ping rounded-full bg-indigo/40" />}
            <Mic size={17} />
          </span>
          <p className="min-h-[1.25rem] flex-1 truncate text-[14px] text-ink" aria-live="off">
            {said || <span className="text-ink-faint">Listening</span>}
          </p>
        </div>
      </div>
    </div>
  );
}
