import { diagramSchema } from "@/storage/types";
import { upstashStore } from "@/storage/upstash";
import { guard } from "../shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/api/diagrams/[id]">) {
  const g = guard(request);
  if (g instanceof Response) return g;
  const { id } = await ctx.params;
  return Response.json(await upstashStore.get(g.ws, id));
}

export async function PUT(request: Request, ctx: RouteContext<"/api/diagrams/[id]">) {
  const g = guard(request);
  if (g instanceof Response) return g;
  const { id } = await ctx.params;
  const parsed = diagramSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.id !== id) return Response.json({ error: "invalid_diagram" }, { status: 400 });
  await upstashStore.save(g.ws, parsed.data);
  return new Response(null, { status: 204 });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/diagrams/[id]">) {
  const g = guard(request);
  if (g instanceof Response) return g;
  const { id } = await ctx.params;
  await upstashStore.remove(g.ws, id);
  return new Response(null, { status: 204 });
}
