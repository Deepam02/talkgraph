import type { Metadata } from "next";
import { BenchView } from "@/components/bench/BenchView";

export const metadata: Metadata = {
  title: "Benchmark",
  description: "Spoken command scenarios scored against the resulting typed graph.",
};

export default function BenchPage() {
  return <BenchView />;
}
