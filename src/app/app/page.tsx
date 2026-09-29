import type { Metadata } from "next";
import { Studio } from "@/components/studio/Studio";

export const metadata: Metadata = { title: "Canvas" };

export default function AppPage() {
  return <Studio />;
}
