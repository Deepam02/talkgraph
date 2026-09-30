import Link from "next/link";
import { Activity, ArrowRight, GraduationCap, Headset, Mic, Rocket, ShieldCheck, Siren, Users } from "lucide-react";
import { runAll, offlineDriver } from "@/bench/run";
import { HeroDemo } from "@/components/landing/HeroDemo";
import { Navbar } from "@/components/landing/Navbar";
import { Wordmark } from "@/components/Logo";
import { PRODUCT } from "@/config/product";
import { COMPONENTS } from "@/domain/catalog";
import { agentTools } from "@/voice/tools";

export const dynamic = "force-static";

const STEPS = [
  {
    icon: Mic,
    title: "You say it",
    body: "AssemblyAI's Voice Agent hears you over one WebSocket, with keyterms drawn from the component catalog so Kafka, pgvector, and your own service names come through right. Interrupt it any time.",
  },
  {
    icon: ShieldCheck,
    title: "It's checked before it's drawn",
    body: "The agent can only act through typed tools against an allowlisted catalog. Illegal links, like a browser talking straight to Postgres, are refused out loud with a one-tap fix.",
  },
  {
    icon: Activity,
    title: "It's stress-tested",
    body: "A live linter flags single points of failure, missing caches and queues, and plaintext links. Say “simulate 10x traffic” or “kill the database”, then “fix it”.",
  },
  {
    icon: Rocket,
    title: "It ships",
    body: "Export a Terraform skeleton, a Mermaid diagram, or an architecture decision record, all generated from the same typed graph you see on screen.",
  },
];

const AUDIENCES = [
  { icon: Users, who: "Design reviews", what: "Sketch the proposal live while the room talks, and leave with an ADR instead of a whiteboard photo." },
  { icon: Headset, who: "Solutions engineers", what: "Draw the customer's architecture on the call, in their words, and send the diagram before the call ends." },
  { icon: Siren, who: "Incident postmortems", what: "Rebuild what failed, kill the component that went down, and show which fix would have held." },
  { icon: GraduationCap, who: "Interview prep", what: "Practice system design out loud against a partner that pushes back when a design won't scale." },
];

const H2 = "font-display text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-ink";
const EYEBROW = "text-[13px] font-semibold uppercase tracking-[0.14em] text-indigo";

export default async function Landing() {
  const bench = await runAll(offlineDriver());
  const tools = agentTools().length;

  const stats = [
    [`${bench.passed}/${bench.total}`, "spoken scenarios pass the benchmark"],
    [`${COMPONENTS.length}`, "components in the typed catalog"],
    [`${tools}`, "general tools, strict JSON schemas"],
    ["0", "components the agent can invent"],
  ];

  return (
    <div className="relative overflow-x-hidden">
      <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_60%)]" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-240px] h-[620px] w-[1100px] -translate-x-1/2 rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(91,108,255,0.28), rgba(139,92,246,0.14), transparent)" }}
      />

      <Navbar />

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto max-w-[1180px] px-5 pb-16 pt-8 text-center md:px-8 lg:pt-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/55 px-3.5 py-1.5 text-[13px] font-medium text-ink-soft shadow-sm">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-indigo/60" />
              <span className="relative size-2 rounded-full bg-indigo" />
            </span>
            Voice-first architecture canvas
          </p>
          <h1 className="mx-auto mt-6 max-w-[16ch] font-display text-[clamp(2.75rem,7vw,6rem)] font-semibold leading-[0.95] tracking-[-0.05em] text-ink">
            Talk your architecture{" "}
            <span className="bg-gradient-to-r from-indigo via-violet to-fuchsia bg-clip-text text-transparent">into existence.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-[36rem] text-[17.5px] leading-relaxed text-ink-soft">
            Describe a system out loud. {PRODUCT.name} draws it as you speak, checks it against real architecture rules, and stress-tests it before anyone writes a line of Terraform.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/app" className="btn btn-primary group !h-12 !rounded-2xl !px-6 !text-[15px]">
              Open the canvas
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link href="/bench" className="btn btn-quiet !h-12 !rounded-2xl !px-5 !text-[15px]">
              See the benchmark
            </Link>
          </div>
          <p className="mt-4 text-[13px] text-ink-faint">No sign-up. Works with a mic, a keyboard, or a mouse.</p>

          {/* Demo window */}
          <div className="relative mx-auto mt-14 max-w-[1100px]">
            <div aria-hidden className="absolute -inset-4 -z-10 rounded-[40px] bg-gradient-to-br from-indigo/25 via-violet/15 to-fuchsia/20 blur-2xl" />
            <div className="glass-strong overflow-hidden rounded-[28px] text-left shadow-[var(--shadow-lift)]">
              <div className="flex items-center gap-2 border-b border-ink/[0.06] px-4 py-3">
                <span className="size-3 rounded-full bg-[#ff5f57]" />
                <span className="size-3 rounded-full bg-[#febc2e]" />
                <span className="size-3 rounded-full bg-[#28c840]" />
                <span className="ml-3 flex items-center gap-2 text-[12.5px] text-ink-faint">
                  <span className="size-1.5 rounded-full bg-indigo" />
                  Live, running the real engine
                </span>
              </div>
              <div className="relative h-[420px] sm:h-[520px]" style={{ background: "linear-gradient(140deg, rgba(233,237,255,0.75), rgba(243,235,255,0.75))" }}>
                <div aria-hidden className="dot-grid absolute inset-0 opacity-70" />
                <HeroDemo />
              </div>
            </div>
          </div>
        </section>

        {/* Proof strip */}
        <section className="mx-auto max-w-[1180px] px-5 md:px-8">
          <dl className="grid grid-cols-2 md:grid-cols-4 md:divide-x md:divide-ink/[0.08]">
            {stats.map(([n, label]) => (
              <div key={label} className="px-2 py-5 text-center md:px-6">
                <dt className="sr-only">{label}</dt>
                <dd className="font-display text-[44px] font-semibold leading-none tracking-[-0.04em] text-ink tabular-nums">{n}</dd>
                <dd className="mx-auto mt-2 max-w-[13rem] text-[13.5px] leading-snug text-ink-soft">{label}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-[1180px] scroll-mt-28 px-5 py-28 md:px-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-end">
            <div>
              <p className={EYEBROW}>How it works</p>
              <h2 className={`${H2} mt-3 max-w-[16ch]`}>From a sentence to a stack you can defend.</h2>
            </div>
            <p className="max-w-[30rem] text-[16px] leading-relaxed text-ink-soft lg:justify-self-end">
              Every spoken edit compiles to typed commands, applied as one atomic transaction. What you see is exactly what gets exported.
            </p>
          </div>
          <ol className="mt-14 grid gap-4 md:grid-cols-2">
            {STEPS.map((s, i) => (
              <li key={s.title} className="glass relative overflow-hidden rounded-[26px] p-7 transition-transform duration-300 hover:-translate-y-0.5">
                <span aria-hidden className="absolute right-6 top-4 font-display text-[72px] font-semibold leading-none tracking-[-0.05em] text-ink/[0.05]">
                  0{i + 1}
                </span>
                <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo to-violet text-white shadow-[0_8px_20px_-8px_rgba(91,108,255,0.7)]">
                  <s.icon size={20} />
                </span>
                <h3 className="mt-5 font-display text-[22px] font-semibold leading-tight tracking-[-0.02em]">{s.title}</h3>
                <p className="mt-3 max-w-[34rem] text-[15px] leading-relaxed text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Pushback */}
        <section id="pushback" className="mx-auto max-w-[1180px] scroll-mt-28 px-5 pb-28 md:px-8">
          <div className="relative overflow-hidden rounded-[32px] bg-ink px-6 py-12 text-white md:px-12 md:py-16">
            <div aria-hidden className="absolute -right-32 -top-32 size-[420px] rounded-full bg-indigo/40 blur-3xl" />
            <div aria-hidden className="absolute -bottom-40 -left-24 size-[380px] rounded-full bg-violet/30 blur-3xl" />
            <div className="relative grid items-center gap-12 lg:grid-cols-2">
              <div>
                <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#a5b0ff]">Guardrails</p>
                <h2 className="mt-3 font-display text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
                  It pushes back like a senior engineer would.
                </h2>
                <p className="mt-5 max-w-[32rem] text-[16px] leading-relaxed text-white/70">
                  Most diagram tools draw whatever you say. {PRODUCT.name} knows a queue can&rsquo;t write to a database on its own, that replication only runs between the same engine, and that a client should never hold database credentials. When it infers something for you, it says why, and one tap undoes it.
                </p>
              </div>
              <div className="space-y-3">
                <Exchange you="Connect the web app straight to Postgres." agent="Clients shouldn't reach a database directly. That skips auth and turns your schema into a public API. Want me to put a service in between?" tone="reject" />
                <Exchange you="Put a queue between the API and the database." agent="Done. A queue can't write to Postgres by itself, so I added a worker to consume it." tone="infer" />
                <Exchange you="Kill the database." agent="Orders is down with it. Nothing else in the path has a replica." tone="chaos" />
              </div>
            </div>
          </div>
        </section>

        {/* Audiences */}
        <section className="mx-auto max-w-[1180px] px-5 pb-28 md:px-8">
          <p className={EYEBROW}>Who it&rsquo;s for</p>
          <h2 className={`${H2} mt-3 max-w-[22ch]`}>Built for the conversations where systems get designed.</h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIENCES.map((a) => (
              <div key={a.who} className="rounded-[24px] border border-white/70 bg-white/40 p-6 transition-colors hover:bg-white/60">
                <a.icon size={22} className="text-indigo" />
                <h3 className="mt-4 font-display text-[19px] font-semibold tracking-[-0.02em]">{a.who}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-soft">{a.what}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-[1180px] px-5 pb-20 md:px-8">
          <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-indigo via-violet to-fuchsia px-8 py-14 text-center text-white md:py-20">
            <div aria-hidden className="dot-grid absolute inset-0 opacity-20 mix-blend-overlay" />
            <h2 className="relative font-display text-[clamp(2rem,4.4vw,3.5rem)] font-semibold leading-[1] tracking-[-0.04em]">Say the first component.</h2>
            <p className="relative mx-auto mt-4 max-w-[28rem] text-[16px] text-white/80">No sign-up. Works with a mic, a keyboard, or a mouse.</p>
            <Link href="/app" className="btn group relative mt-8 !h-12 !rounded-2xl !bg-white !px-6 !text-[15px] !text-ink hover:!bg-white/90">
              Open the canvas
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-ink/[0.06]">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-[13px] text-ink-faint md:px-8">
          <Wordmark size={22} />
          <p>Built for the AssemblyAI Voice Agent Hackathon, 2026. MIT licensed.</p>
          <div className="flex gap-4">
            <Link href="/bench" className="hover:text-ink">Benchmark</Link>
            <Link href="/pitch" className="hover:text-ink">Pitch deck</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Exchange({ you, agent, tone }: { you: string; agent: string; tone: "reject" | "infer" | "chaos" }) {
  const color = tone === "reject" ? "#F43F5E" : tone === "infer" ? "#A78BFA" : "#F59E0B";
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
      <p className="flex justify-end">
        <span className="rounded-2xl rounded-br-md bg-white/10 px-3.5 py-2 text-[14px] text-white/80">&ldquo;{you}&rdquo;</span>
      </p>
      <p className="mt-3 flex gap-2.5 text-[15px] font-medium leading-snug text-white">
        <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 0 4px ${color}33` }} />
        {agent}
      </p>
    </div>
  );
}
