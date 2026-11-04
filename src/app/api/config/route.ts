/**
 * GET /api/config — capability discovery for the client.
 * Never returns secrets: only whether the server can call a model.
 */
import { NextResponse } from "next/server";

import { getServerConfig } from "@/lib/agent/config";
import type { ServerConfig } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<ServerConfig>> {
  return NextResponse.json(getServerConfig(), {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
