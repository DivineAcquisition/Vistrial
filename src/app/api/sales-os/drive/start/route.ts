import { NextResponse } from "next/server";

import { DRIVE_STATE_COOKIE, createDriveState, driveConfigured, driveConsentUrl } from "@/lib/sales-os/executions/drive";
import { salesOsActorOrNull } from "@/lib/sales-os/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await salesOsActorOrNull();
  if (!actor) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!actor.canExecute) return NextResponse.json({ error: "Only an owner or admin can connect Google Drive." }, { status: 403 });
  if (!driveConfigured()) {
    return NextResponse.json({ error: "Google Drive isn't set up on this deployment yet." }, { status: 503 });
  }
  const returnTo = new URL(request.url).searchParams.get("return") === "onboarding" ? "onboarding" : "settings";
  const state = createDriveState(actor.orgId, actor.memberId);
  const response = NextResponse.redirect(driveConsentUrl(state));
  const cookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/sales-os/drive",
    maxAge: 600,
  };
  response.cookies.set(DRIVE_STATE_COOKIE, state, cookie);
  response.cookies.set("vistrial_drive_return", returnTo, cookie);
  return response;
}
