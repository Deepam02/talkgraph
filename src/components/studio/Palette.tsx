"use client";

import { ChevronsLeft, Search, Shapes } from "lucide-react";
import { useMemo, useState } from "react";
import { CATEGORIES, CATEGORY_META, COMPONENTS, normalizePhrase, type ComponentKind } from "@/domain/catalog";
import { useStudio } from "@/store/studio";
import { ComponentIcon } from "../ComponentIcon";

export function Palette() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(true);
  const addComponent = useStudio((s) => s.addComponent);

  const groups = useMemo(() => {
    const query = normalizePhrase(q);
    return CATEGORIES.map((cat) => ({
      cat,
      items: COMPONENTS.filter(
        (c) =>
          c.category === cat &&
          (!query || normalizePhrase(`${c.label} ${c.aliases.join(" ")} ${c.blurb}`).includes(query)),
      ),
    })).filter((g) => g.items.length);
  }, [q]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass pointer-events-auto absolute left-4 top-20 z-20 grid size-12 place-items-center rounded-2xl text-ink-soft transition hover:text-indigo max-md:hidden"
        aria-label="Open component library"
        title="Component library"
      >
        <Shapes size={19} />
      </button>
    );
  }

  const onDragStart = (e: React.DragEvent, kind: ComponentKind) => {
    e.dataTransfer.setData("application/talkgraph-kind", kind);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <aside
      aria-label="Component library"
      className="glass pointer-events-auto absolute bottom-4 left-4 top-20 z-20 flex w-[248px] flex-col overflow-hidden rounded-[22px] max-md:hidden"
    >
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search components" className="field !pl-8" aria-label="Search components" />
        </div>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-icon !size-8" aria-label="Collapse library">
          <ChevronsLeft size={16} />
        </button>
      </div>
      <p className="px-4 pb-2 text-[11.5px] leading-snug text-ink-faint">Drag onto the canvas, or click to add and auto-connect.</p>
      <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-3">
        {groups.map(({ cat, items }) => {
          const meta = CATEGORY_META[cat];
          return (
            <section key={cat} className="mb-2">
              <h3 className="flex items-center gap-2 px-2 pb-1 pt-2 text-[11.5px] font-semibold text-ink-soft">
                <span className="size-2 rounded-full" style={{ background: meta.color }} />
                {meta.plural}
              </h3>
              <ul>
                {items.map((c) => (
                  <li key={c.kind}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => onDragStart(e, c.kind)}
                      onClick={() => addComponent(c.kind)}
                      title={c.blurb}
                      className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/70 active:scale-[0.98]"
                    >
                      <span
                        className="grid size-8 shrink-0 place-items-center rounded-[10px] transition group-hover:scale-105"
                        style={{ background: meta.tint, color: meta.color, boxShadow: `inset 0 0 0 1px ${meta.color}26` }}
                      >
                        <ComponentIcon kind={c.kind} size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-ink">{c.label}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {!groups.length && <p className="px-3 py-6 text-center text-[12.5px] text-ink-soft">Nothing matches &ldquo;{q}&rdquo;. The library covers services, data stores, queues, caches, gateways, security, observability, and third parties.</p>}
      </div>
    </aside>
  );
}
