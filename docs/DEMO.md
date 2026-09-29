# Demo video script (about 4:30)

Record at 1920×1080 in Chrome, window maximized, browser zoom 100%. Use headphones only if your mic picks up the speakers badly; the browser's echo cancellation normally handles it. Start from a clean canvas: open `/app`, choose **Templates → New blank diagram**.

Lines in quotes are said out loud to TalkGraph. Narration is what you say to the viewer (voice-over, or live between commands).

---

## 0:00–0:25 · Hook (landing page)

Show `/`. Let the hero demo build itself for a few seconds.

> Narration: "Every system gets designed in a conversation, but the diagram gets drawn afterwards, by hand, and nobody checks it. TalkGraph is a canvas you talk to. It draws while you speak, and it pushes back when the design is wrong."

Click **Open the canvas**.

## 0:25–1:25 · Build by voice

Press **Space** (or the mic). Wait for the greeting.

1. "Add a web app, an API gateway and an orders service."
   *Nodes spring in; edges draw themselves; the gateway is wired automatically.* Point at the sparkle badge: "It inferred that wiring, and says why. One tap undoes it."
2. "Put Postgres behind orders, then put a queue between them."
   *The queue slides in, plus a worker it inferred.* The agent explains: a queue can't write to Postgres by itself.
3. "Scale orders to three instances."
   *The stacked-card effect appears.*

> Narration: "The agent can only act through nine typed tools whose enums come from a catalog of forty-two components. It can't invent anything, and every call is validated before it touches the graph."

## 1:25–2:05 · It pushes back

4. "Connect the web app straight to the database."
   *Rejected, out loud, with the reason.* The agent offers to put a service in between.
5. "Yes, do that."
   *The service appears between them.*
6. "Actually, undo that."
   *Undo by voice.* Then "Redo."

Interrupt the agent mid-sentence once (say "wait" while it talks) to show barge-in.

## 2:05–3:05 · Review, simulate, break, fix

7. "What's wrong with this design?"
   *The Review tab and suggestion chips update; the agent names the worst finding: Postgres is a single point of failure.*
8. "Simulate ten x traffic."
   *Glowing packets flow; orders and the gateway turn rose; the error rate shows in the banner.*
9. "Fix it."
   *Remedies apply: instances scale out, a Redis cache appears in front of Postgres. Everything glows sky blue; the error rate drops to zero.*
10. "Kill the orders database."
   *The database goes down.* If a replica was added, point at the failover. If not, the callers turn rose.
11. "Fix it."

> Narration: "The linter and the simulator run on the same typed graph, so every fix is a normal, undoable edit."

## 3:05–3:35 · Ship it

12. "Export the Terraform."
    *The export dialog opens.* Click through **Mermaid** and **ADR**. Point at the ADR's "Risks" section, generated from the linter.
13. Click **Share** to show the link copy.

## 3:35–4:05 · Under the hood

Open `/bench`. Click **Run against the live agent** (it takes a minute; start it before recording this segment, or show a finished run).

> Narration: "We measure it. Each scenario is something people actually say, scored against the resulting graph, not the agent's wording. The same scenarios run in CI through a deterministic parser, and live against the AssemblyAI Voice Agent."

Back on the canvas, open the **History** tab: **Agent activity** lists every tool call the agent made during the recording, with its arguments and result.

Show the README section "How the voice agent works" for five seconds: server-minted token, one WebSocket, tool results sent on `reply.done`, live graph pushed into the system prompt, keyterms from the catalog, clean `session.end`.

## 4:05–4:30 · Close

Back to `/` or `/pitch` slide 1.

> Narration: "TalkGraph is for design reviews, solutions engineers on customer calls, and postmortems. Free for individuals, paid for teams. Talk your architecture into existence."

---

## If something goes wrong on camera

- **The agent misheard a name:** say it again; your own component names are added as keyterms after each edit.
- **Voice unavailable:** everything above also works typed in the command bar (Ctrl K) using the same sentences. Say so on camera; it's a feature.
- **The diagram gets messy:** press **L** to tidy the layout, **F** to fit to the screen.
