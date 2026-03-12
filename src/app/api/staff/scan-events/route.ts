import { NextRequest, NextResponse } from "next/server";

import { requireStaffFromRequest } from "@/lib/session";
import { getFilteredScanEvents } from "@/lib/store";

export async function GET(request: NextRequest) {
  const auth = await requireStaffFromRequest(request);
  if ("response" in auth) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("roomId");
  const result = searchParams.get("result");
  const limitRaw = searchParams.get("limit");
  const limit = Math.min(Number(limitRaw) || 100, 300);

  const events = await getFilteredScanEvents({ roomId, result, limit });
  return NextResponse.json({ ok: true, events });
}
