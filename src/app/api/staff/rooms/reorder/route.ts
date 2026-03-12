import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { USER_ROLE } from "@/lib/domain";
import { reorderRooms } from "@/lib/store";
import { requireStaffFromRequest } from "@/lib/session";

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export async function POST(request: NextRequest) {
  const auth = await requireStaffFromRequest(request, [USER_ROLE.ADMIN]);
  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = reorderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "排序参数不合法" },
      { status: 400 },
    );
  }

  try {
    const rooms = await reorderRooms(parsed.data.orderedIds);
    return NextResponse.json({ ok: true, rooms });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_ROOM_ORDER") {
      return NextResponse.json(
        { ok: false, message: "房间排序数据不完整" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, message: "更新房间排序失败" },
      { status: 500 },
    );
  }
}
