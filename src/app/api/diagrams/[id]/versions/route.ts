import { versionSchema } from "@/storage/types";
import { upstashStore } from "@/storage/upstash";
import { guard } from "../../shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/api/diagrams/[id]/versions">) {
  const g = guard(request);
  if (g instanceof Response) return g;
  const { id } = await ctx.params;
  return Response.json(await upstashStore.listVersions(g.ws, id));
}

export async function POST(request: Request, ctx: RouteContext<"/api/diagrams/[id]/versions">) {
  const g = guard(request);
  if (g instanceof Response) return g;
  const { id } = await ctx.params;
  const parsed = versionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.diagramId !== id) return Response.json({ error: "invalid_version" }, { status: 400 });
  await upstashStore.addVersion(g.ws, parsed.data);
  return new Response(null, { status: 204 });
}
