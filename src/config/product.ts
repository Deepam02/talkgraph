/**
 * Single source of truth for product identity. Rename the product here and
 * every page, prompt, export header, and metadata tag follows.
 */
export const PRODUCT = {
  name: "TalkGraph",
  tagline: "Talk your architecture into existence.",
  description:
    "A voice-controlled system architecture canvas. Describe a system out loud and the diagram builds, validates, and stress-tests itself live.",
  /** Short id used for storage keys and generated file names. */
  slug: "talkgraph",
  /** The voice agent's spoken identity. */
  agentName: "TalkGraph",
  /** Voice id from https://www.assemblyai.com/docs/voice-agents/voice-agent-api/voices */
  voice: "jane",
  greeting: "Hey, I'm listening. Describe your system and I'll draw it.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://talkgraph.vercel.app",
} as const;

export type Product = typeof PRODUCT;
