import { NextResponse } from "next/server";

import { getPublicRooms } from "@/lib/store";

export async function GET() {
  const rooms = await getPublicRooms();
  return NextResponse.json({ ok: true, rooms });
}
