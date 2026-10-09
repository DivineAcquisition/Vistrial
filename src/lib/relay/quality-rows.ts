export const RELAY_QUALITY_COLUMNS = "id, template_slug, created_at, mode, passed, scenarios, passed_count, config_hash, results";

export type RelayQualityRow = {
  id: string;
  template: string;
  createdAt: string;
  mode: string;
  passed: boolean;
  scenarios: number;
  passedCount: number;
  configHash: string | null;
  failures: Array<{ label: string; detail: string }>;
};

export function mapRelayQualityRow(row: Record<string, unknown>): RelayQualityRow {
  const results = Array.isArray(row.results) ? (row.results as Array<{ label: string; detail: string; passed: boolean }>) : [];
  return {
    id: String(row.id),
    template: String(row.template_slug),
    createdAt: String(row.created_at),
    mode: String(row.mode),
    passed: row.passed === true,
    scenarios: Number(row.scenarios ?? results.length),
    passedCount: Number(row.passed_count ?? 0),
    configHash: (row.config_hash as string | null) ?? null,
    failures: results.filter((result) => !result.passed).map(({ label, detail }) => ({ label, detail })),
  };
}
