import { upstashStore } from "@/storage/upstash";
import { guard } from "./shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const g = guard(request);
  if (g instanceof Response) return g;
  return Response.json(await upstashStore.list(g.ws));
}
