"use server";

import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import { describeValue } from "@/lib/config/format";
import { FIELD_BY_KEY } from "@/lib/config/registry";
import { diffValues, resolveConfig } from "@/lib/config/resolve";
import { getEffectiveConfig } from "@/lib/config/server";
import { defaultSampleLead, runConfigTest } from "@/lib/config/test-run";
import type { ConfigValue, ConfigValues } from "@/lib/config/types";
import { isMissing, validateFieldValue } from "@/lib/config/validate";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type ConfigActionResult =
  | { ok: true; message?: string; version?: number }
  | { ok: false; error: string; conflict?: boolean };

/**
 * Every action runs under the person's own session: the database checks the
 * permission again (staff of this workspace, template access, Platform Admin
 * for locked rules), records who did it, and refuses anything the screen
 * should not have offered. The checks here only give a clearer message first.
 */
async function requireStaffSession(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return { ok: false, error: "Configuration is managed by the Vistrial team." };
  return { ok: true };
}

function dbFailure(error: { message?: string; hint?: string } | null, fallback: string): ConfigActionResult {
  const message = error?.message?.trim() ?? "";
  const conflict = error?.hint === "config_conflict";
  // Our own RAISE messages are written for people; anything else is not shown.
  const readable = /^[A-Z"][^\n]{3,400}[.?]$/.test(message) ? message : fallback;
  return { ok: false, error: readable, conflict };
}

function revalidateConfig() {
  revalidatePath("/app/settings/configuration", "layout");
  revalidatePath("/app/team", "layout");
}

export async function saveConfigField(args: {
  layerId: string;
  expectedVersion: number;
  key: string;
  /** undefined resets the field to what it inherits. */
  value?: ConfigValue;
  note?: string;
}): Promise<ConfigActionResult> {
  const gate = await requireStaffSession();
  if (!gate.ok) return gate;
  const field = FIELD_BY_KEY[args.key];
  if (!field) return { ok: false, error: "That is not a setting Vistrial knows about." };

  const resetting = args.value === undefined || isMissing(field, args.value);
  if (!resetting) {
    const problems = validateFieldValue(field, args.value);
    if (problems.length) return { ok: false, error: problems.join(" ") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("config_save_layer", {
    p_layer_id: args.layerId,
    p_expected_version: args.expectedVersion,
    p_set: resetting ? {} : ({ [args.key]: args.value } as Json),
    p_unset: resetting ? [args.key] : [],
    p_note: args.note?.trim() || null,
  });
  if (error) return dbFailure(error, "Could not save that setting.");
  revalidateConfig();
  return { ok: true, version: data ?? undefined, message: resetting ? "Now inherited." : "Saved." };
}

export async function setFieldLock(args: {
  layerId: string;
  expectedVersion: number;
  key: string;
  locked: boolean;
  note: string;
}): Promise<ConfigActionResult> {
  const gate = await requireStaffSession();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("config_save_layer", {
    p_layer_id: args.layerId,
    p_expected_version: args.expectedVersion,
    p_lock: args.locked ? [args.key] : [],
    p_unlock: args.locked ? [] : [args.key],
    p_note: args.note.trim() || null,
  });
  if (error) return dbFailure(error, "Could not change the lock.");
  revalidateConfig();
  return { ok: true, version: data ?? undefined, message: args.locked ? "Locked everywhere below." : "Unlocked." };
}

export async function rollbackLayer(args: { layerId: string; toVersion: number; note?: string }): Promise<ConfigActionResult> {
  const gate = await requireStaffSession();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("config_rollback_layer", {
    p_layer_id: args.layerId,
    p_to_version: args.toVersion,
    p_note: args.note?.trim() || null,
  });
  if (error) return dbFailure(error, "Could not roll back.");
  revalidateConfig();
  return { ok: true, version: data ?? undefined, message: `Rolled back. That is now version ${data}.` };
}

export async function decideNotice(args: {
  noticeId: string;
  decision: "accept" | "decline" | "postpone";
  note?: string;
  postponeDays?: number;
}): Promise<ConfigActionResult> {
  const gate = await requireStaffSession();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { error } = await supabase.rpc("config_decide_notice", {
    p_notice_id: args.noticeId,
    p_decision: args.decision,
    p_note: args.note?.trim() || null,
    p_postpone_days: args.postponeDays ?? 7,
  });
  if (error) return dbFailure(error, "Could not record that decision.");
  revalidateConfig();
  return {
    ok: true,
    message: args.decision === "accept" ? "Accepted. It applies now." : args.decision === "decline" ? "Declined. It will not come back for this version." : "Postponed.",
  };
}

export async function switchTemplate(args: {
  orgId: string;
  templateId: string;
  dropKeys: string[];
  confirm: boolean;
  note?: string;
}): Promise<ConfigActionResult> {
  const gate = await requireStaffSession();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { error } = await supabase.rpc("config_switch_template", {
    p_org_id: args.orgId,
    p_template_id: args.templateId,
    p_drop_keys: args.dropKeys,
    p_confirm: args.confirm,
    p_note: args.note?.trim() || null,
  });
  if (error) return dbFailure(error, "Could not switch the template.");
  revalidateConfig();
  return { ok: true, message: "Switched. The workspace now follows the new template." };
}

export async function setAutoAccept(orgId: string, on: boolean): Promise<ConfigActionResult> {
  const gate = await requireStaffSession();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { error } = await supabase.rpc("config_set_auto_accept", { p_org_id: orgId, p_on: on });
  if (error) return dbFailure(error, "Could not change that.");
  revalidateConfig();
  return { ok: true };
}

/**
 * The go-live check: the full checks (including those across fields), plus a
 * test run with a sample lead that sends nothing. Ready is recorded against
 * this exact configuration version; any later change needs a new check.
 */
export async function checkReadiness(orgId: string, markReady: boolean): Promise<ConfigActionResult> {
  const gate = await requireStaffSession();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const config = await getEffectiveConfig(supabase, orgId);
  const missing = config.issues.filter((issue) => issue.kind === "missing");
  const problems = config.issues.filter((issue) => issue.kind === "invalid");
  const testRun = runConfigTest(config.values, defaultSampleLead(new Date()));
  const ready = markReady && config.issues.length === 0 && testRun.every((step) => step.ok);

  const { error } = await supabase.rpc("config_record_readiness", {
    p_org_id: orgId,
    p_version: config.version,
    p_ready: ready,
    p_missing: missing as unknown as Json,
    p_problems: problems as unknown as Json,
    p_test_run: testRun as unknown as Json,
  });
  if (error) return dbFailure(error, "Could not record the check.");
  revalidateConfig();
  if (markReady && !ready) {
    return { ok: false, error: `Not ready yet: ${config.issues.length} setting${config.issues.length === 1 ? "" : "s"} need attention.` };
  }
  return { ok: true, message: ready ? "Marked ready to go live for this configuration version." : "Checked." };
}

export async function setOwnerHours(orgId: string, hours: ConfigValue, expectedVersion: number): Promise<ConfigActionResult> {
  const ctx = await getAuthContext();
  if (ctx.role !== "owner") return { ok: false, error: "Only the owner can change business hours here." };
  const problems = validateFieldValue(FIELD_BY_KEY["identity.business_hours"], hours);
  if (problems.length) return { ok: false, error: problems.join(" ") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("config_owner_set_hours", {
    p_org_id: orgId,
    p_hours: hours as Json,
    p_expected_version: expectedVersion,
  });
  if (error) return dbFailure(error, "Could not save business hours.");
  revalidatePath("/app/settings/organization");
  return { ok: true, message: "Business hours saved." };
}

// --- Templates and the platform default (staff with template access; Platform Admin for status and locks)

export async function createTemplate(args: {
  name: string;
  slug: string;
  description: string;
  fromTemplateId?: string | null;
  fromOrgId?: string | null;
}): Promise<ConfigActionResult & { id?: string }> {
  const gate = await requireStaffSession();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("config_create_template", {
    p_name: args.name.trim(),
    p_slug: args.slug.trim(),
    p_description: args.description.trim(),
    p_from_template: args.fromTemplateId ?? null,
    p_from_org: args.fromOrgId ?? null,
  });
  if (error) return dbFailure(error, "Could not create the template.");
  revalidateConfig();
  return { ok: true, id: data ?? undefined, message: "Template created as a draft." };
}

export async function updateTemplateDetails(templateId: string, name: string, description: string): Promise<ConfigActionResult> {
  const gate = await requireStaffSession();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { error } = await supabase.rpc("config_update_template_details", {
    p_template_id: templateId,
    p_name: name.trim(),
    p_description: description.trim(),
  });
  if (error) return dbFailure(error, "Could not save the details.");
  revalidateConfig();
  return { ok: true, message: "Saved." };
}

export async function setTemplateStatus(templateId: string, status: "draft" | "active" | "retired", note?: string): Promise<ConfigActionResult> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return { ok: false, error: "Only a Platform Admin can activate or retire a template." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("config_set_template_status", {
    p_template_id: templateId,
    p_status: status,
    p_note: note?.trim() || null,
  });
  if (error) return dbFailure(error, "Could not change the status.");
  revalidateConfig();
  return { ok: true, message: status === "active" ? "Active. New workspaces can use it." : status === "retired" ? "Retired. Workspaces on it keep working." : "Back to draft." };
}

export type SwitchPreview = {
  ok: true;
  live: boolean;
  changes: Array<{ key: string; label: string; before: string; after: string }>;
  /** This workspace's own values that will keep overriding the new template. */
  overrides: Array<{ key: string; label: string; value: string }>;
};

/** What would change for this workspace on another template, before anyone confirms. */
export async function previewTemplateSwitch(orgId: string, templateId: string): Promise<SwitchPreview | { ok: false; error: string }> {
  const gate = await requireStaffSession();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const [current, { data: target }, { data: template }, { data: platform }, { data: workspace }, { data: org }] = await Promise.all([
    getEffectiveConfig(supabase, orgId),
    supabase.from("config_layers").select("*").eq("level", "template").eq("template_id", templateId).maybeSingle(),
    supabase.from("config_templates").select("slug, status").eq("id", templateId).maybeSingle(),
    supabase.from("config_layers").select("*").eq("level", "platform").maybeSingle(),
    supabase.from("config_layers").select("*").eq("level", "workspace").eq("org_id", orgId).maybeSingle(),
    supabase.from("organizations").select("status").eq("id", orgId).maybeSingle(),
  ]);
  if (!target || !template || !platform) return { ok: false, error: "That template could not be read." };
  if (template.status !== "active") return { ok: false, error: "Only active templates can be chosen." };
  const snap = (row: { field_values: unknown; locked_keys: string[] | null; version: number }) => ({
    values: (row.field_values ?? {}) as ConfigValues,
    lockedKeys: row.locked_keys ?? [],
    version: row.version,
  });
  const next = resolveConfig({
    platform: snap(platform),
    template: { ...snap(target), slug: template.slug },
    workspace: workspace ? snap(workspace) : null,
  });
  const ownValues = (workspace?.field_values ?? {}) as ConfigValues;
  return {
    ok: true,
    live: org?.status === "active",
    changes: diffValues(current.values, next.values).map((change) => ({
      key: change.key,
      label: FIELD_BY_KEY[change.key]?.label ?? change.key,
      before: describeValue(change.key, change.before),
      after: describeValue(change.key, change.after),
    })),
    overrides: Object.keys(ownValues)
      .filter((key) => !FIELD_BY_KEY[key]?.workspaceOnly)
      .map((key) => ({ key, label: FIELD_BY_KEY[key]?.label ?? key, value: describeValue(key, ownValues[key]) })),
  };
}
