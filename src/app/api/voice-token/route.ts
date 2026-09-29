/**
 * Mints a single-use, short-lived Voice Agent token so the browser can open
 * the WebSocket without ever seeing the API key.
 * https://www.assemblyai.com/docs/voice-agents/voice-agent-api/browser-integration
 */
import { env, voiceConfigured } from "@/config/env";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!voiceConfigured) {
    return Response.json({ error: "voice_not_configured" }, { status: 503, headers: noStore });
  }

  // Only our own pages may mint tokens: they spend this deployment's credits.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return Response.json({ error: "forbidden_origin" }, { status: 403, headers: noStore });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  if (!rateLimit(`voice:${ip}`, env.VOICE_TOKENS_PER_MINUTE, 60_000)) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { ...noStore, "Retry-After": "60" } });
  }

  const url = new URL(`${env.ASSEMBLYAI_AGENTS_BASE}/token`);
  // Redemption window: the browser connects immediately, so keep it short.
  url.searchParams.set("expires_in_seconds", "60");
  url.searchParams.set("max_session_duration_seconds", String(env.VOICE_MAX_SESSION_SECONDS));

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${env.ASSEMBLYAI_API_KEY}` }, cache: "no-store" });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[voice-token] AssemblyAI ${res.status}: ${body.slice(0, 200)}`);
      return Response.json({ error: "token_failed", status: res.status }, { status: 502, headers: noStore });
    }
    const { token } = (await res.json()) as { token: string };
    return Response.json({ token, maxSessionSeconds: env.VOICE_MAX_SESSION_SECONDS }, { headers: noStore });
  } catch (err) {
    console.error("[voice-token] network error", err);
    return Response.json({ error: "token_failed" }, { status: 502, headers: noStore });
  }
}
