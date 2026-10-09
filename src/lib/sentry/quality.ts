import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { shortHash, stableStringify } from "@/lib/config/resolve";
import { CONFIG_FIELDS } from "@/lib/config/registry";
import { SEED_TEMPLATES } from "@/lib/config/seeds";
import { runSentryScenarios, type ScenarioResult } from "@/lib/sentry/scenarios";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const SENTRY_QUALITY_TEMPLATES = SEED_TEMPLATES.map((template) => template.slug);

/** A template's current settings: registry defaults, the platform level, then the template. */
export async function templateConfigValues(db: SupabaseClient, template: string): Promise<Record<string, unknown>> {
  const [{ data: platformLayer }, { data: templateRow }] = await Promise.all([
    db.from("config_layers").select("field_values").eq("level", "platform").maybeSingle(),
    db.from("config_templates").select("id").eq("slug", template).maybeSingle(),
  ]);
  const { data: templateLayer } = templateRow
    ? await db.from("config_layers").select("field_values").eq("level", "template").eq("template_id", (templateRow as { id: string }).id).maybeSingle()
    : { data: null };
  const defaults = Object.fromEntries(CONFIG_FIELDS.filter((field) => field.platformDefault !== undefined).map((field) => [field.key, field.platformDefault]));
  const seeded = SEED_TEMPLATES.find((row) => row.slug === template)?.values ?? {};
  return {
    ...defaults,
    ...(((platformLayer as { field_values?: Record<string, unknown> } | null)?.field_values) ?? {}),
    ...(((templateLayer as { field_values?: Record<string, unknown> } | null)?.field_values) ?? seeded),
  };
}

/**
 * Runs the scenario check against a template's current settings (platform
 * default under the template) and stores the result. Synthetic leads only.
 */
export async function runSentryQuality(template: string, createdBy: string | null): Promise<{ passed: boolean; results: ScenarioResult[] }> {
  const db = getSupabaseAdmin() as unknown as SupabaseClient;
  const values = await templateConfigValues(db, template);
  const results = runSentryScenarios(values);
  const passedCount = results.filter((row) => row.passed).length;
  const passed = passedCount === results.length;
  const relevant = Object.fromEntries(Object.entries(values).filter(([key]) => key.startsWith("response.") || key.startsWith("escalation.")));
  await db.from("sentry_quality_runs").insert({
    template_slug: template,
    config_hash: shortHash(stableStringify(relevant)),
    scenarios: results.length,
    passed_count: passedCount,
    results,
    passed,
    created_by: createdBy,
  });
  return { passed, results };
}
