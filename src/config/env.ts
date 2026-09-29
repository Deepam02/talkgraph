import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once. Everything is optional so the app runs
 * (with typed commands and local storage) even before keys are configured.
 */
const schema = z.object({
  ASSEMBLYAI_API_KEY: z.string().min(10).optional(),
  ASSEMBLYAI_AGENTS_BASE: z.url().default("https://agents.assemblyai.com/v1"),
  VOICE_MAX_SESSION_SECONDS: z.coerce.number().int().min(60).max(10800).default(1800),
  VOICE_TOKENS_PER_MINUTE: z.coerce.number().int().min(1).max(600).default(20),
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(10).optional(),
});

const parsed = schema.safeParse({
  ASSEMBLYAI_API_KEY: process.env.ASSEMBLYAI_API_KEY || undefined,
  ASSEMBLYAI_AGENTS_BASE: process.env.ASSEMBLYAI_AGENTS_BASE || undefined,
  VOICE_MAX_SESSION_SECONDS: process.env.VOICE_MAX_SESSION_SECONDS || undefined,
  VOICE_TOKENS_PER_MINUTE: process.env.VOICE_TOKENS_PER_MINUTE || undefined,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || undefined,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || undefined,
});

if (!parsed.success) {
  console.error("Invalid environment:", z.prettifyError(parsed.error));
}

export const env = parsed.success ? parsed.data : schema.parse({});

export const voiceConfigured = Boolean(env.ASSEMBLYAI_API_KEY);
export const remoteStorageConfigured = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
