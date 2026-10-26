import { NextResponse } from "next/server";

/** Public page counts are not stored in this restart. The call stays quiet. */
export async function POST(request: Request) {
  try {
    await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
