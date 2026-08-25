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
  extractionUsd: number;
  agentUsd: number;
  verificationUsd: number;
};

export async function loadModelSpend(db: GhlDb, days = 30): Promise<{
  totalUsd: number;
  byOrg: OrgSpendRow[];
  trend: Array<{ day: string; usd: number }>;
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: usage }, { data: agentRuns }, { data: verificationUsage }, { data: orgs }] = await Promise.all([
    db
      .from("extraction_usage")
      .select("org_id, model_version, input_tokens, output_tokens, created_at")
      .gte("created_at", since),
    db
      .from("operator_runs")
      .select("org_id, model, input_tokens, output_tokens, created_at")
      .gte("created_at", since),
    db
      .from("verification_usage")
      .select("org_id, model, input_tokens, output_tokens, created_at")
      .gte("created_at", since),
    db.from("organizations").select("id, name"),
  ]);

  const names = new Map((orgs ?? []).map((org) => [org.id, org.name]));
  const byOrg = new Map<string, OrgSpendRow>();
  const byDay = new Map<string, number>();
  let totalUsd = 0;

  function add(args: {
    orgId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    createdAt: string;
    source: "extraction" | "agent" | "verification";
  }) {
    const usd = estimatedSpendUsd({
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
    });
    totalUsd += usd;
    const current = byOrg.get(args.orgId) ?? {
      orgId: args.orgId,
      orgName: names.get(args.orgId) ?? args.orgId,
      inputTokens: 0,
      outputTokens: 0,
      estimatedUsd: 0,
      extractionUsd: 0,
      agentUsd: 0,
      verificationUsd: 0,
    };
    current.inputTokens += args.inputTokens;
    current.outputTokens += args.outputTokens;
    current.estimatedUsd += usd;
    if (args.source === "extraction") current.extractionUsd += usd;
    else if (args.source === "agent") current.agentUsd += usd;
    else current.verificationUsd += usd;
    byOrg.set(args.orgId, current);
    const day = args.createdAt.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + usd);
  }

  for (const row of usage ?? []) {
    add({
      orgId: row.org_id,
      model: row.model_version,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      createdAt: row.created_at,
      source: "extraction",
    });
  }
  for (const row of agentRuns ?? []) {
    add({
      orgId: row.org_id,
      model: row.model ?? "claude-sonnet-4-6",
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      createdAt: row.created_at,
      source: "agent",
    });
  }
  for (const row of verificationUsage ?? []) {
    add({
      orgId: row.org_id,
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      createdAt: row.created_at,
      source: "verification",
    });
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
