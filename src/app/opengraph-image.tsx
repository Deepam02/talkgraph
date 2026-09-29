import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PRODUCT } from "@/config/product";

export const alt = `${PRODUCT.name}: ${PRODUCT.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NODES = [
  { x: 70, y: 150, label: "web", sub: "Web App", color: "#64748B" },
  { x: 330, y: 150, label: "api-gateway", sub: "API Gateway", color: "#38BDF8" },
  { x: 590, y: 80, label: "orders", sub: "Service ×3", color: "#5B6CFF" },
  { x: 590, y: 225, label: "order-events", sub: "Kafka", color: "#F59E0B" },
  { x: 850, y: 40, label: "orders-db", sub: "PostgreSQL", color: "#8B5CF6" },
  { x: 850, y: 150, label: "orders-cache", sub: "Redis", color: "#FB7185" },
  { x: 850, y: 265, label: "notifier", sub: "Worker", color: "#5B6CFF" },
];

const LINKS: [number, number, string, boolean][] = [
  [0, 1, "#5B6CFF", false],
  [1, 2, "#5B6CFF", false],
  [2, 3, "#F59E0B", true],
  [2, 4, "#5B6CFF", false],
  [2, 5, "#FB7185", false],
  [3, 6, "#F59E0B", true],
];

export default async function OpengraphImage() {
  // Bricolage Grotesque (SIL OFL 1.1), bundled so the image renders without network access.
  const display = await readFile(join(process.cwd(), "src/assets/fonts/BricolageGrotesque-Bold.ttf"));
  const W = 200;
  const H = 64;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "linear-gradient(135deg, #E9EDFF 0%, #F3EBFF 100%)", padding: "56px 64px", color: "#1E2340", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: "linear-gradient(135deg, #5B6CFF, #8B5CF6)", display: "flex" }} />
          <div style={{ fontSize: 34, fontFamily: "Display", letterSpacing: -1 }}>{PRODUCT.name}</div>
        </div>
        <div style={{ marginTop: 28, fontSize: 68, fontFamily: "Display", letterSpacing: -3, lineHeight: 1, maxWidth: 980 }}>{PRODUCT.tagline}</div>
        <div style={{ position: "relative", display: "flex", marginTop: 36, width: 1072, height: 340 }}>
          <svg width="1072" height="340" style={{ position: "absolute", left: 0, top: 0 }}>
            {LINKS.map(([a, b, c, dashed], i) => {
              const s = NODES[a];
              const t = NODES[b];
              const vertical = s.x === t.x;
              const x1 = vertical ? s.x + W / 2 : s.x + W;
              const y1 = vertical ? s.y + H : s.y + H / 2;
              const x2 = vertical ? t.x + W / 2 : t.x;
              const y2 = vertical ? t.y : t.y + H / 2;
              const mx = (x1 + x2) / 2;
              const d = vertical ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
              return <path key={i} d={d} stroke={c} strokeWidth={3} fill="none" strokeDasharray={dashed ? "9 8" : undefined} />;
            })}
          </svg>
          {NODES.map((n) => (
            <div key={n.label} style={{ position: "absolute", left: n.x, top: n.y, width: W, height: H, display: "flex", alignItems: "center", gap: 12, padding: "0 14px", borderRadius: 18, background: "rgba(253,252,255,0.95)", boxShadow: "0 12px 28px -14px rgba(46,52,120,0.45)", border: "1px solid rgba(255,255,255,0.9)" }}>
              <div style={{ width: 34, height: 34, borderRadius: 11, background: `${n.color}26`, border: `2px solid ${n.color}`, display: "flex" }} />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 19, fontWeight: 700 }}>{n.label}</div>
                <div style={{ fontSize: 14, color: "#4A5078" }}>{n.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Display", data: display, style: "normal", weight: 700 }] },
  );
}
