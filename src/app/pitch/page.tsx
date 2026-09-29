import type { Metadata } from "next";
import { offlineDriver, runAll } from "@/bench/run";
import { Deck } from "@/components/pitch/Deck";
import { COMPONENTS } from "@/domain/catalog";
import { agentTools } from "@/voice/tools";

export const metadata: Metadata = { title: "Pitch" };
export const dynamic = "force-static";

export default async function PitchPage() {
  const bench = await runAll(offlineDriver());
  return <Deck stats={{ passed: bench.passed, total: bench.total, components: COMPONENTS.length, tools: agentTools().length }} />;
}
