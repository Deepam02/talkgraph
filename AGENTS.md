<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# TalkGraph: working on this repo

- Every edit path (voice tools, command bar, drag/drop, lint fixes, sim remedies) compiles to domain `Command`s in `src/domain/commands.ts`, applied by `applyCommands` as one atomic transaction. Don't mutate graphs anywhere else.
- `src/domain` and `src/engine` are pure TypeScript (no React, no DOM) and fully unit-tested. Keep them that way.
- Voice tool schemas live once in `src/voice/tools.ts` (zod). The JSON Schema sent to AssemblyAI is generated from them; never hand-write a second copy.
- `tool.result` must only be sent when `reply.done` is the latest event: `ToolResultGate` in `src/voice/protocol.ts` owns that rule.
- New components go in `COMPONENTS` (`src/domain/catalog.ts`); new link rules in `src/domain/rules.ts`; new lint rules in `src/domain/lint.ts`; new spoken scenarios in `src/bench/scenarios.ts`.
- The landing demo and `docs/DEMO.md` lines are covered by `tests/demo-script.test.ts`; update both together.
- Product name, voice, and greeting live only in `src/config/product.ts`.
- Run `npm test && npm run typecheck && npm run lint && npm run build` before committing.
