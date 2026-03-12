import { NextRequest, NextResponse } from "next/server";

import { getDashboardData } from "@/lib/store";
import { requireStaffFromRequest } from "@/lib/session";

export async function GET(request: NextRequest) {
  const auth = await requireStaffFromRequest(request);
  if ("response" in auth) {
    return auth.response;
  }

  const dashboard = await getDashboardData();

  return NextResponse.json({
    ok: true,
    user: auth.user,
    campaign: dashboard.campaign,
    rooms: dashboard.rooms,
    recentEvents: dashboard.recentEvents,
  });
}
