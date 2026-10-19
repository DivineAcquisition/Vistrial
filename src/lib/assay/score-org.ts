import { buildAssayInput, readOffers, type RawLead, type RawOrgContext } from "@/lib/assay/build";
import { computeAssayScore, type AssayResult } from "@/lib/assay/compute";
import type { FieldMapCheck } from "@/lib/assay/inputs";
import { parseRules, type AssayRules, type RulesProblem } from "@/lib/assay/rules";
import { ASSAY_PLATFORM_DEFAULTS, ASSAY_TEMPLATE_VALUES } from "@/lib/assay/templates";
import { stickyTier } from "@/lib/assay/tiers";
import type { Tier } from "@/lib/assay/vocabulary";

/**
 * Scoring a workspace's leads through a small storage interface, so the same
 * code runs from the queue (Supabase) and from local test scripts (psql).
 * Rules scoring never calls AI.
 */

export type ScoreCause = "event" | "nightly" | "rules_change" | "rollback" | "history_import" | "migration" | "reopened" | "manual";

export type ScoreRow = {
  leadId: string;
  score: number;
  tier: Tier;
  early: boolean;
  contactable: boolean;
  noCall: boolean;
  callPending: boolean;
  parts: AssayResult["parts"];
  raising: AssayResult["raising"];
  lowering: AssayResult["lowering"];
  unclear: AssayResult["unclear"];
  notes: string[];
  rulesVersion: string;
  configVersion: string;
  inputsHash: string;
  cause: ScoreCause;
  historic: boolean;
  asOf: string;
};

export type AssayStore = {
  config(orgId: string): Promise<{ values: Record<string, unknown>; slug: string | null; version: string }>;
  context(orgId: string): Promise<RawOrgContext>;
  leads(orgId: string, page: { after: string | null; ids: string[] | null; limit: number }): Promise<RawLead[]>;
  write(orgId: string, rows: ScoreRow[]): Promise<number>;
};

export type LoadedRules = {
  rules: AssayRules;
  problems: RulesProblem[];
  offers: ReturnType<typeof readOffers>;
  configVersion: string;
};

/**
 * Assay's settings for a workspace. A workspace pinned to a configuration
 * version from before Assay gets its template's starting rules for any
 * Assay setting it does not hold yet.
 */
export function rulesFromConfig(config: { values: Record<string, unknown>; slug: string | null; version: string }): LoadedRules {
  const base = (config.slug && ASSAY_TEMPLATE_VALUES[config.slug]) || ASSAY_PLATFORM_DEFAULTS;
  const values: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(config.values)) {
    if (key.startsWith("assay.") && value !== undefined && value !== null) values[key] = value;
  }
  const { rules, problems } = parseRules(values);
  return { rules, problems, offers: readOffers(config.values["industry.offers"]), configVersion: config.version };
}

export function scoreRow(
  lead: RawLead,
  ctx: { org: RawOrgContext; loaded: LoadedRules; now: string; cause: ScoreCause; historic: boolean }
): { row: ScoreRow; fieldMap: FieldMapCheck } {
  const built = buildAssayInput(lead, { org: ctx.org, rules: ctx.loaded.rules, offers: ctx.loaded.offers, now: ctx.now });
  const result = computeAssayScore(built.input, ctx.loaded.rules, built.asOf);
  const tier = stickyTier(result.score, ctx.loaded.rules.tiers, built.previousTier, ctx.loaded.rules.stickiness);
  const notes = built.contactable ? result.notes : ["Do not contact. Not ranked for outreach.", ...result.notes];
  return {
    row: {
      leadId: lead.id,
      score: result.score,
      tier,
      early: result.early,
      contactable: built.contactable,
      noCall: result.noCall,
      callPending: result.callPending,
      parts: result.parts,
      raising: result.raising,
      lowering: result.lowering,
      unclear: result.unclear,
      notes,
      rulesVersion: result.rulesVersion,
      configVersion: ctx.loaded.configVersion,
      inputsHash: result.inputsHash,
      cause: ctx.cause,
      historic: ctx.historic || lead.historic,
      asOf: built.asOf,
    },
    fieldMap: built.fieldMap,
  };
}

export type OrgRun = {
  scored: number;
  ignoredFields: FieldMapCheck["ignored"];
  problems: RulesProblem[];
};

/**
 * Score every lead in a workspace (or just `ids`). Closed leads keep their
 * last score: they are scored only when they have none, as of their close.
 */
export async function scoreWorkspace(
  store: AssayStore,
  orgId: string,
  opts: { cause: ScoreCause; historic: boolean; now?: string; ids?: string[] | null; pageSize?: number }
): Promise<OrgRun> {
  const now = opts.now ?? new Date().toISOString();
  const [config, org] = await Promise.all([store.config(orgId), store.context(orgId)]);
  const loaded = rulesFromConfig(config);
  const pageSize = opts.pageSize ?? 200;
  let after: string | null = null;
  let scored = 0;
  let ignored: FieldMapCheck["ignored"] = [];

  for (;;) {
    const page = await store.leads(orgId, { after, ids: opts.ids ?? null, limit: pageSize });
    if (!page.length) break;
    const rows: ScoreRow[] = [];
    for (const lead of page) {
      if (lead.status === "closed_won" || lead.status === "closed_lost") {
        if (lead.previous) continue;
      }
      const { row, fieldMap } = scoreRow(lead, { org, loaded, now, cause: opts.cause, historic: opts.historic });
      rows.push(row);
      ignored = fieldMap.ignored;
    }
    if (rows.length) scored += await store.write(orgId, rows);
    after = page[page.length - 1].id;
    if (opts.ids || page.length < pageSize) break;
  }

  return { scored, ignoredFields: ignored, problems: loaded.problems };
}
