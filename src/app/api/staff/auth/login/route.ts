import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { findAdminUserByUsername, hasAnyAdminUsers } from "@/lib/store";
import { setSessionCookie, signStaffSessionToken } from "@/lib/session";

const loginSchema = z.object({
  username: z.string().trim().min(3).max(32),
  password: z.string().min(6).max(128),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "用户名或密码格式错误" },
      { status: 400 },
    );
  }

  const user = await findAdminUserByUsername(parsed.data.username);

  if (!user || !user.active) {
    const hasUsers = await hasAnyAdminUsers();
    return NextResponse.json(
      {
        ok: false,
        message: hasUsers
          ? "账号不存在或已停用"
          : "尚未配置后台账号。生产环境请设置 SEED_ADMIN_USERNAME 和 SEED_ADMIN_PASSWORD。",
      },
      { status: 401 },
    );
  }

  const isValidPassword = await bcrypt.compare(
    parsed.data.password,
    user.passwordHash,
  );

  if (!isValidPassword) {
    return NextResponse.json(
      { ok: false, message: "用户名或密码不正确" },
      { status: 401 },
    );
  }

  const token = await signStaffSessionToken({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  const response = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
    },
  });

  setSessionCookie(response, token);
  return response;
}
