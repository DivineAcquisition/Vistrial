import { NextResponse } from "next/server";

const MODES = new Set(["accept", "reject", "custom", "dismiss"]);

/** The choice itself lives in the browser cookie. This acknowledges the post. */
export async function POST(request: Request) {
  let mode = "";
  try {
    const body = await request.json();
    mode = typeof body?.mode === "string" ? body.mode : "";
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!MODES.has(mode)) return NextResponse.json({ ok: false }, { status: 400 });
  return NextResponse.json({ ok: true });
}
