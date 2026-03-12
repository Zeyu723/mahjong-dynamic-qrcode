import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { generatePasscode } from "@/lib/security";
import { requireStaffFromRequest } from "@/lib/session";
import { openRound } from "@/lib/store";

const openRoundSchema = z
  .object({
    roomId: z.string().min(1),
    capacity: z.coerce.number().int().min(1).max(99),
    durationMinutes: z.coerce.number().int().min(1).max(1440).optional(),
    expiresAt: z.string().trim().max(64).optional().nullable(),
  })
  .transform((input) => ({
    ...input,
    expiresAt: input.expiresAt?.trim() || null,
    durationMinutes: input.durationMinutes ?? null,
  }))
  .superRefine((input, ctx) => {
    if (input.durationMinutes && input.expiresAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["durationMinutes"],
        message: "只能选择一种自动失效方式",
      });
    }
  });

export async function POST(request: NextRequest) {
  const auth = await requireStaffFromRequest(request);
  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = openRoundSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "开局参数不合法" },
      { status: 400 },
    );
  }

  try {
    const round = await openRound({
      roomId: parsed.data.roomId,
      passcode: generatePasscode(4),
      capacity: parsed.data.capacity,
      durationMinutes: parsed.data.durationMinutes,
      expiresAt: parsed.data.expiresAt,
    });

    return NextResponse.json({
      ok: true,
      round: {
        id: round.id,
        roomId: round.roomId,
        roomNameSnapshot: round.roomNameSnapshot,
        passcode: round.passcode,
        startedAt: round.startedAt,
        occupiedCount: round.occupiedCount,
        capacity: round.capacity,
        expiresAt: round.expiresAt,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "ROOM_NOT_FOUND") {
        return NextResponse.json(
          { ok: false, message: "房间不存在" },
          { status: 404 },
        );
      }

      if (error.message === "ROOM_DISABLED") {
        return NextResponse.json(
          { ok: false, message: "房间已停用，无法开局" },
          { status: 400 },
        );
      }

      if (error.message === "ROUND_EXISTS") {
        return NextResponse.json(
          { ok: false, message: "该房间已有进行中的牌局，请先结束本局" },
          { status: 409 },
        );
      }

      if (error.message === "INVALID_ROUND_INPUT") {
        return NextResponse.json(
          { ok: false, message: "人数上限或失效时间不合法" },
          { status: 400 },
        );
      }
    }

    return NextResponse.json(
      { ok: false, message: "开局失败" },
      { status: 500 },
    );
  }
}
