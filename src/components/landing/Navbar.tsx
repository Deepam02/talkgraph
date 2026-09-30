"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Wordmark } from "@/components/Logo";
import { PRODUCT } from "@/config/product";

const LINKS = [
  ["#how", "How it works"],
  ["#pushback", "Guardrails"],
  ["/bench", "Benchmark"],
  ["/pitch", "Pitch"],
] as const;

/** Full-width at the top of the page; shrinks into a translucent floating pill once you scroll. */
export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
    {/* Fixed, not sticky: the page wrapper's overflow-x-hidden would break sticky. The spacer holds its place. */}
    <div aria-hidden className="h-[76px]" />
    <header className="fixed inset-x-0 top-0 z-50 px-3 transition-[padding] duration-500 ease-[var(--ease-out)]" style={{ paddingTop: scrolled ? 12 : 0 }}>
      <div
        className={`mx-auto flex items-center justify-between gap-3 border transition-all duration-500 ease-[var(--ease-out)] ${
          scrolled
            ? "max-w-[860px] rounded-full border-white/70 bg-white/50 py-1.5 pl-5 pr-1.5 shadow-[0_10px_40px_-12px_rgba(46,52,120,0.35),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-2xl backdrop-saturate-150"
            : "max-w-[1180px] rounded-none border-transparent bg-transparent px-2 py-4 md:px-5"
        }`}
      >
        <Link href="/" aria-label={`${PRODUCT.name} home`} className="shrink-0">
          <Wordmark size={scrolled ? 24 : 28} />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-0.5 text-[13.5px] font-medium md:flex">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-full px-3.5 py-1.5 text-ink-soft transition-colors hover:bg-white/80 hover:text-ink">
              {label}
            </Link>
          ))}
        </nav>
        <Link
          href="/app"
          className="group inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-ink pl-4 pr-1.5 text-[13.5px] font-medium text-white shadow-[0_6px_16px_-6px_rgba(30,35,64,0.6)] transition-colors hover:bg-indigo"
        >
          Open the canvas
          <span className="grid size-7 place-items-center rounded-full bg-white/15 transition-transform group-hover:translate-x-0.5">
            <ArrowRight size={14} />
          </span>
        </Link>
      </div>
    </header>
    </>
  );
}
