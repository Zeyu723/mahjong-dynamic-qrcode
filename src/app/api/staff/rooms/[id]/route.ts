import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { USER_ROLE } from "@/lib/domain";
import { deleteRoom, setRoomActive } from "@/lib/store";
import { requireStaffFromRequest } from "@/lib/session";

const updateRoomSchema = z.object({
  active: z.boolean(),
});

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireStaffFromRequest(request, [USER_ROLE.ADMIN]);
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateRoomSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "房间参数不合法" },
      { status: 400 },
    );
  }

  try {
    await setRoomActive(id, parsed.data.active);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "ROOM_NOT_FOUND") {
      return NextResponse.json(
        { ok: false, message: "房间不存在" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { ok: false, message: "更新房间状态失败" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireStaffFromRequest(request, [USER_ROLE.ADMIN]);
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await params;

  try {
    await deleteRoom(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "ROOM_NOT_FOUND") {
      return NextResponse.json(
        { ok: false, message: "房间不存在" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { ok: false, message: "删除房间失败" },
      { status: 500 },
    );
  }
}
