import { NextRequest } from "next/server";

import { hashValue } from "@/lib/security";

export function getRequestMeta(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const fallbackIp = request.headers.get("x-real-ip");
  const rawIp = forwardedFor?.split(",")[0]?.trim() || fallbackIp || "unknown";
  const userAgent = request.headers.get("user-agent");

  return {
    ipHash: hashValue(rawIp),
    ua: userAgent?.slice(0, 255) ?? null,
  };
}
