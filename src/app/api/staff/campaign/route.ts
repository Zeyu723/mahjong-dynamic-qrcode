import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { USER_ROLE } from "@/lib/domain";
import { ensureDefaultCampaign, updateCampaign } from "@/lib/campaign";
import { requireStaffFromRequest } from "@/lib/session";

const campaignSchema = z.object({
  name: z.string().trim().min(1).max(60),
  targetUrl: z.string().trim().url().max(2048),
  status: z.enum(["RUNNING", "PAUSED"]),
});

export async function GET(request: NextRequest) {
  const auth = await requireStaffFromRequest(request);
  if ("response" in auth) {
    return auth.response;
  }

  const campaign = await ensureDefaultCampaign();
  return NextResponse.json({ ok: true, campaign });
}

export async function PUT(request: NextRequest) {
  const auth = await requireStaffFromRequest(request, [USER_ROLE.ADMIN]);
  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = campaignSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "活动配置参数不合法" },
      { status: 400 },
    );
  }

  try {
    const campaign = await updateCampaign(parsed.data);
    return NextResponse.json({ ok: true, campaign });
  } catch {
    return NextResponse.json(
      { ok: false, message: "保存活动配置失败" },
      { status: 500 },
    );
  }
}
