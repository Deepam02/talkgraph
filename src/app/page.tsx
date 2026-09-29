import Link from "next/link";
import { Check } from "lucide-react";
import { runAll, offlineDriver } from "@/bench/run";
import { HeroDemo } from "@/components/landing/HeroDemo";
import { Wordmark } from "@/components/Logo";
import { PRODUCT } from "@/config/product";
import { COMPONENTS } from "@/domain/catalog";
import { agentTools } from "@/voice/tools";

export const dynamic = "force-static";

const STEPS = [
  {
    title: "You say it",
    body: "AssemblyAI's Voice Agent hears you over one WebSocket, with keyterms drawn from the component catalog so Kafka, pgvector, and your own service names come through right. Interrupt it any time.",
  },
  {
    title: "It's checked before it's drawn",
    body: "The agent can only act through typed tools against an allowlisted catalog. Illegal links, like a browser talking straight to Postgres, are refused out loud with a one-tap fix.",
  },
  {
    title: "It's stress-tested",
    body: "A live linter flags single points of failure, missing caches and queues, and plaintext links. Say “simulate 10x traffic” or “kill the database”, then “fix it”.",
  },
  {
    title: "It ships",
    body: "Export a Terraform skeleton, a Mermaid diagram, or an architecture decision record, all generated from the same typed graph you see on screen.",
  },
];

const AUDIENCES = [
  { who: "Design reviews", what: "Sketch the proposal live while the room talks, and leave with an ADR instead of a whiteboard photo." },
  { who: "Solutions engineers", what: "Draw the customer's architecture on the call, in their words, and send the diagram before the call ends." },
  { who: "Incident postmortems", what: "Rebuild what failed, kill the component that went down, and show which fix would have held." },
  { who: "Interview prep", what: "Practice system design out loud against a partner that pushes back when a design won't scale." },
];

const PLANS = [
  { name: "Solo", price: "Free", per: "", points: ["Unlimited typed diagrams", "30 voice minutes a month", "Mermaid and ADR export", "Local version history"] },
  { name: "Team", price: "$18", per: "per editor / month", points: ["Unlimited voice", "Shared workspaces and history", "Terraform export", "Custom component catalogs"], featured: true },
  { name: "Enterprise", price: "Talk to us", per: "", points: ["SSO and audit logs", "Bring your own LLM through AssemblyAI", "Your own linter rules", "Private deployment"] },
];

export default async function Landing() {
  const bench = await runAll(offlineDriver());
  const tools = agentTools().length;

  return (
    <div className="relative overflow-x-hidden">
      <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />

      <header className="relative z-10 mx-auto flex max-w-[1240px] items-center justify-between px-5 py-5 md:px-8">
        <Wordmark />
        <nav className="flex items-center gap-1 text-[14px]">
          <a href="#how" className="btn hidden sm:inline-flex">How it works</a>
          <Link href="/bench" className="btn hidden sm:inline-flex">Benchmark</Link>
          <Link href="/pitch" className="btn hidden md:inline-flex">Pitch</Link>
          <Link href="/app" className="btn btn-primary ml-2">Open the canvas</Link>
        </nav>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto max-w-[1240px] px-5 pb-14 pt-6 md:px-8 lg:pt-10">
          <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <h1 className="font-display text-[clamp(2.75rem,6.4vw,5.6rem)] font-semibold leading-[0.93] tracking-[-0.045em] text-ink">
              Talk your architecture into existence.
            </h1>
            <div className="pb-2">
              <p className="max-w-[31rem] text-[17px] leading-relaxed text-ink-soft">
                Describe a system out loud. {PRODUCT.name} draws it as you speak, checks it against real architecture rules, and stress-tests it before anyone writes a line of Terraform.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link href="/app" className="btn btn-primary !h-12 !rounded-2xl !px-6 !text-[15px]">
                  Open the canvas
                </Link>
                <Link href="/bench" className="btn btn-quiet !h-12 !rounded-2xl !px-5 !text-[15px]">
                  See the benchmark
                </Link>
              </div>
            </div>
          </div>

          <div className="glass relative mt-10 h-[440px] overflow-hidden rounded-[30px] sm:h-[540px]" style={{ background: "linear-gradient(140deg, rgba(233,237,255,0.75), rgba(243,235,255,0.75))" }}>
            <div aria-hidden className="dot-grid absolute inset-0 opacity-70" />
            <HeroDemo />
            <p className="absolute left-5 top-4 flex items-center gap-2 text-[12.5px] text-ink-faint">
              <span className="size-1.5 rounded-full bg-indigo" />
              Live, running the real engine
            </p>
          </div>
        </section>

        {/* Proof strip */}
        <section className="mx-auto max-w-[1240px] px-5 md:px-8">
          <dl className="glass grid grid-cols-2 gap-y-6 rounded-[26px] px-6 py-6 md:grid-cols-4 md:px-10">
            {[
              [`${bench.passed}/${bench.total}`, "spoken scenarios pass the benchmark"],
              [`${COMPONENTS.length}`, "components in the typed catalog"],
              [`${tools}`, "general tools, strict JSON schemas"],
              ["0", "components the agent can invent"],
            ].map(([n, label]) => (
              <div key={label}>
                <dt className="sr-only">{label}</dt>
                <dd className="font-display text-[40px] font-semibold leading-none tracking-[-0.04em] text-ink tabular-nums">{n}</dd>
                <dd className="mt-2 max-w-[14rem] text-[13.5px] leading-snug text-ink-soft">{label}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* How it works: a real sequence */}
        <section id="how" className="mx-auto max-w-[1240px] scroll-mt-10 px-5 py-24 md:px-8">
          <h2 className="max-w-[18ch] font-display text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1] tracking-[-0.035em]">
            From a sentence to a stack you can defend.
          </h2>
          <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-[24px] border border-white/70 bg-white/35 p-6">
                <span className="font-display text-[15px] font-semibold text-indigo">{i + 1}</span>
                <h3 className="mt-3 font-display text-[21px] font-semibold leading-tight tracking-[-0.02em]">{s.title}</h3>
                <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Pushback example */}
        <section className="mx-auto grid max-w-[1240px] items-center gap-10 px-5 pb-24 md:px-8 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-[clamp(1.9rem,3.6vw,3rem)] font-semibold leading-[1.02] tracking-[-0.035em]">It pushes back like a senior engineer would.</h2>
            <p className="mt-5 max-w-[32rem] text-[16px] leading-relaxed text-ink-soft">
              Most diagram tools draw whatever you say. {PRODUCT.name} knows a queue can&rsquo;t write to a database on its own, that replication only runs between the same engine, and that a client should never hold database credentials. When it infers something for you, it says why, and one tap undoes it.
            </p>
          </div>
          <div className="space-y-3">
            <Exchange you="Connect the web app straight to Postgres." agent="Clients shouldn't reach a database directly. That skips auth and turns your schema into a public API. Want me to put a service in between?" tone="reject" />
            <Exchange you="Put a queue between the API and the database." agent="Done. A queue can't write to Postgres by itself, so I added a worker to consume it." tone="infer" />
            <Exchange you="Kill the database." agent="Orders is down with it. Nothing else in the path has a replica." tone="chaos" />
          </div>
        </section>

        {/* Audiences */}
        <section className="mx-auto max-w-[1240px] px-5 pb-24 md:px-8">
          <h2 className="font-display text-[clamp(1.9rem,3.6vw,3rem)] font-semibold leading-[1.02] tracking-[-0.035em]">Built for the conversations where systems get designed.</h2>
          <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
            {AUDIENCES.map((a) => (
              <div key={a.who} className="border-t border-ink/10 pt-5">
                <h3 className="font-display text-[20px] font-semibold tracking-[-0.02em]">{a.who}</h3>
                <p className="mt-2 max-w-[36rem] text-[15px] leading-relaxed text-ink-soft">{a.what}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section className="mx-auto max-w-[1240px] px-5 pb-24 md:px-8">
          <h2 className="font-display text-[clamp(1.9rem,3.6vw,3rem)] font-semibold leading-[1.02] tracking-[-0.035em]">Pricing</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PLANS.map((p) => (
              <div key={p.name} className={`rounded-[26px] p-7 ${p.featured ? "glass-strong ring-2 ring-indigo/40" : "border border-white/70 bg-white/35"}`}>
                <h3 className="text-[15px] font-semibold text-ink-soft">{p.name}</h3>
                <p className="mt-3 font-display text-[40px] font-semibold leading-none tracking-[-0.04em]">{p.price}</p>
                <p className="mt-1 h-5 text-[13px] text-ink-faint">{p.per}</p>
                <ul className="mt-6 space-y-2.5">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-[14px] text-ink-soft">
                      <Check size={16} className="mt-0.5 shrink-0 text-indigo" /> {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-[1240px] px-5 pb-20 md:px-8">
          <div className="glass-strong flex flex-col items-start justify-between gap-6 rounded-[30px] px-8 py-10 md:flex-row md:items-center md:px-12">
            <div>
              <h2 className="font-display text-[clamp(1.8rem,3.2vw,2.6rem)] font-semibold leading-[1.02] tracking-[-0.035em]">Say the first component.</h2>
              <p className="mt-2 text-[15px] text-ink-soft">No sign-up. Works with a mic, a keyboard, or a mouse.</p>
            </div>
            <Link href="/app" className="btn btn-primary !h-12 !rounded-2xl !px-6 !text-[15px]">
              Open the canvas
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative z-10 mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-5 pb-10 text-[13px] text-ink-faint md:px-8">
        <Wordmark size={22} />
        <p>Built for the AssemblyAI Voice Agent Hackathon, 2026. MIT licensed.</p>
        <div className="flex gap-4">
          <Link href="/bench" className="hover:text-ink">Benchmark</Link>
          <Link href="/pitch" className="hover:text-ink">Pitch deck</Link>
        </div>
      </footer>
    </div>
  );
}

function Exchange({ you, agent, tone }: { you: string; agent: string; tone: "reject" | "infer" | "chaos" }) {
  const color = tone === "reject" ? "#F43F5E" : tone === "infer" ? "#8B5CF6" : "#F59E0B";
  return (
    <div className="glass rounded-[22px] p-5">
      <p className="text-[14px] text-ink-soft">&ldquo;{you}&rdquo;</p>
      <p className="mt-2 flex gap-2.5 text-[15px] font-medium leading-snug text-ink">
        <span className="mt-2 size-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 0 4px ${color}22` }} />
        {agent}
      </p>
    </div>
  );
}
