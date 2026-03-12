import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SCAN_RESULT } from "@/lib/domain";
import { getRequestMeta } from "@/lib/request-meta";
import { makeVisitorFingerprint, normalizeDisplayName } from "@/lib/security";
import { submitEntry } from "@/lib/store";

const entrySchema = z.object({
  roomId: z.string().min(1),
  displayName: z.string().trim().min(1).max(24),
  phoneLast4: z.string().regex(/^\d{4}$/),
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

  const displayName = normalizeDisplayName(parsed.data.displayName);
  const result = await submitEntry({
    roomId: parsed.data.roomId,
    displayName,
    phoneLast4: parsed.data.phoneLast4,
    passcode: parsed.data.passcode.trim(),
    fingerprint: makeVisitorFingerprint(displayName, parsed.data.phoneLast4),
    ipHash,
    ua,
  });

  return NextResponse.json(result, { status: result.status });
}
