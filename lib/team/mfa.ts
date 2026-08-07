import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { hashToken } from "@/lib/portal/tokens";
import { createServiceClient } from "@/lib/supabase/server";

/** Generate recovery codes once; only hashes are stored. */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(5).toString("hex").toUpperCase()
  );
}

export async function replaceRecoveryCodes(
  teamUserId: string,
  codes: string[]
): Promise<void> {
  const db = createServiceClient();
  await db.from("team_mfa_recovery_codes").delete().eq("team_user_id", teamUserId);
  const rows = codes.map((code) => ({
    team_user_id: teamUserId,
    code_hash: hashToken(code),
  }));
  const { error } = await db.from("team_mfa_recovery_codes").insert(rows);
  if (error) throw new Error(error.message);
}

export async function consumeRecoveryCode(
  teamUserId: string,
  code: string
): Promise<boolean> {
  const db = createServiceClient();
  const hash = hashToken(code.trim().toUpperCase());
  // Also try the raw trimmed form hash for codes stored as typed.
  const alt = hashToken(code.trim());

  for (const candidate of [hash, alt]) {
    const { data } = await db
      .from("team_mfa_recovery_codes")
      .select("id")
      .eq("team_user_id", teamUserId)
      .eq("code_hash", candidate)
      .is("used_at", null)
      .maybeSingle();
    if (data) {
      await db
        .from("team_mfa_recovery_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", data.id);
      return true;
    }
  }
  return false;
}

export function hashRecoveryLookup(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}
