import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { AdminUser, UserRole, USER_ROLE } from "@/lib/domain";
import { findAdminUserById, findAdminUserByUsername } from "@/lib/store";

const SESSION_COOKIE = "staff_session";
const SEVEN_DAYS_IN_SECONDS = 60 * 60 * 24 * 7;

type SessionTokenPayload = {
  userId: string;
  username: string;
  role: UserRole;
};

export type CurrentStaffUser = Pick<
  AdminUser,
  "id" | "username" | "role" | "active"
>;

function getJwtSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET ?? "dev-only-change-me";
  return new TextEncoder().encode(secret);
}

export async function signStaffSessionToken(
  payload: SessionTokenPayload,
): Promise<string> {
  return new SignJWT({
    username: payload.username,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SEVEN_DAYS_IN_SECONDS}s`)
    .sign(getJwtSecret());
}

async function parseSessionToken(
  token: string | undefined,
): Promise<SessionTokenPayload | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ["HS256"],
    });

    const userId = payload.sub;
    const username = payload.username;
    const role = payload.role;

    if (
      typeof userId !== "string" ||
      typeof username !== "string" ||
      (role !== USER_ROLE.ADMIN && role !== USER_ROLE.STAFF)
    ) {
      return null;
    }

    return {
      userId,
      username,
      role,
    };
  } catch {
    return null;
  }
}

async function getValidUserBySession(
  session: SessionTokenPayload | null,
): Promise<CurrentStaffUser | null> {
  if (!session) {
    return null;
  }

  const user =
    (await findAdminUserById(session.userId)) ??
    (await findAdminUserByUsername(session.username));

  if (user && user.role !== session.role) {
    return null;
  }

  if (!user || !user.active) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    active: user.active,
  };
}

export async function getCurrentStaffUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = await parseSessionToken(token);
  return getValidUserBySession(session);
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SEVEN_DAYS_IN_SECONDS,
    path: "/",
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}

export async function requireStaffFromRequest(
  request: NextRequest,
  allowedRoles: UserRole[] = [USER_ROLE.ADMIN, USER_ROLE.STAFF],
) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await parseSessionToken(token);
  const user = await getValidUserBySession(session);

  if (!user) {
    return {
      response: NextResponse.json(
        { ok: false, message: "请先登录后台" },
        { status: 401 },
      ),
    };
  }

  if (!allowedRoles.includes(user.role)) {
    return {
      response: NextResponse.json(
        { ok: false, message: "权限不足" },
        { status: 403 },
      ),
    };
  }

  return { user };
}
