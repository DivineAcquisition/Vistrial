import { NextResponse } from "next/server";

import { notifyStaffOfAbuse, savePublicRequest, verifyTurnstile } from "@/lib/access-requests/submit";
import { parseAccessForm, type RequestKind } from "@/lib/access-requests/validate";
import { requestIp } from "@/lib/ops/rate-limit";

export const dynamic = "force-dynamic";

/** Creates or updates a request. This route cannot read anything. */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!raw || typeof raw !== "object") return NextResponse.json({ ok: false }, { status: 400 });
  const body = raw as Record<string, unknown>;
  const kind: RequestKind = body.kind === "custom" ? "custom" : "private_access";
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (key === "lead_sources" && Array.isArray(value)) {
      for (const item of value) form.append("lead_sources", String(item));
    } else if (value != null && typeof value !== "object") {
      form.set(key, String(value));
    }
  }
  if (body.campaign && typeof body.campaign === "object") {
    form.set("campaign", JSON.stringify(body.campaign));
  }
  const parsed = parseAccessForm(form, kind);
  if (!parsed.ok) return NextResponse.json({ ok: false }, { status: 400 });
  const ip = requestIp(request);
  if (!(await verifyTurnstile(String(body["cf-turnstile-response"] ?? ""), ip))) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const saved = await savePublicRequest(parsed.value, ip);
  if (!saved.ok) {
    await notifyStaffOfAbuse();
    return NextResponse.json({ ok: false }, { status: saved.message.includes("wait") ? 429 : 400 });
  }
  return NextResponse.json({ ok: true });
}
