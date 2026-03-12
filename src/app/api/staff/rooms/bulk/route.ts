import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { USER_ROLE } from "@/lib/domain";
import { createRoomsBulk } from "@/lib/store";
import { requireStaffFromRequest } from "@/lib/session";

const bulkRoomSchema = z.object({
  rawNames: z.string().trim().min(1).max(4000),
});

export async function POST(request: NextRequest) {
  const auth = await requireStaffFromRequest(request, [USER_ROLE.ADMIN]);
  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = bulkRoomSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "批量房间内容不合法" },
      { status: 400 },
    );
  }

  try {
    const result = await createRoomsBulk(parsed.data.rawNames);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_ROOM_BULK") {
      return NextResponse.json(
        { ok: false, message: "没有识别到可创建的房间名称" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, message: "批量创建房间失败" },
      { status: 500 },
    );
  }
}
