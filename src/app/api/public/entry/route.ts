import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";

import { SCAN_RESULT } from "@/lib/domain";
import { getRequestMeta } from "@/lib/request-meta";
import { makeVisitorFingerprint } from "@/lib/security";
import { submitEntry } from "@/lib/store";

const entrySchema = z.object({
  roomId: z.string().min(1),
  passcode: z.string().trim().min(4).max(8),
});

export async function POST(request: NextRequest) {
  const { ipHash, ua } = getRequestMeta(request);
  const body = await request.json().catch(() => null);
  const parsed = entrySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: SCAN_RESULT.DENY_INVALID_INPUT,
        message: "提交信息格式错误",
      },
      { status: 400 },
    );
  }

  // Generate anonymous visitor identity since user info is now collected in external form
  const anonymousId = randomUUID().slice(0, 8);
  const displayName = `访客_${anonymousId}`;
  const phoneLast4 = "0000";

  const result = await submitEntry({
    roomId: parsed.data.roomId,
    displayName,
    phoneLast4,
    passcode: parsed.data.passcode.trim(),
    fingerprint: makeVisitorFingerprint(displayName, phoneLast4),
    ipHash,
    ua,
  });

  return NextResponse.json(result, { status: result.status });
}
