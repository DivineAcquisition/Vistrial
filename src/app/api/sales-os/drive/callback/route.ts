import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { appUrl } from "@/lib/app-url";
import { encryptSecret } from "@/lib/ghl/crypto";
import {
  DRIVE_ROOT_FOLDER,
  DRIVE_STATE_COOKIE,
  createDriveFolder,
  exchangeDriveCode,
  parseDriveState,
} from "@/lib/sales-os/executions/drive";
import { salesOsActorOrNull } from "@/lib/sales-os/session";

export const dynamic = "force-dynamic";

const SETTINGS_PATH = "/app/settings/vistrial";

function back(result: string, returnTo: string | null) {
  const path = returnTo === "onboarding" ? "/app/onboarding/vistrial" : SETTINGS_PATH;
  const response = NextResponse.redirect(`${appUrl()}${path}?drive=${encodeURIComponent(result)}`);
  response.cookies.delete({ name: DRIVE_STATE_COOKIE, path: "/api/sales-os/drive" });
  response.cookies.delete({ name: "vistrial_drive_return", path: "/api/sales-os/drive" });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(DRIVE_STATE_COOKIE)?.value ?? "";
  const returnTo = cookieStore.get("vistrial_drive_return")?.value ?? null;
  const stateParam = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return back("cancelled", returnTo);
  if (!code || !stateParam || stateParam !== cookieState) return back("expired", returnTo);
  const state = parseDriveState(stateParam);
  if (!state) return back("expired", returnTo);

  const actor = await salesOsActorOrNull();
  if (!actor || actor.orgId !== state.orgId || actor.memberId !== state.memberId || !actor.canExecute) {
    return back("not_allowed", returnTo);
  }

  try {
    const tokens = await exchangeDriveCode(code);
    const rootId = await createDriveFolder(tokens.accessToken, DRIVE_ROOT_FOLDER, null);
    await actor.db
      .from("sales_os_destinations")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("org_id", actor.orgId)
      .eq("kind", "google_drive")
      .eq("active", true);
    const { error } = await actor.db.from("sales_os_destinations").insert({
      org_id: actor.orgId,
      kind: "google_drive",
      label: "Google Drive",
      account_label: tokens.email,
      external_ref: rootId,
      secret_ciphertext: encryptSecret(tokens.refreshToken),
      created_by_member_id: actor.memberId,
    });
    if (error) return back("failed", returnTo);
    return back("connected", returnTo);
  } catch {
    return back("failed", returnTo);
  }
}
