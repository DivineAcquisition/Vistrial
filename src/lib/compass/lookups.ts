import "server-only";

import { randomUUID } from "node:crypto";

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import { AGENTS } from "@/lib/agents/roster";
import type { CompassActor } from "@/lib/compass/actor";
import { figureFor, hiddenMetrics, parseSummary, shareFor, type Figure, type ShareFigure } from "@/lib/compass/figures";
import { searchHelp, type HelpArticle } from "@/lib/compass/help-search";
import { COMPASS_RANGE_KEYS, compassRange, drillHref, rangeLabel } from "@/lib/compass/ranges";
import type { CompassSource, LookupOutput, SuggestedAction } from "@/lib/compass/types";
import { metricDefinition, OBJECTION_LABELS, SMALL_SAMPLE, stageLabel, type ShareId } from "@/lib/metrics/definitions";
import { formatMetricValue } from "@/lib/metrics/format";
import type { ResultsRange } from "@/lib/metrics/range";
import { geminiApiKey, geminiEmbed, toVectorLiteral } from "@/lib/scribe/gemini";

/**
 * The only ways Compass reads the workspace. Each lookup runs through the
 * asking person's own database client, so the database applies the same
 * rules as their screens; Operators are narrowed further to the leads
 * assigned to them. There is no free-form query. Outputs carry only the
 * fields an answer needs: lead names, never emails or phone numbers.
 */

export type StepHandleLike = { done: (detail?: string | null) => Promise<void>; fail: () => Promise<void> };
export type StepLog = (label: string) => Promise<StepHandleLike | null>;

export type LookupTrace = {
  names: string[];
  outputs: unknown[];
  sources: CompassSource[];
  gaps: string[];
  suggestions: SuggestedAction[];
};

export function newTrace(): LookupTrace {
  return { names: [], outputs: [], sources: [], gaps: [], suggestions: [] };
}

const rangeSchema = {
  range: z.enum(COMPASS_RANGE_KEYS).optional().describe("A Results range. Defaults to last_7_days. Use custom with from and to for other dates."),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("First day (YYYY-MM-DD), with range=custom."),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Last day (YYYY-MM-DD), with range=custom."),
};

type RangeInput = { range?: string; from?: string; to?: string };

function leadHref(id: string): string {
  return `/app/cases/${id}`;
}

function leadLabel(name: unknown): string {
  return typeof name === "string" && name.trim() ? name.trim() : "A lead without a name";
}

function metricSource(metric: string, range: ResultsRange): CompassSource {
  const def = metricDefinition(metric);
  return {
    kind: "metric",
    metric,
    label: def.label,
    range: rangeLabel(range),
    href: drillHref(metric, range),
    definition: `/app/compass/definitions#${metric.split(":")[0]}`,
  };
}

function shareSource(share: ShareFigure, range: ResultsRange): CompassSource {
  return {
    kind: "metric",
    metric: share.id,
    label: share.label,
    range: rangeLabel(range),
    href: drillHref(share.id === "response_rate" ? "response_late" : share.id === "follow_up_rate" ? "follow_up_gaps" : "relay_edited", range),
    definition: `/app/compass/definitions#${share.id}`,
  };
}

function compactFigure(figure: Figure) {
  return {
    metric: figure.metric,
    label: figure.label,
    value: figure.value,
    display: figure.display,
    previous: figure.previousDisplay,
    based_on_rows: figure.rows,
    small_sample: figure.smallSample || undefined,
  };
}

function compactShare(share: ShareFigure) {
  return {
    share: share.id,
    label: share.label,
    display: share.display,
    numerator: share.numerator,
    denominator: share.denominator,
    small_sample: share.smallSample || undefined,
  };
}

/** Where the full filtered lead list lives, with the same filters. */
function caseListHref(filters: Record<string, unknown>): string {
  const params = new URLSearchParams();
  const map: Record<string, string> = { name: "q", stage: "status", band: "band", source: "source", response: "response", field: "fact", field_value: "factValue" };
  for (const [key, param] of Object.entries(map)) {
    const value = filters[key];
    if (typeof value === "string" && value) params.set(param, value);
  }
  if (filters.person === "me") params.set("assignee", "me");
  const query = params.toString();
  return query ? `/app/cases?${query}` : "/app/cases";
}

export function buildCompassTools(args: {
  actor: CompassActor;
  trace: LookupTrace;
  step: StepLog;
  helpArticles: () => Promise<HelpArticle[]>;
}): ToolSet {
  const { actor, trace, step } = args;
  const db = actor.db;
  const operator = actor.access === "operator";

  /** Runs one lookup with its plain-language step, and keeps what it returned. */
  const run =
    <I, O extends LookupOutput>(name: string, label: (input: I) => string, body: (input: I) => Promise<O>) =>
    async (input: I): Promise<O> => {
      trace.names.push(name);
      const handle = await step(label(input));
      try {
        const output = await body(input);
        trace.outputs.push(output.data ?? null);
        trace.sources.push(...output.sources);
        if (output.gap) trace.gaps.push(output.gap);
        await handle?.done(output.gap ? "Nothing to show for this." : null);
        return output;
      } catch (cause) {
        await handle?.fail();
        const message = cause instanceof Error ? cause.message : "";
        if (/Not found|42501/.test(message)) {
          return { ok: false, gap: "hidden", note: "Not available to this person.", sources: [] } as unknown as O;
        }
        return { ok: false, gap: "unavailable", note: "This lookup did not work just now.", sources: [] } as unknown as O;
      }
    };

  const summary = async (metrics: string[], range: ResultsRange, filters: Record<string, string> = {}) => {
    const { data, error } = await db.rpc("compass_metric_summary", {
      p_org_id: actor.orgId,
      p_metrics: metrics,
      p_from: range.from,
      p_to: range.to,
      p_prev_from: range.previous.from,
      p_prev_to: range.previous.to,
      p_filters: filters,
    });
    if (error) throw new Error(error.message);
    return parseSummary(data);
  };

  const breakdown = async (metric: string, range: ResultsRange, dimension: string) => {
    const { data, error } = await db.rpc("compass_metric_breakdown", {
      p_org_id: actor.orgId,
      p_metric: metric,
      p_from: range.from,
      p_to: range.to,
      p_filters: {},
      p_dimension: dimension,
    });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ key: string; label: string; count: number; leads: number; median: number | null }>).map((row) => ({
      key: row.key,
      label: row.label,
      count: Number(row.count ?? 0),
      leads: Number(row.leads ?? 0),
    }));
  };

  const facts = async (): Promise<Record<string, unknown> | null> => {
    if (operator) return null;
    const { data, error } = await db.rpc("portal_workspace_facts", { p_org_id: actor.orgId });
    return error ? null : ((data ?? null) as Record<string, unknown> | null);
  };

  const rangeOf = (input: RangeInput) => compassRange(input, actor.timeZone);

  const figuresOutput = (metrics: string[], shares: ShareId[], s: ReturnType<typeof parseSummary>, range: ResultsRange) => {
    const figures = metrics.map((metric) => figureFor(metric, s)).filter((f): f is Figure => Boolean(f));
    const shareFigures = shares.map((id) => shareFor(id, s)).filter((f): f is ShareFigure => Boolean(f));
    const sources: CompassSource[] = [
      ...figures.map((f) => metricSource(f.metric, range)),
      ...shareFigures.map((f) => shareSource(f, range)),
    ];
    const small = shareFigures.find((f) => f.smallSample) ?? null;
    return {
      figures,
      shareFigures,
      sources,
      smallSample: small ? { count: small.denominator, noun: "leads" } : null,
      hidden: hiddenMetrics(s),
    };
  };

  const tools: ToolSet = {
    find_leads: tool({
      description:
        "Find leads this person may see, filtered by name, stage, readiness band (the workspace's band names, e.g. Hot), source, person ('me' for their own), response state (on_time, at_risk, missed), days without a touch, arrival dates, or a case file fact. Returns at most 10 by default (25 max), most urgent first, and how many matched in total.",
      inputSchema: z.object({
        name: z.string().max(80).optional(),
        stage: z.enum(["new", "working", "call_booked", "no_show", "follow_up", "objection_hold", "ghost", "closed_won", "closed_lost"]).optional(),
        band: z.string().max(40).optional(),
        source: z.string().max(80).optional(),
        person: z.string().max(40).optional().describe("'me', 'unassigned', or a member id. Only owners and staff can pick other people."),
        response: z.enum(["on_time", "at_risk", "missed"]).optional(),
        quiet_days: z.number().int().min(1).max(365).optional().describe("No touch for at least this many days."),
        arrived_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        arrived_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        open_only: z.boolean().optional().describe("Defaults to true: only leads not won, lost, or gone quiet."),
        field: z.string().max(60).optional().describe("A case file fact key from the workspace's configuration."),
        field_value: z.string().max(120).optional(),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: run(
        "find_leads",
        (input: Record<string, unknown>) =>
          input.name
            ? "Looking for a lead by name"
            : input.band
              ? `Looking at ${String(input.band).toLowerCase()} leads`
              : input.response
                ? `Looking at leads ${String(input.response).replace("_", " ")}`
                : operator
                  ? "Looking at your leads"
                  : "Looking at leads",
        async (input: Record<string, unknown>): Promise<LookupOutput> => {
          const { limit, ...filters } = input;
          const { data, error } = await db.rpc("compass_find_leads", {
            p_org_id: actor.orgId,
            p_filters: filters,
            p_limit: typeof limit === "number" ? limit : 10,
          });
          if (error) throw new Error(error.message);
          const result = (data ?? { total: 0, rows: [] }) as { total: number; rows: Array<Record<string, unknown>> };
          const rows = result.rows.map((row) => ({
            id: String(row.id),
            name: leadLabel(row.name),
            stage: row.stage ? stageLabel(String(row.stage)) : null,
            band: row.band ?? null,
            score: row.score ?? null,
            source: row.source ?? null,
            response: row.response ?? null,
            last_touch_at: row.last_touch_at ?? null,
            first_human_touch_at: row.first_human_touch_at ?? null,
            arrived_at: row.arrived_at ?? null,
            do_not_contact: row.do_not_contact === true || undefined,
            imported_history: row.historic === true || undefined,
            next_step: row.next_step ?? null,
            yours: row.assigned_to_me === true || undefined,
          }));
          const sources: CompassSource[] = rows.map((row) => ({ kind: "lead", id: row.id, label: row.name, href: leadHref(row.id) }));
          const more = result.total > rows.length ? { total: result.total, href: caseListHref(filters) } : null;
          if (more) sources.push({ kind: "list", label: `All ${result.total} matching leads`, href: more.href });
          return {
            ok: true,
            gap: rows.length ? undefined : "empty",
            note: rows.length ? undefined : "No leads match those filters.",
            smallSample: result.total > 0 && result.total < SMALL_SAMPLE ? { count: result.total, noun: "leads" } : null,
            data: { total: result.total, shown: rows.length, leads: rows, limited_to_your_leads: operator || undefined },
            sources,
            more,
          };
        }
      ),
    }),

    read_case_file: tool({
      description:
        `Read one lead's case file: ${AGENTS.scribe.name}'s summary, readiness band and reason, next step, open questions, the facts ${AGENTS.scribe.name} keeps, objections, recent activity (when and how, never message text), response clock, and the open next action.`,
      inputSchema: z.object({ lead_id: z.string().uuid() }),
      execute: run(
        "read_case_file",
        () => "Reading the case file",
        async ({ lead_id }: { lead_id: string }): Promise<LookupOutput> => {
          const { data, error } = await db.rpc("compass_case_file", { p_org_id: actor.orgId, p_lead_id: lead_id });
          if (error) throw new Error(error.message);
          if (!data) {
            return { ok: false, gap: "not_found", note: "No lead with that id is available to this person.", sources: [] };
          }
          const file = data as { lead: { id: string; name: string | null } } & Record<string, unknown>;
          const label = leadLabel(file.lead.name);
          return {
            ok: true,
            data: file,
            sources: [{ kind: "lead", id: file.lead.id, label, href: leadHref(file.lead.id) }],
          };
        }
      ),
    }),

    response_health: tool({
      description:
        "Response health for a range, from the same definitions as Home and Results: leads answered inside the response window (share and counts), median time to first human reply, follow-ups kept on time, and leads at risk or missed right now. Compares with the range just before.",
      inputSchema: z.object(rangeSchema),
      execute: run(
        "response_health",
        (input: RangeInput) => `Checking response times for ${rangeLabel(rangeOf(input)).split(" (")[0]!.toLowerCase()}`,
        async (input: RangeInput): Promise<LookupOutput> => {
          const range = rangeOf(input);
          const metrics = ["response_decided", "response_within", "response_late", "first_touch_time", "follow_up_gaps", "follow_up_on_time", "at_risk_now", "missed_now"];
          const s = await summary(metrics, range);
          const out = figuresOutput(["first_touch_time", "response_late", "at_risk_now", "missed_now", "follow_up_gaps"], ["response_rate", "follow_up_rate"], s, range);
          if (!out.figures.length && !out.shareFigures.length) {
            return { ok: false, gap: "hidden", note: "Response figures are not available to this person.", sources: [] };
          }
          const decided = out.shareFigures.find((f) => f.id === "response_rate")?.denominator ?? 0;
          return {
            ok: true,
            gap: decided === 0 && (out.figures.find((f) => f.metric === "follow_up_gaps")?.value ?? 0) === 0 ? "empty" : undefined,
            note: decided === 0 ? "No new leads in this range have a decided first response yet." : undefined,
            smallSample: out.smallSample,
            data: {
              range: rangeLabel(range),
              limited_to_your_leads: operator || undefined,
              shares: out.shareFigures.map(compactShare),
              figures: out.figures.map(compactFigure),
            },
            sources: out.sources,
          };
        }
      ),
    }),

    pipeline: tool({
      description:
        "Pipeline and outcomes: open leads by stage and by readiness band, new leads, band and stage moves, bookings, and revenue by type where the workspace tracks it and the person may see money.",
      inputSchema: z.object(rangeSchema),
      execute: run(
        "pipeline",
        () => "Looking at the pipeline",
        async (input: RangeInput): Promise<LookupOutput> => {
          const range = rangeOf(input);
          const known = await facts();
          const money = actor.canSeeMoney && known?.has_revenue === true;
          const metrics = ["new_leads", "open_leads", "hot_open", "bookings", "band_moves", "stage_moves", ...(money ? ["revenue"] : [])];
          const s = await summary(metrics, range);
          const out = figuresOutput(metrics, [], s, range);
          const [byStage, byBand] = await Promise.all([
            breakdown("open_leads", range, "stage").catch(() => []),
            breakdown("open_leads", range, "band").catch(() => []),
          ]);
          const revenueNote = !actor.canSeeMoney
            ? "This person may not see revenue."
            : known && known.has_revenue !== true
              ? "This workspace does not track revenue."
              : undefined;
          return {
            ok: true,
            note: revenueNote,
            data: {
              range: rangeLabel(range),
              limited_to_your_leads: operator || undefined,
              figures: out.figures.map(compactFigure),
              open_by_stage: byStage.map((row) => ({ stage: stageLabel(row.key), leads: row.count })),
              open_by_band: byBand.map((row) => ({ band: row.label || "No band", leads: row.count })),
              revenue: revenueNote ? "not available" : undefined,
            },
            sources: out.sources,
          };
        }
      ),
    }),

    objections: tool({
      description: "The most common objections in a range by type, how many are resolved, and the leads they came from (most recent first).",
      inputSchema: z.object(rangeSchema),
      execute: run(
        "objections",
        () => "Looking at objections",
        async (input: RangeInput): Promise<LookupOutput> => {
          const range = rangeOf(input);
          const rows = await breakdown("objections", range, "detail");
          const byType = new Map<string, { type: string; total: number; resolved: number }>();
          for (const row of rows) {
            const [type, state] = row.key.split(":");
            const key = type ?? "other";
            const entry = byType.get(key) ?? { type: OBJECTION_LABELS[key] ?? key, total: 0, resolved: 0 };
            entry.total += row.count;
            if (state === "resolved") entry.resolved += row.count;
            byType.set(key, entry);
          }
          const types = [...byType.values()].sort((a, b) => b.total - a.total);
          const total = types.reduce((sum, row) => sum + row.total, 0);
          const { data: leadsRaw } = await db.rpc("compass_metric_leads", {
            p_org_id: actor.orgId,
            p_metric: "objections",
            p_from: range.from,
            p_to: range.to,
            p_filters: {},
            p_limit: 10,
          });
          const leads = ((leadsRaw ?? []) as Array<{ lead_id: string; name: string | null; detail: string | null }>).map((row) => ({
            id: row.lead_id,
            name: leadLabel(row.name),
            objection: row.detail ? (OBJECTION_LABELS[row.detail.split(":")[0] ?? ""] ?? row.detail) : null,
          }));
          const sources: CompassSource[] = [metricSource("objections", range), ...leads.map((lead) => ({ kind: "lead" as const, id: lead.id, label: lead.name, href: leadHref(lead.id) }))];
          return {
            ok: true,
            gap: total ? undefined : "empty",
            note: total ? undefined : "No objections were recorded in this range.",
            smallSample: total > 0 && total < SMALL_SAMPLE ? { count: total, noun: "objections" } : null,
            data: { range: rangeLabel(range), total, by_type: types, recent_leads: leads, limited_to_your_leads: operator || undefined },
            sources,
          };
        }
      ),
    }),

    agent_activity: tool({
      description:
        `What the agents did in a range: case files ${AGENTS.scribe.name} built or updated and ones set aside for a check; alerts ${AGENTS.sentry.name} raised and acknowledged (with the median time to acknowledge) and alerts open now; drafts ${AGENTS.relay.name} prepared, approved as written, edited, rejected, marked sent, and waiting now.`,
      inputSchema: z.object(rangeSchema),
      execute: run(
        "agent_activity",
        () => "Checking what the agents did",
        async (input: RangeInput): Promise<LookupOutput> => {
          const range = rangeOf(input);
          const metrics = [
            "scribe_updated",
            "scribe_review",
            "alerts_raised",
            "alerts_acknowledged",
            "alerts_open_now",
            "relay_prepared",
            "relay_approved_unchanged",
            "relay_edited",
            "relay_rejected",
            "relay_sent",
            "drafts_waiting",
          ];
          const s = await summary(metrics, range);
          const out = figuresOutput(metrics, ["approved_unchanged_rate"], s, range);
          const ack = s.alerts_acknowledged;
          const ackMedian =
            ack && !("hidden" in ack && ack.hidden) && "current" in ack && ack.current.count > 0 && ack.current.median !== null
              ? { median_seconds: ack.current.median, display: formatMetricValue({ unit: "duration" }, ack.current.median), based_on: ack.current.count }
              : null;
          return {
            ok: true,
            smallSample: out.smallSample,
            data: {
              range: rangeLabel(range),
              limited_to_your_leads: operator || undefined,
              figures: out.figures.map(compactFigure),
              shares: out.shareFigures.map(compactShare),
              time_to_acknowledge_alerts: ackMedian,
              not_available: out.hidden.length ? out.hidden.map((m) => metricDefinition(m).label) : undefined,
            },
            sources: out.sources,
          };
        }
      ),
    }),

    team_activity: tool({
      description:
        "The team's numbers for a range, per person: new leads, leads answered inside the window, decided responses, and bookings. Owners and staff see everyone; an Operator sees only their own; Members cannot see per-person numbers.",
      inputSchema: z.object(rangeSchema),
      execute: run(
        "team_activity",
        () => (operator ? "Looking at your own numbers" : "Looking at the team's numbers"),
        async (input: RangeInput): Promise<LookupOutput> => {
          const range = rangeOf(input);
          const metrics = ["new_leads", "response_decided", "response_within", "bookings"];
          if (operator) {
            const s = await summary(metrics, range);
            const out = figuresOutput(metrics, ["response_rate"], s, range);
            return {
              ok: true,
              smallSample: out.smallSample,
              data: { range: rangeLabel(range), yours_only: true, figures: out.figures.map(compactFigure), shares: out.shareFigures.map(compactShare) },
              sources: out.sources,
            };
          }
          if (!actor.canSeePeople) {
            return { ok: false, gap: "hidden", note: "Per-person numbers are not available to this person.", sources: [] };
          }
          const tables = await Promise.all(metrics.map(async (metric) => [metric, await breakdown(metric, range, "person")] as const));
          const people = new Map<string, Record<string, unknown>>();
          for (const [metric, rows] of tables) {
            for (const row of rows) {
              const person = people.get(row.key) ?? { person: row.label || "Unassigned" };
              person[metric] = row.count;
              people.set(row.key, person);
            }
          }
          return {
            ok: true,
            gap: people.size ? undefined : "empty",
            data: { range: rangeLabel(range), people: [...people.values()] },
            sources: metrics.map((metric) => metricSource(metric, range)),
          };
        }
      ),
    }),

    metric_leads: tool({
      description:
        "The leads behind one figure, e.g. leads answered late (response_late), at risk now (at_risk_now), missed now (missed_now), hot and open (hot_open), drafts waiting (drafts_waiting), bookings. Returns up to 10 and a link to the full list on Results.",
      inputSchema: z.object({
        metric: z.enum([
          "new_leads",
          "response_late",
          "response_within",
          "at_risk_now",
          "missed_now",
          "open_leads",
          "hot_open",
          "bookings",
          "follow_up_gaps",
          "alerts_open_now",
          "drafts_waiting",
          "relay_prepared",
          "scribe_review",
          "objections",
        ]),
        ...rangeSchema,
      }),
      execute: run(
        "metric_leads",
        (input: { metric: string }) => `Finding the leads behind "${metricDefinition(input.metric).label.toLowerCase()}"`,
        async (input: { metric: string } & RangeInput): Promise<LookupOutput> => {
          const range = rangeOf(input);
          const { data, error } = await db.rpc("compass_metric_leads", {
            p_org_id: actor.orgId,
            p_metric: input.metric,
            p_from: range.from,
            p_to: range.to,
            p_filters: {},
            p_limit: 10,
          });
          if (error) throw new Error(error.message);
          const rows = (data ?? []) as Array<{ lead_id: string; name: string | null; at: string | null; total?: number }>;
          const total = rows.length ? Number(rows[0]?.total ?? rows.length) : 0;
          const leads = rows.map((row) => ({ id: row.lead_id, name: leadLabel(row.name), at: row.at }));
          const sources: CompassSource[] = [metricSource(input.metric, range), ...leads.map((lead) => ({ kind: "lead" as const, id: lead.id, label: lead.name, href: leadHref(lead.id) }))];
          return {
            ok: true,
            gap: total ? undefined : "empty",
            note: total ? undefined : "No leads behind this figure in the range.",
            data: { metric: metricDefinition(input.metric).label, range: rangeLabel(range), total, leads, limited_to_your_leads: operator || undefined },
            sources,
            more: total > leads.length ? { total, href: drillHref(input.metric, range) } : null,
          };
        }
      ),
    }),

    product_help: tool({
      description:
        "Search Vistrial's help articles for 'how do I' and 'what does this mean' questions. Answer product questions only from what this returns; if it returns nothing, say the help does not cover it and suggest contacting the team.",
      inputSchema: z.object({ question: z.string().min(3).max(300) }),
      execute: run(
        "product_help",
        () => "Checking the help articles",
        async ({ question }: { question: string }): Promise<LookupOutput> => {
          const matches = searchHelp(question, await args.helpArticles());
          if (!matches.length) {
            return {
              ok: true,
              gap: "missing",
              note: "No help article covers this. Suggest contacting the team.",
              data: { articles: [] },
              sources: [{ kind: "list", label: "Contact your team", href: "/app/help" }],
            };
          }
          return {
            ok: true,
            data: { articles: matches.map((a) => ({ question: a.question, answer: a.body, link: a.linkHref ? { label: a.linkLabel, href: a.linkHref } : null })) },
            sources: matches.map((a) => ({ kind: "help" as const, slug: a.slug, label: a.question, href: `/app/help#${a.slug}` })),
          };
        }
      ),
    }),

    suggest_action: tool({
      description:
        `Offer the person an action as a card they can confirm. Nothing happens until they confirm on screen. Kinds: open_list (a filtered lead list), open_case_file, relay_draft (ask ${AGENTS.relay.name} to prepare a follow-up draft for one lead; it goes to the approval queue and is never sent without approval), scribe_refresh (ask ${AGENTS.scribe.name} to rebuild one lead's case file), next_action (a follow-up reminder for this person on one lead), pin_question (save a question as a shortcut).`,
      inputSchema: z.object({
        kind: z.enum(["open_list", "open_case_file", "relay_draft", "scribe_refresh", "next_action", "pin_question"]),
        lead_id: z.string().uuid().optional(),
        lead_name: z.string().max(120).optional(),
        list_filters: z.record(z.string(), z.string()).optional().describe("For open_list: the same filters as find_leads."),
        text: z.string().max(240).optional().describe("For next_action: the follow-up text. For pin_question: the question."),
        due_at: z.string().max(40).optional().describe("For next_action: an ISO date or date-time."),
      }),
      execute: run(
        "suggest_action",
        () => "Preparing a suggestion",
        async (input: {
          kind: SuggestedAction["kind"];
          lead_id?: string;
          lead_name?: string;
          list_filters?: Record<string, string>;
          text?: string;
          due_at?: string;
        }): Promise<LookupOutput> => {
          const action = await prepareSuggestion(actor, input);
          trace.suggestions.push(action);
          return {
            ok: !action.unavailable,
            note: action.unavailable ?? "Shown to the person as a card. Nothing happens until they confirm.",
            data: { suggestion: action },
            sources: [],
          };
        }
      ),
      // The card needs the whole suggestion; the model only needs what it offered.
      toModelOutput: ({ output }) => {
        const out = output as LookupOutput<{ suggestion?: SuggestedAction }>;
        const suggestion = out.data?.suggestion;
        return {
          type: "json",
          value: {
            ok: out.ok,
            note: out.note ?? null,
            suggestion: suggestion ? { kind: suggestion.kind, description: suggestion.description, unavailable: suggestion.unavailable ?? null } : null,
          },
        };
      },
    }),
  };

  if (actor.canSeeTranscripts) {
    tools.read_call_transcript = tool({
      description:
        "Read the transcript text of one lead's most recent calls, only to answer a specific question about that lead (for example what they said about timing). Never use it for lists or summaries across leads.",
      inputSchema: z.object({ lead_id: z.string().uuid() }),
      execute: run(
        "read_call_transcript",
        () => "Reading this lead's call notes",
        async ({ lead_id }: { lead_id: string }): Promise<LookupOutput> => {
          const { data, error } = await db.rpc("compass_lead_transcript", { p_org_id: actor.orgId, p_lead_id: lead_id, p_max_chars: 6000 });
          if (error) throw new Error(error.message);
          const result = (data ?? { allowed: false, calls: [] }) as { allowed: boolean; calls: Array<{ call_id: string; at: string | null; text: string }> };
          if (!result.allowed) return { ok: false, gap: "hidden", note: "Transcripts are not available to this person.", sources: [] };
          if (!result.calls.length) return { ok: true, gap: "empty", note: "This lead has no call transcripts.", data: { calls: [] }, sources: [] };
          return {
            ok: true,
            data: { calls: result.calls },
            sources: [{ kind: "lead", id: lead_id, label: "Call transcript", href: `${leadHref(lead_id)}#calls` }],
          };
        }
      ),
    });
  }

  if (geminiApiKey()) {
    tools.find_leads_by_theme = tool({
      description:
        "Find leads whose calls mention a theme (for example 'worried about downtime' or 'asked about financing'), by meaning. Returns lead references only. Use find_leads for anything that is a field, stage, or band.",
      inputSchema: z.object({ theme: z.string().min(3).max(200) }),
      execute: run(
        "find_leads_by_theme",
        () => "Searching calls by meaning",
        async ({ theme }: { theme: string }): Promise<LookupOutput> => {
          const [vector] = await geminiEmbed([theme.slice(0, 500)], "RETRIEVAL_QUERY");
          if (!vector) return { ok: false, gap: "unavailable", note: "Search by meaning is not available right now.", sources: [] };
          const { data, error } = await db.rpc("case_meaning_search", {
            p_org_id: actor.orgId,
            p_embedding: toVectorLiteral(vector),
            p_limit: 25,
          });
          if (error) throw new Error(error.message);
          const ids = [...new Set(((data ?? []) as Array<{ lead_id: string; similarity: number }>).filter((row) => row.similarity >= 0.55).map((row) => row.lead_id))];
          // Narrow to leads this person may ask about (Operators: their own), with names.
          const allowed: Array<{ id: string; name: string }> = [];
          for (const id of ids.slice(0, 15)) {
            const { data: ok } = await db.rpc("compass_lead_allowed", { p_org_id: actor.orgId, p_lead_id: id });
            if (ok !== true) continue;
            const { data: lead } = await db.from("leads").select("id, first_name, last_name").eq("org_id", actor.orgId).eq("id", id).maybeSingle();
            if (lead) allowed.push({ id, name: leadLabel([lead.first_name, lead.last_name].filter(Boolean).join(" ")) });
          }
          return {
            ok: true,
            gap: allowed.length ? undefined : "empty",
            note: allowed.length ? "Matches by meaning, not exact words. Read a case file to confirm before stating anything about a lead." : "No calls matched that theme.",
            data: { theme, leads: allowed },
            sources: allowed.map((lead) => ({ kind: "lead" as const, id: lead.id, label: lead.name, href: leadHref(lead.id) })),
          };
        }
      ),
    });
  }

  tools.list_open_tasks = tool({
    description:
      "List open, snoozed, and suggested tasks the person is allowed to see. Use for questions about what is due today or which tasks are overdue. Never rank people.",
    inputSchema: z.object({
      mine: z.boolean().optional(),
      overdue_only: z.boolean().optional(),
    }),
    execute: run("list_open_tasks", () => "Reading open tasks", async (input: { mine?: boolean; overdue_only?: boolean }): Promise<LookupOutput> => {
      let query = db
        .from("next_actions")
        .select("id, action_text, status, due_at, source_sentence, lead_id")
        .eq("org_id", actor.orgId)
        .in("status", ["open", "snoozed", "suggested"])
        .order("due_at", { ascending: true })
        .limit(20);
      if (input.mine && actor.memberId) query = query.eq("owner_member_id", actor.memberId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const now = Date.now();
      const rows = ((data ?? []) as Array<{ id: string; action_text: string; status: string; due_at: string | null; source_sentence: string | null; lead_id: string | null }>).filter((row) => {
        if (!input.overdue_only) return true;
        return Boolean(row.due_at && Date.parse(row.due_at) < now);
      });
      return {
        ok: true,
        gap: rows.length ? undefined : "empty",
        note: rows.length ? "Open tasks this person can see." : "No open tasks.",
        data: {
          tasks: rows.map((row) => ({
            title: row.action_text,
            status: row.status,
            due_at: row.due_at,
            source: row.source_sentence,
            lead_id: row.lead_id,
          })),
        },
        sources: rows.filter((row) => row.lead_id).map((row) => ({ kind: "lead" as const, id: row.lead_id as string, label: row.action_text, href: `/app/cases/${row.lead_id}` })),
      };
    }),
  });

  return tools;
}

/**
 * Builds the card for a suggestion and checks, before showing it, that this
 * person could confirm it. It changes nothing.
 */
export async function prepareSuggestion(
  actor: CompassActor,
  input: { kind: SuggestedAction["kind"]; lead_id?: string; lead_name?: string; list_filters?: Record<string, string>; text?: string; due_at?: string }
): Promise<SuggestedAction> {
  const id = randomUUID();
  const label = input.lead_name?.trim() || "this lead";
  const leadAllowed = async () => {
    if (!input.lead_id) return false;
    const { data } = await actor.db.rpc("compass_lead_allowed", { p_org_id: actor.orgId, p_lead_id: input.lead_id });
    return data === true;
  };
  switch (input.kind) {
    case "open_list":
      return { id, kind: "open_list", description: "Open the lead list with these filters.", href: caseListHref(input.list_filters ?? {}), needsConfirm: false };
    case "open_case_file":
      if (!(await leadAllowed())) return { id, kind: "open_case_file", description: "Open the case file.", needsConfirm: false, unavailable: "That lead is not available." };
      return { id, kind: "open_case_file", description: `Open ${label}'s case file.`, leadId: input.lead_id, leadLabel: label, href: leadHref(input.lead_id!), needsConfirm: false };
    case "relay_draft": {
      const { data } = input.lead_id
        ? await actor.db.rpc("compass_may_request_draft", { p_org_id: actor.orgId, p_lead_id: input.lead_id })
        : { data: false };
      return {
        id,
        kind: "relay_draft",
        description: `Ask ${AGENTS.relay.name} to prepare a follow-up draft for ${label}. It goes to the approval queue, and nothing is sent unless someone approves it. Right before sending, Vistrial checks consent, quiet hours, contact limits and do-not-contact again.`,
        leadId: input.lead_id ?? null,
        leadLabel: label,
        needsConfirm: true,
        unavailable: data === true ? null : `You can't ask ${AGENTS.relay.name} for a draft for this lead.`,
      };
    }
    case "scribe_refresh": {
      const allowed = (actor.access === "owner" || actor.isStaff) && (await leadAllowed());
      return {
        id,
        kind: "scribe_refresh",
        description: `Ask ${AGENTS.scribe.name} to read ${label}'s recent calls again and rebuild the case file. Fields someone locked stay as they are.`,
        leadId: input.lead_id ?? null,
        leadLabel: label,
        needsConfirm: true,
        unavailable: allowed ? null : `Only an Owner or the Vistrial team can ask ${AGENTS.scribe.name} to rebuild a case file.`,
      };
    }
    case "next_action": {
      const allowed = actor.access !== "member" && (await leadAllowed());
      const text = input.text?.trim() || `Follow up with ${label}`;
      return {
        id,
        kind: "next_action",
        description: `Add a follow-up for you on ${label}: "${text.slice(0, 240)}"${input.due_at ? `, due ${input.due_at}` : ""}.`,
        leadId: input.lead_id ?? null,
        leadLabel: label,
        text: text.slice(0, 240),
        dueAt: input.due_at ?? null,
        needsConfirm: true,
        unavailable: allowed ? null : actor.access === "member" ? "Members can't add follow-ups." : "That lead is not available.",
      };
    }
    case "pin_question": {
      const text = input.text?.trim() ?? "";
      return {
        id,
        kind: "pin_question",
        description: `Pin "${text.slice(0, 300)}" as a shortcut for you.`,
        text: text.slice(0, 300),
        needsConfirm: true,
        unavailable: text.length >= 3 ? null : "There is no question to pin.",
      };
    }
  }
}
