"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import { HELP_ARTICLE_TOPICS } from "@/lib/compass/help-topics";
import { createClient } from "@/lib/supabase/server";

/**
 * Staff controls for Compass. Every check is in the database as well:
 * limits and help articles are Platform Admin only; switching Compass on or
 * off is Platform Admins and the workspace's Service Team.
 */

export type StaffResult = { ok: true; message?: string } | { ok: false; error: string };

async function db() {
  return (await createClient()) as unknown as SupabaseClient;
}

function failure(message: string | undefined, fallback: string): StaffResult {
  const plain = message && !/violates|syntax|relation|function|column/i.test(message) ? message : fallback;
  return { ok: false, error: plain };
}

const LIMIT_KEYS = [
  "person_per_minute",
  "person_per_day",
  "workspace_per_day",
  "workspace_per_month",
  "max_question_chars",
  "max_turns",
  "warn_at_percent",
  "drafts_per_person_per_day",
] as const;

export async function saveCompassLimitsAction(input: Record<string, unknown>): Promise<StaffResult> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return { ok: false, error: "Only Platform Admins can change Compass limits." };
  const patch: Record<string, number> = {};
  for (const key of LIMIT_KEYS) {
    const value = Number(input[key]);
    if (!Number.isInteger(value) || value < 1 || value > 1_000_000) return { ok: false, error: "Each limit must be a whole number above zero." };
    patch[key] = value;
  }
  if (patch.warn_at_percent > 100) return { ok: false, error: "The warning point is a percent, from 1 to 100." };
  const { error } = await (await db()).rpc("compass_settings_save", { p_patch: patch });
  if (error) return failure(error.message, "Could not save the limits.");
  revalidatePath("/app/team/compass");
  return { ok: true, message: "Saved. New limits apply to the next question." };
}

export async function saveWorkspaceLimitsAction(input: {
  orgId: string;
  perDay: number | null;
  perMonth: number | null;
  personPerDay: number | null;
  note: string;
}): Promise<StaffResult> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return { ok: false, error: "Only Platform Admins can change Compass limits." };
  const clean = (value: number | null) => (value === null || Number.isNaN(value) ? null : Math.max(1, Math.round(value)));
  const { error } = await (await db()).rpc("compass_workspace_limits_save", {
    p_org_id: input.orgId,
    p_per_day: clean(input.perDay),
    p_per_month: clean(input.perMonth),
    p_person_per_day: clean(input.personPerDay),
    p_note: input.note.slice(0, 300),
  });
  if (error) return failure(error.message, "Could not save that workspace's limits.");
  revalidatePath("/app/team/compass");
  return { ok: true, message: "Saved for that workspace. Blank fields use the platform limits." };
}

export async function setCompassEnabledAction(enabled: boolean, reason: string): Promise<StaffResult> {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return { ok: false, error: "Only the Vistrial team can switch Compass on or off." };
  if (!enabled && !reason.trim()) return { ok: false, error: "Say why Compass is being switched off, in a sentence." };
  const { error } = await (await db()).rpc("compass_set_enabled", { p_org_id: ctx.org.id, p_enabled: enabled, p_reason: reason.slice(0, 300) });
  if (error) return failure(error.message, "Could not change Compass for this workspace.");
  revalidatePath("/app/team/compass");
  revalidatePath("/app/compass");
  return { ok: true, message: enabled ? "Compass is on for this workspace." : "Compass is off for this workspace." };
}

const SLUG = /^[a-z0-9][a-z0-9-]{1,60}$/;
const TOPICS = new Set<string>(HELP_ARTICLE_TOPICS);

export async function saveHelpArticleAction(input: {
  slug: string;
  topic: string;
  question: string;
  body: string;
  linkLabel: string;
  linkHref: string;
  sort: number;
  published: boolean;
}): Promise<StaffResult> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return { ok: false, error: "Only Platform Admins can edit help articles." };
  if (!SLUG.test(input.slug)) return { ok: false, error: "The address uses lowercase letters, numbers and dashes." };
  if (!TOPICS.has(input.topic)) return { ok: false, error: "Pick a topic." };
  if (!input.question.trim() || !input.body.trim()) return { ok: false, error: "Write the question and the answer." };
  if (input.linkHref && !input.linkHref.startsWith("/app/")) return { ok: false, error: "Links point to a page inside the app, starting /app/." };
  const { error } = await (await db()).rpc("help_article_save", {
    p_slug: input.slug,
    p_topic: input.topic,
    p_question: input.question.slice(0, 200),
    p_body: input.body.slice(0, 4000),
    p_link_label: input.linkLabel.slice(0, 60),
    p_link_href: input.linkHref.slice(0, 200),
    p_sort: Math.round(input.sort) || 100,
    p_published: input.published,
  });
  if (error) return failure(error.message, "Could not save that article.");
  revalidatePath("/app/team/compass/help");
  revalidatePath("/app/help");
  return { ok: true, message: "Saved. Compass and Help use it straight away." };
}

export async function deleteHelpArticleAction(slug: string): Promise<StaffResult> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return { ok: false, error: "Only Platform Admins can edit help articles." };
  const { error } = await (await db()).rpc("help_article_delete", { p_slug: slug });
  if (error) return failure(error.message, "Could not delete that article.");
  revalidatePath("/app/team/compass/help");
  revalidatePath("/app/help");
  return { ok: true, message: "Deleted." };
}
