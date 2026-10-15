import { NextResponse } from "next/server";

import { suppressLifecycleEmail } from "@/lib/email/send-guard";

export const dynamic = "force-dynamic";

function page(message: string): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Vistrial email</title></head><body style="font-family:Helvetica,Arial,sans-serif;padding:40px;color:#1c1b22;"><p>${message}</p></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

/** One-click unsubscribe (List-Unsubscribe-Post) and the confirm button. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  if (!token) return page("This unsubscribe link is missing its token.");
  const ok = await suppressLifecycleEmail(token);
  if (!ok) return page("This unsubscribe link is not valid.");
  return page("You will no longer get setup tips or product updates from Vistrial. Account, billing, and security emails will still be sent.");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  if (!token) return page("This unsubscribe link is missing its token.");
  return page(
    `Stop setup tips and product updates from Vistrial. Account, billing, and security emails will still be sent.<form method="post" action="/email/unsubscribe?token=${encodeURIComponent(token)}"><button type="submit">Unsubscribe</button></form>`
  );
}
