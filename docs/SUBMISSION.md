# lablab.ai submission copy

**Project title** (letters and spaces only, 32 max): `TalkGraph`

**Short description**

A voice-controlled architecture canvas. Describe a system out loud; it draws, validates, and stress-tests itself live, then exports Terraform.

**Long description**

Systems are designed in conversation, but diagrams get drawn afterwards, by hand, and nobody checks them. TalkGraph is a canvas you talk to. Say "add a Postgres behind the API, put a queue between them" and the diagram builds and edits itself in place, animated, while the agent confirms in a sentence.

It is built on the AssemblyAI Voice Agent API: a server-minted single-use token, one browser WebSocket, 24 kHz PCM through AudioWorklets with barge-in, and a clean session.end. The agent acts only through nine general client-side tools with strict JSON schemas generated from zod and validated locally. Enums come from an allowlisted catalog of 42 components, so nothing is invented. Every tool.call is applied immediately, and tool.result is sent only when reply.done is the latest event. After every edit, session.update pushes the live graph into the system prompt and refreshes keyterms with the user's own component names.

TalkGraph pushes back like a senior engineer. Illegal links (a browser talking to Postgres, a queue writing to a database) are rejected out loud with a one-tap fix. Inferred choices (names, protocols, wiring) are badged, explained, and undoable. A live linter flags single points of failure, missing caches and queues, and plaintext links. Say "simulate 10x traffic" or "kill the database" to watch overloads and cascading failure, then "fix it" to apply validated remedies. Export a Terraform skeleton, Mermaid, or an ADR, all from the same typed graph.

Voice is the shortcut, not the only way: everything also works by drag and drop, click-to-edit, and a typed command bar. A benchmark of spoken scenarios is scored against the resulting graph, offline in CI and live against the voice agent.

**Tags**: AssemblyAI, Voice Agent, Voice AI, Next.js, React Flow, TypeScript, System Design, Developer Tools

**Cover image**: `docs/cover.png` (also served at `/opengraph-image`)

**Slides**: open `/pitch` and click "Save as PDF" (Chrome: destination "Save as PDF", margins "None", background graphics on)

**Video**: follow `docs/DEMO.md`

**Repository**: public GitHub repo URL

**Application URL**: your Vercel production URL
