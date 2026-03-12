import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { closeRound } from "@/lib/store";
import { requireStaffFromRequest } from "@/lib/session";

const closeRoundSchema = z.object({
  roundId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const auth = await requireStaffFromRequest(request);
  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = closeRoundSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "结束本局参数不合法" },
      { status: 400 },
    );
  }

  try {
    const round = await closeRound(parsed.data.roundId);
    return NextResponse.json({
      ok: true,
      message:
        round?.status === "CLOSED" ? "本局已结束" : "该局已经是结束状态",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ROUND_NOT_FOUND") {
      return NextResponse.json(
        { ok: false, message: "牌局不存在" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { ok: false, message: "结束本局失败" },
      { status: 500 },
    );
  }
}
