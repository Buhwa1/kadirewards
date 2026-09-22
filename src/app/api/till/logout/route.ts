import { NextResponse } from "next/server";
import { clearTillCookie } from "@/lib/till-session";

export async function POST() {
  await clearTillCookie();
  return NextResponse.json({ ok: true });
}
