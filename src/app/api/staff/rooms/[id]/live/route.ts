import { NextRequest, NextResponse } from "next/server";

import { requireStaffFromRequest } from "@/lib/session";
import { getRoomLive } from "@/lib/store";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireStaffFromRequest(request);
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await params;
  const live = await getRoomLive(id);

  if (!live) {
    return NextResponse.json(
      { ok: false, message: "房间不存在" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    room: live.room,
    deniedEvents: live.deniedEvents,
  });
}
