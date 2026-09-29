"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { PRODUCT } from "@/config/product";
import { HeroDemo } from "../landing/HeroDemo";
import { LogoMark, Wordmark } from "../Logo";

interface Stats {
  passed: number;
  total: number;
  components: number;
  tools: number;
}

function Slide({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`deck-slide relative flex h-full w-full flex-col px-[6%] py-[5%] ${className}`}>{children}</section>;
}

function H({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-[clamp(1.8rem,3.6vw,3.2rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-ink">{children}</h2>;
}

function Points({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-[4%] grid flex-1 content-start gap-x-10 gap-y-6 md:grid-cols-2">
      {items.map(([t, b]) => (
        <div key={t} className="border-t border-ink/10 pt-4">
          <h3 className="font-display text-[clamp(1.05rem,1.6vw,1.4rem)] font-semibold tracking-[-0.02em]">{t}</h3>
          <p className="mt-1.5 text-[clamp(0.85rem,1.15vw,1.02rem)] leading-relaxed text-ink-soft">{b}</p>
        </div>
      ))}
    </div>
  );
}

export function Deck({ stats }: { stats: Stats }) {
  const slides: ReactNode[] = [
    <Slide key="title" className="justify-between">
      <Wordmark size={34} />
      <div>
        <h1 className="max-w-[14ch] font-display text-[clamp(2.8rem,6.6vw,6rem)] font-semibold leading-[0.93] tracking-[-0.05em]">{PRODUCT.tagline}</h1>
        <p className="mt-6 max-w-[40rem] text-[clamp(1rem,1.5vw,1.3rem)] leading-relaxed text-ink-soft">
          A voice-controlled architecture canvas. Describe a system out loud; it draws, validates, and stress-tests itself in place.
        </p>
      </div>
      <p className="text-[14px] text-ink-faint">AssemblyAI Voice Agent Hackathon, 2026</p>
    </Slide>,

    <Slide key="problem">
      <H>Systems are designed in conversation. Diagrams are drawn afterwards, by hand, and nobody checks them.</H>
      <Points
        items={[
          ["The whiteboard photo", "Design reviews end with a blurry photo and a promise to “clean it up later”. The decision record never gets written."],
          ["Diagram tools are slower than talking", "Dragging boxes breaks the flow of a design discussion, so the diagram lags the conversation or gets skipped."],
          ["Text-to-diagram draws anything", "One-shot generators happily connect a browser to a database. They don't know the rules, so they don't push back."],
          ["Failure modes surface in production", "Single points of failure and synchronous chains are obvious in hindsight, and invisible on a static diagram."],
        ]}
      />
    </Slide>,

    <Slide key="demo" className="!px-[3%] !py-[3%]">
      <div className="mb-3 flex items-baseline justify-between px-[3%]">
        <H>Say it. Watch it build, break, and heal.</H>
        <span className="hidden text-[13px] text-ink-faint md:block">Live, running the real engine</span>
      </div>
      <div className="glass relative flex-1 overflow-hidden rounded-[26px]">
        <div aria-hidden className="dot-grid absolute inset-0 opacity-70" />
        <HeroDemo />
      </div>
    </Slide>,

    <Slide key="how">
      <H>How it uses the AssemblyAI Voice Agent API</H>
      <Points
        items={[
          ["One socket, no exposed keys", "The server mints a single-use token; the browser opens one WebSocket, streams 24 kHz PCM, and ends every session with session.end."],
          [`${stats.tools} general tools, strict schemas`, "Add, connect, insert, update, remove, simulate, review, canvas. Enums come from the catalog, and every call is validated locally before it touches the graph."],
          ["Edits land instantly, results wait their turn", "Each tool.call applies immediately; tool.result is held until reply.done is the latest event, so turn-taking never breaks."],
          ["The agent always sees the canvas", "After every edit, session.update pushes the live graph into system_prompt and refreshes keyterms with your own component names."],
          ["Barge-in and voice undo", "Speech flushes playback mid-word. “Undo that” and “redo” are just tools."],
          ["Measured, not vibes", `The same scenarios run offline in CI and live against the agent via conversation.message: ${stats.passed}/${stats.total} pass offline.`],
        ]}
      />
    </Slide>,

    <Slide key="diff">
      <H>What makes it different</H>
      <Points
        items={[
          ["Edits in place, not regenerate", "Every utterance is a small, typed, undoable edit to the existing diagram, with animation that shows exactly what changed."],
          ["A rules engine with a voice", "Illegal connections are rejected and explained out loud with a fix. Inferred choices are badged, explained, and one tap to undo."],
          ["Architecture you can crash", "Traffic simulation and chaos mode turn a static picture into a model: overloads, cascading failure, failover, and remedies."],
          ["Artifacts from the typed graph", "Terraform, Mermaid, and ADR exports are generated from the same model, so they can't drift from the picture."],
        ]}
      />
    </Slide>,

    <Slide key="business">
      <H>Business</H>
      <Points
        items={[
          ["Who pays", "Engineering teams that run design reviews, and solutions-engineering teams that draw customer architectures on calls."],
          ["How it spreads", "Diagrams leave the tool as Mermaid in PRs and ADRs in repos, each one a link back. Free solo tier, paid team workspaces."],
          ["Pricing", "Solo free. Team $18 per editor per month with unlimited voice and shared history. Enterprise with SSO and bring-your-own LLM through AssemblyAI."],
          ["Unit economics", "Voice minutes are the main cost and scale with usage; typed editing, linting, simulation, and exports run entirely in the browser."],
        ]}
      />
    </Slide>,

    <Slide key="quality">
      <H>Built to keep</H>
      <Points
        items={[
          ["Typed domain core", `A headless engine: ${stats.components} catalog components, legality rules, inference, deterministic layout, linter, simulation, remedies. No React, fully unit-tested.`],
          ["One path for every input", "Voice, typed commands, drag and drop, and one-tap fixes all compile to the same validated commands, so behavior is identical everywhere."],
          ["Storage behind an interface", "Local by default; set two environment variables and diagrams and version history move to Redis. Share links encode the graph."],
          ["Product name in one constant", "Rename, re-voice, or re-greet the product by editing a single config file."],
        ]}
      />
    </Slide>,

    <Slide key="next">
      <H>What&rsquo;s next</H>
      <Points
        items={[
          ["Multiplayer rooms", "Several voices, one canvas, with speaker-aware edits during a live design review."],
          ["Import what exists", "Read Terraform, Kubernetes manifests, or a cloud account to start from the real system."],
          ["Cost and latency estimates", "Attach price and p99 models to the catalog and simulate them alongside load."],
          ["Dial in to the canvas", "AssemblyAI's SIP support lets someone describe an incident from a phone while the team watches it draw."],
        ]}
      />
    </Slide>,

    <Slide key="close" className="items-start justify-center">
      <LogoMark size={56} />
      <h2 className="mt-8 max-w-[16ch] font-display text-[clamp(2.4rem,5.4vw,4.8rem)] font-semibold leading-[0.95] tracking-[-0.05em]">Say the first component.</h2>
      <p className="mt-5 text-[clamp(1rem,1.5vw,1.3rem)] text-ink-soft">{PRODUCT.url.replace(/^https?:\/\//, "")}</p>
    </Slide>,
  ];

  const [i, setI] = useState(0);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const on = () => setPrinting(true);
    const off = () => setPrinting(false);
    window.addEventListener("beforeprint", on);
    window.addEventListener("afterprint", off);
    return () => {
      window.removeEventListener("beforeprint", on);
      window.removeEventListener("afterprint", off);
    };
  }, []);
  const go = useCallback((d: number) => setI((x) => Math.max(0, Math.min(slides.length - 1, x + d))), [slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        go(1);
      } else if (["ArrowLeft", "PageUp"].includes(e.key)) go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <div className="deck-root flex min-h-dvh flex-col items-center justify-center p-4 print:block print:p-0">
      <div className="deck-stage glass-strong relative aspect-[16/9] w-full max-w-[min(1280px,calc((100dvh-7rem)*16/9))] overflow-hidden rounded-[28px] print:hidden">
        {slides[i]}
      </div>
      <div className="mt-4 flex items-center gap-2 print:hidden">
        <Link href="/" className="btn">
          Home
        </Link>
        <button type="button" className="btn btn-icon" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous slide">
          <ChevronLeft size={18} />
        </button>
        <span className="w-14 text-center text-[13px] tabular-nums text-ink-soft">
          {i + 1} / {slides.length}
        </span>
        <button type="button" className="btn btn-icon" onClick={() => go(1)} disabled={i === slides.length - 1} aria-label="Next slide">
          <ChevronRight size={18} />
        </button>
        <button type="button" className="btn" onClick={() => window.print()}>
          <Printer size={15} /> Save as PDF
        </button>
      </div>
      {/* Print: every slide on its own landscape page. */}
      {printing && (
      <div className="hidden print:block">
        {slides.map((s, k) => (
          <div key={k} className="deck-print-page">
            {s}
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
