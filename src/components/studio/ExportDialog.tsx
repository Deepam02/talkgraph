"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Download, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PRODUCT } from "@/config/product";
import { toADR } from "@/domain/export/adr";
import { toMermaid } from "@/domain/export/mermaid";
import { toTerraform } from "@/domain/export/terraform";
import { slugify } from "@/domain/graph";
import { useStudio, type ExportFormat } from "@/store/studio";

const FORMATS: { id: ExportFormat; label: string; file: string; blurb: string }[] = [
  { id: "terraform", label: "Terraform", file: "main.tf", blurb: "AWS skeleton: one resource per component, security-group rules from connections." },
  { id: "mermaid", label: "Mermaid", file: "architecture.mmd", blurb: "Paste into GitHub, Notion, or docs. Shapes and colors match the canvas." },
  { id: "adr", label: "ADR", file: "adr.md", blurb: "Architecture decision record: context, decision, risks from the linter, alternatives." },
];

export function ExportDialog() {
  const open = useStudio((s) => s.exportOpen);
  const graph = useStudio((s) => s.snap.graph);
  const title = useStudio((s) => s.snap.title);
  const setExport = useStudio((s) => s.setExport);
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    if (!open) return "";
    if (open === "terraform") return toTerraform(graph, title);
    if (open === "mermaid") return toMermaid(graph, title);
    return toADR(graph, title);
  }, [open, graph, title]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExport(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setExport]);

  const fmt = FORMATS.find((f) => f.id === open);
  const download = () => {
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slugify(title) || PRODUCT.slug}-${fmt!.file}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <AnimatePresence>
      {open && fmt && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-[#1E2340]/18 p-4 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setExport(null)}>
          <motion.div
            role="dialog"
            aria-modal
            aria-label="Export"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="glass-strong flex max-h-[86vh] w-full max-w-[860px] flex-col overflow-hidden rounded-[26px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-5 pb-3 pt-4">
              <h2 className="font-display text-[20px] font-semibold tracking-[-0.02em]">Export {title}</h2>
              <div className="ml-auto flex gap-1 rounded-[14px] bg-ink/[0.045] p-0.5">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setExport(f.id)}
                    className={`rounded-[11px] px-3 py-1.5 text-[12.5px] font-medium transition ${open === f.id ? "bg-white/90 text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn-icon" onClick={() => setExport(null)} aria-label="Close">
                <X size={17} />
              </button>
            </div>
            <p className="px-5 text-[12.5px] text-ink-soft">{fmt.blurb} Generated from the typed graph, so it always matches the canvas.</p>
            <pre className="scroll-thin m-4 mt-3 flex-1 overflow-auto rounded-2xl border border-ink/8 bg-[#F7F6FF]/80 p-4 font-mono text-[12px] leading-relaxed text-ink">{text}</pre>
            <div className="flex items-center justify-end gap-2 px-5 pb-4">
              <span className="mr-auto text-[12px] text-ink-faint">{text.split("\n").length} lines</span>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={async () => {
                  await navigator.clipboard.writeText(text).catch(() => {});
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1400);
                }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}
              </button>
              <button type="button" className="btn btn-primary" onClick={download}>
                <Download size={15} /> Download {fmt.file}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
