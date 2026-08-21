"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getStaffContext } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { isOrgTimezone } from "@/lib/timezones";

export type CreateOrgResult =
  | { status: "idle" }
  | { status: "error"; error: string };

export async function createClientOrg(
  _prev: CreateOrgResult,
  formData: FormData
): Promise<CreateOrgResult> {
  void _prev;
  await getStaffContext();
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "");
  const slug = String(formData.get("slug") ?? "").trim() || null;
  const ownerEmail = String(formData.get("owner_email") ?? "").trim() || null;
  if (name.length < 2) return { status: "error", error: "Organization name is required." };
  if (!isOrgTimezone(timezone)) return { status: "error", error: "Choose a supported timezone." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_client_org", {
    p_name: name,
    p_timezone: timezone,
    p_slug: slug,
    p_owner_email: ownerEmail,
  });
  if (error) return { status: "error", error: error.message };
  const row = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const orgId = typeof row.org_id === "string" ? row.org_id : null;
  if (!orgId) return { status: "error", error: "The organization was not created." };
  revalidatePath("/ops");
  const token = typeof row.invite_token === "string" ? row.invite_token : "";
  redirect(token ? `/ops/orgs/${orgId}?invite=${encodeURIComponent(token)}` : `/ops/orgs/${orgId}`);
}
