import { remoteStorageConfigured, voiceConfigured } from "@/config/env";

export const dynamic = "force-dynamic";

/** Tells the client which capabilities this deployment has. Never exposes secrets. */
export async function GET() {
  return Response.json(
    { voice: voiceConfigured, storage: remoteStorageConfigured ? "remote" : "local" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
