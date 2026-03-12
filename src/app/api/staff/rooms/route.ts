import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { USER_ROLE } from "@/lib/domain";
import { createRoom, getRoomsForStaff } from "@/lib/store";
import { requireStaffFromRequest } from "@/lib/session";

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(32),
});

export async function GET(request: NextRequest) {
  const auth = await requireStaffFromRequest(request);
  if ("response" in auth) {
    return auth.response;
  }

  const rooms = await getRoomsForStaff();
  return NextResponse.json({ ok: true, rooms });
}

export async function POST(request: NextRequest) {
  const auth = await requireStaffFromRequest(request, [USER_ROLE.ADMIN]);
  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = createRoomSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "房间名称不合法" },
      { status: 400 },
    );
  }

  try {
    const room = await createRoom(parsed.data.name);
    return NextResponse.json({ ok: true, room });
  } catch (error) {
    if (error instanceof Error && error.message === "ROOM_EXISTS") {
      return NextResponse.json(
        { ok: false, message: "房间已存在" },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { ok: false, message: "创建房间失败" },
      { status: 500 },
    );
  }
}
