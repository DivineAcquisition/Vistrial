import type { ScenarioResult } from "@/lib/sentry/scenarios";

export const SENTRY_QUALITY_COLUMNS = "id, template_slug, created_at, passed, scenarios, passed_count, config_hash, results";

export function mapSentryQualityRow(row: Record<string, unknown>) {
  const results = Array.isArray(row.results) ? (row.results as ScenarioResult[]) : [];
  return {
    id: String(row.id),
    template: String(row.template_slug),
    createdAt: String(row.created_at),
    passed: row.passed === true,
    scenarios: Number(row.scenarios ?? results.length),
    passedCount: Number(row.passed_count ?? 0),
    configHash: (row.config_hash as string | null) ?? null,
    failures: results.filter((result) => !result.passed).map(({ label, expected, actual }) => ({ label, expected, actual })),
  };
}
