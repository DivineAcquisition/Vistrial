import type { GhlDb } from "@/lib/ghl/tokens";
import { MODEL_RATES_USD_PER_MTIME } from "@/lib/ops/constants";

function rateForModel(model: string): { input: number; output: number } {
  const lower = model.toLowerCase();
  if (lower.includes("opus")) {
    return { input: MODEL_RATES_USD_PER_MTIME.opusInput, output: MODEL_RATES_USD_PER_MTIME.opusOutput };
  }
  return { input: MODEL_RATES_USD_PER_MTIME.defaultInput, output: MODEL_RATES_USD_PER_MTIME.defaultOutput };
}

export function estimatedSpendUsd(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  const rate = rateForModel(args.model);
  return (args.inputTokens / 1_000_000) * rate.input + (args.outputTokens / 1_000_000) * rate.output;
}

export type OrgSpendRow = {
  orgId: string;
  orgName: string;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
};

export async function loadModelSpend(db: GhlDb, days = 30): Promise<{
  totalUsd: number;
  byOrg: OrgSpendRow[];
  trend: Array<{ day: string; usd: number }>;
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: usage }, { data: orgs }] = await Promise.all([
    db
      .from("extraction_usage")
      .select("org_id, model_version, input_tokens, output_tokens, created_at")
      .gte("created_at", since),
    db.from("organizations").select("id, name"),
  ]);

  const names = new Map((orgs ?? []).map((org) => [org.id, org.name]));
  const byOrg = new Map<string, OrgSpendRow>();
  const byDay = new Map<string, number>();
  let totalUsd = 0;

  for (const row of usage ?? []) {
    const usd = estimatedSpendUsd({
      model: row.model_version,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
    });
    totalUsd += usd;
    const current = byOrg.get(row.org_id) ?? {
      orgId: row.org_id,
      orgName: names.get(row.org_id) ?? row.org_id,
      inputTokens: 0,
      outputTokens: 0,
      estimatedUsd: 0,
    };
    current.inputTokens += row.input_tokens;
    current.outputTokens += row.output_tokens;
    current.estimatedUsd += usd;
    byOrg.set(row.org_id, current);
    const day = row.created_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + usd);
  }

  const trend = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, usd]) => ({ day, usd }));

  return {
    totalUsd,
    byOrg: [...byOrg.values()].sort((a, b) => b.estimatedUsd - a.estimatedUsd),
    trend,
  };
}
