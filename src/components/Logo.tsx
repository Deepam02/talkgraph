import { PRODUCT } from "@/config/product";

/** Mark: a voice wave that resolves into a connected graph. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="tg-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5B6CFF" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#tg-logo)" />
      <path d="M6.5 16.5c1.4 0 1.4-5 2.8-5s1.4 9 2.8 9 1.4-6 2.8-6" fill="none" stroke="#F4F2FF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.9 14.5 L20.5 10.5 M14.9 14.5 L20.5 21" stroke="#F4F2FF" strokeOpacity=".75" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="21.8" cy="9.8" r="2.6" fill="#F4F2FF" />
      <circle cx="21.8" cy="21.8" r="2.6" fill="#F4F2FF" />
      <circle cx="14.9" cy="14.5" r="1.7" fill="#F4F2FF" />
    </svg>
  );
}

export function Wordmark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className="font-display text-[1.15rem] font-semibold tracking-[-0.02em] text-ink">{PRODUCT.name}</span>
    </span>
  );
}
