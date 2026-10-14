import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Ask Vistrial's chat is now Compass (/api/compass/chat). This route answers
 * plainly instead of running the old chat, so nothing can reach the old
 * conversation path around Compass's privacy, limits and lookups. The script
 * and delivery capabilities it used stay in src/lib/sales-os for when they
 * return as approval-gated Compass suggestions.
 */
export async function POST() {
  return NextResponse.json({ error: "Ask Vistrial is now Compass. Open Compass to keep asking." }, { status: 410 });
}
