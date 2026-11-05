/**
 * GET /api/status — server capability snapshot for the UI: serving mode, model,
 * demo quota for the caller IP and the shared rate-limit configuration.
 */
import { NextResponse } from "next/server";

import packageJson from "../../../../package.json";
import { getClientIdentity } from "@/lib/agent/ratelimit";
import { getServerStatus } from "@/lib/agent/status";
import type { ServerStatus } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse<ServerStatus>> {
  const identity = getClientIdentity(request);
  const status = getServerStatus({
    ip: identity.ip,
    version: typeof packageJson.version === "string" ? packageJson.version : undefined,
  });
  return NextResponse.json(status, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
