import "server-only";

import { refreshCallDetail, refreshCallList } from "@/app/app/calls/actions";
import {
  loadCaseTimelinePage,
  refreshCaseFile,
  refreshCaseList,
} from "@/app/app/cases/actions";
import { refreshQueue } from "@/app/app/queue/actions";
import { canViewReporting } from "@/lib/auth/permissions";
import type { AuthContext } from "@/lib/auth/types";
import { isLeadId } from "@/lib/cases/filters";
import { decodeCaseCursor, encodeCaseCursor, type CaseListCursor } from "@/lib/cases/cursor";
import type { CaseListFilters, CaseObjection } from "@/lib/cases/types";
import { OPERATOR_RESULT_PAGE_SIZE } from "@/lib/operator/constants";
import { classifyToolError, permissionDenied } from "@/lib/operator/errors";
import { jsonForModel, redactForAgent } from "@/lib/operator/redact";
import type { OperatorLeadLink, OperatorUiList, ToolOutcome } from "@/lib/operator/types";
import { decodeQueueCursor, encodeQueueCursor } from "@/lib/queue/cursor";
import { defaultAssignedFilter } from "@/lib/queue/filters";
import {
  QUEUE_ASSIGNED,
  QUEUE_STATUSES,
  QUEUE_TRACKS,
  type QueueAssignedFilter,
  type QueueFilters,
  type QueueStatusFilter,
  type QueueTrackFilter,
} from "@/lib/queue/types";
import { REPORTING_PANELS, type ReportingPanel } from "@/lib/reporting/constants";
import { loadReportingPanel, loadReportingState } from "@/lib/reporting/load";
import { parseReportingRange } from "@/lib/reporting/range";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads/labels";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asUuid(value: unknown): string | null {
  const text = asString(value);
  return text && isLeadId(text) ? text : null;
}

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function asBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function nothingFound(what: string): ToolOutcome {
  return {
    ok: true,
    kind: "read",
    summary: `Nothing found: ${what}.`,
    model: { found: false, message: `Nothing found: ${what}.` },
    ui: null,
    leadIds: [],
  };
}

function readOk(summary: string, model: unknown, ui: OperatorUiList | null, leadIds: string[]): ToolOutcome {
  return { ok: true, kind: "read", summary, model: redactForAgent(model), ui, leadIds };
}

function failFromError(error: unknown, fallback: string): ToolOutcome {
  const message = error instanceof Error ? error.message : fallback;
  const classified = classifyToolError(message);
  return {
    ok: false,
    kind: classified.kind,
    error: classified.error,
    summary: classified.error,
    leadIds: [],
  };
}

function leadLinks(
  rows: Array<{ id: string; name: string; status?: string | null; score?: number | null }>
): OperatorLeadLink[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    href: `/app/cases/${row.id}`,
    status: row.status ?? null,
    score: row.score ?? null,
  }));
}

function parseFindFilters(input: Record<string, unknown>): CaseListFilters {
  const statusRaw = asString(input.status);
  const trackRaw = asString(input.track);
  const sortRaw = asString(input.sort);
  const dirRaw = asString(input.dir);
  return {
    q: asString(input.q),
    status: statusRaw && (LEAD_STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as LeadStatus) : null,
    track: trackRaw === "ready" || trackRaw === "nurture" ? trackRaw : null,
    source: asString(input.source),
    setterId: asUuid(input.setterId),
    closerId: asUuid(input.closerId),
    scoreMin: asInt(input.scoreMin),
    scoreMax: asInt(input.scoreMax),
    optedFrom: asString(input.optedFrom),
    optedTo: asString(input.optedTo),
    sort: sortRaw === "score" || sortRaw === "opted_in" || sortRaw === "status" || sortRaw === "last_touch" ? sortRaw : "last_touch",
    dir: dirRaw === "asc" || dirRaw === "desc" ? dirRaw : "desc",
  };
}

async function toolFindLeads(input: Record<string, unknown>): Promise<ToolOutcome> {
  try {
    const filters = parseFindFilters(input);
    const cursor = decodeCaseCursor(asString(input.cursor)) as CaseListCursor | null;
    const payload = await refreshCaseList(filters, { cursor, limit: OPERATOR_RESULT_PAGE_SIZE });
    if (payload.rows.length === 0) {
      return nothingFound("no leads matched those criteria");
    }
    const last = payload.rows[payload.rows.length - 1];
    const model = {
      found: true,
      members: payload.members,
      sources: payload.sources,
      orgLeadCount: payload.orgLeadCount,
      hasMore: payload.hasMore,
      nextCursor: payload.hasMore && last ? encodeCaseCursor({
        id: last.id,
        t: last.lastTouchAt,
        s: last.score,
        st: last.status,
      }) : null,
      rows: payload.rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        score: row.score,
        source: row.source,
        lastTouchAt: row.lastTouchAt,
        assignedSetterId: row.assignedSetterId,
        assignedCloserId: row.assignedCloserId,
        assignedSetterName: row.assignedSetterName,
        assignedCloserName: row.assignedCloserName,
        href: `/app/cases/${row.id}`,
      })),
    };
    return readOk(
      `${payload.rows.length} lead${payload.rows.length === 1 ? "" : "s"}${payload.hasMore ? " (more available)" : ""}.`,
      model,
      {
        kind: "leads",
        rows: payload.rows.map((row) => ({
          name: row.name,
          status: row.status,
          score: row.score,
        })),
        links: leadLinks(payload.rows),
      },
      payload.rows.map((row) => row.id)
    );
  } catch (error) {
    return failFromError(error, "Could not find leads.");
  }
}

function caseFileModel(payload: NonNullable<Awaited<ReturnType<typeof refreshCaseFile>>>, hideRevenue: boolean) {
  return {
    found: true,
    lead: {
      id: payload.lead.id,
      name: payload.lead.name,
      status: payload.lead.status,
      score: payload.lead.score,
      source: payload.lead.source,
      assignedSetterId: payload.lead.assignedSetterId,
      assignedCloserId: payload.lead.assignedCloserId,
      assignedSetterName: payload.lead.assignedSetterName,
      assignedCloserName: payload.lead.assignedCloserName,
      lastTouchAt: payload.lead.lastTouchAt,
      href: `/app/cases/${payload.lead.id}`,
    },
    score: payload.score
      ? {
          total: payload.score.total,
          timeline: payload.score.timeline,
          investmentCapacity: payload.score.investmentCapacity,
          decisionAuthority: payload.score.decisionAuthority,
          painSeverity: payload.score.painSeverity,
          reasoning: payload.score.reasoning,
          triggeredBy: payload.score.triggeredBy,
          createdAt: payload.score.createdAt,
        }
      : null,
    scoreHistory: payload.scoreHistory.map((row) => ({
      id: row.id,
      total: row.total,
      previousTotal: row.previousTotal,
      reasoning: row.reasoning,
      triggeredBy: row.triggeredBy,
      createdAt: row.createdAt,
      scoredByName: row.scoredByName,
    })),
    objections: payload.objections.map((row) => ({
      id: row.id,
      type: row.type,
      resolved: row.resolved,
      resolvedAt: row.resolvedAt,
      createdAt: row.createdAt,
      callId: row.callId,
    })),
    nextActions: payload.nextActions.map((row) => ({
      id: row.id,
      actionText: row.actionText,
      dueAt: row.dueAt,
      completedAt: row.completedAt,
      ownerMemberId: row.ownerMemberId,
      ownerName: row.ownerName,
      overdue: row.overdue,
    })),
    calls: payload.calls.map((row) => ({
      id: row.id,
      type: row.type,
      occurredAt: row.occurredAt,
      scheduledAt: row.scheduledAt,
      outcome: row.outcome,
      hasTranscript: row.hasTranscript,
      extractionStatus: row.extractionStatus,
      href: `/app/calls/${row.id}`,
    })),
    members: payload.members,
    pendingFollowUps: payload.pendingFollowUps.map((row) => ({
      id: row.id,
      status: row.status,
      branch: row.branch,
      channel: row.channel,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      href: `/app/follow-ups/${row.id}`,
    })),
    revenue: hideRevenue
      ? { access: "denied", reason: "You do not have permission to read revenue." }
      : payload.revenue,
  };
}

async function toolCaseFile(input: Record<string, unknown>, ctx: AuthContext): Promise<ToolOutcome> {
  const leadId = asUuid(input.leadId);
  if (!leadId) return nothingFound("that is not a lead id");
  try {
    const payload = await refreshCaseFile(leadId);
    if (!payload) return nothingFound("that lead is not in this workspace");
    const hideRevenue = payload.revenue === null && !canViewReporting(ctx.role, ctx.isPlatformAdmin);
    const model = caseFileModel(payload, hideRevenue);
    return readOk(`Case file for ${payload.lead.name}.`, model, {
      kind: "leads",
      rows: [{ name: payload.lead.name, status: payload.lead.status, score: payload.lead.score }],
      links: leadLinks([payload.lead]),
    }, [payload.lead.id]);
  } catch (error) {
    return failFromError(error, "Could not load that case file.");
  }
}

async function toolScoreHistory(input: Record<string, unknown>): Promise<ToolOutcome> {
  const leadId = asUuid(input.leadId);
  if (!leadId) return nothingFound("that is not a lead id");
  try {
    const payload = await refreshCaseFile(leadId);
    if (!payload) return nothingFound("that lead is not in this workspace");
    if (!payload.score && payload.scoreHistory.length === 0) {
      return nothingFound("no score history on this lead");
    }
    return readOk(`Score history for ${payload.lead.name}.`, {
      found: true,
      lead: { id: payload.lead.id, name: payload.lead.name, href: `/app/cases/${payload.lead.id}` },
      score: payload.score,
      scoreHistory: payload.scoreHistory,
    }, {
      kind: "leads",
      rows: [{ name: payload.lead.name, score: payload.lead.score }],
      links: leadLinks([payload.lead]),
    }, [payload.lead.id]);
  } catch (error) {
    return failFromError(error, "Could not load score history.");
  }
}

async function toolTouchHistory(input: Record<string, unknown>): Promise<ToolOutcome> {
  const leadId = asUuid(input.leadId);
  if (!leadId) return nothingFound("that is not a lead id");
  try {
    const cursorAt = asString(input.cursorAt);
    const cursorId = asUuid(input.cursorId);
    const page = await loadCaseTimelinePage(
      leadId,
      cursorAt && cursorId ? { at: cursorAt, id: cursorId } : null
    );
    if (!page) return nothingFound("that lead is not in this workspace");
    if (page.entries.length === 0) return nothingFound("no touches on this lead");
    const entries = page.entries.map((entry) => {
      if (entry.kind === "touch") {
        return {
          kind: entry.kind,
          id: entry.id,
          at: entry.at,
          touchType: entry.touchType,
          channel: entry.channel,
          direction: entry.direction,
          outcome: entry.outcome,
          actorName: entry.actorName,
          note: entry.note,
        };
      }
      return entry;
    });
    const last = page.entries[page.entries.length - 1];
    return readOk(`${page.entries.length} timeline rows.`, {
      found: true,
      hasMore: page.hasMore,
      nextCursor: page.hasMore && last ? { at: last.at, id: last.id } : null,
      entries,
    }, {
      kind: "touches",
      rows: page.entries.map((entry) => ({
        at: entry.at,
        kind: entry.kind,
      })),
      links: [{ id: leadId, name: "Case file", href: `/app/cases/${leadId}` }],
    }, [leadId]);
  } catch (error) {
    return failFromError(error, "Could not load touch history.");
  }
}

async function toolCallDetail(input: Record<string, unknown>): Promise<ToolOutcome> {
  const callId = asUuid(input.callId);
  if (!callId) return nothingFound("that is not a call id");
  try {
    const payload = await refreshCallDetail(callId);
    if (!payload) return nothingFound("that call is not in this workspace");
    const extraction = payload.extraction
      ? {
          id: payload.extraction.id,
          statedObjectionState: payload.extraction.statedObjectionState,
          budgetSignalState: payload.extraction.budgetSignalState,
          timelineSignalState: payload.extraction.timelineSignalState,
          decisionProcessState: payload.extraction.decisionProcessState,
          nextStepState: payload.extraction.nextStepState,
          nextStepAgreed: payload.extraction.nextStepAgreed,
          extractedAt: payload.extraction.extractedAt,
          quoteCount: payload.extraction.quotes.length,
        }
      : null;
    return readOk(`Call for ${payload.lead.name}.`, {
      found: true,
      call: {
        id: payload.call.id,
        type: payload.call.type,
        occurredAt: payload.call.occurredAt,
        scheduledAt: payload.call.scheduledAt,
        outcome: payload.call.outcome,
        durationSeconds: payload.call.durationSeconds,
        hasTranscript: Boolean(payload.call.rawTranscript),
        href: `/app/calls/${payload.call.id}`,
      },
      lead: { id: payload.lead.id, name: payload.lead.name, href: `/app/cases/${payload.lead.id}` },
      extraction,
      objections: payload.objections.map((row) => ({
        id: row.id,
        type: row.type,
        resolved: row.resolved,
        resolvedAt: row.resolvedAt,
      })),
      job: payload.job
        ? {
            id: payload.job.id,
            status: payload.job.status,
            attemptCount: payload.job.attemptCount,
          }
        : null,
    }, {
      kind: "calls",
      rows: [{ name: payload.lead.name, type: payload.call.type }],
      links: [
        { id: payload.lead.id, name: payload.lead.name, href: `/app/cases/${payload.lead.id}` },
        { id: payload.call.id, name: "Call", href: `/app/calls/${payload.call.id}` },
      ],
    }, [payload.lead.id]);
  } catch (error) {
    return failFromError(error, "Could not load that call.");
  }
}

async function toolCallList(input: Record<string, unknown>): Promise<ToolOutcome> {
  try {
    const cursorAt = asString(input.cursorAt);
    const cursorId = asUuid(input.cursorId);
    const payload = await refreshCallList({
      cursor: cursorAt && cursorId ? { at: cursorAt, id: cursorId } : null,
    });
    const sliced = payload.rows.slice(0, OPERATOR_RESULT_PAGE_SIZE);
    if (sliced.length === 0) return nothingFound("no calls");
    const last = sliced[sliced.length - 1];
    const hasMore = payload.hasMore || payload.rows.length > sliced.length;
    return readOk(`${sliced.length} call${sliced.length === 1 ? "" : "s"}${hasMore ? " (more available)" : ""}.`, {
      found: true,
      hasMore,
      nextCursor: hasMore && last ? { at: last.occurredAt ?? last.scheduledAt, id: last.id } : null,
      rows: sliced.map((row) => ({
        id: row.id,
        leadId: row.leadId,
        leadName: row.leadName,
        type: row.type,
        occurredAt: row.occurredAt,
        scheduledAt: row.scheduledAt,
        outcome: row.outcome,
        extractionStatus: row.extractionStatus,
        href: `/app/calls/${row.id}`,
        caseHref: `/app/cases/${row.leadId}`,
      })),
    }, {
      kind: "calls",
      rows: sliced.map((row) => ({ name: row.leadName, type: row.type })),
      links: sliced.map((row) => ({
        id: row.leadId,
        name: row.leadName,
        href: `/app/cases/${row.leadId}`,
      })),
    }, sliced.map((row) => row.leadId));
  } catch (error) {
    return failFromError(error, "Could not list calls.");
  }
}

async function toolObjections(input: Record<string, unknown>): Promise<ToolOutcome> {
  const leadId = asUuid(input.leadId);
  if (!leadId) return nothingFound("that is not a lead id");
  try {
    const payload = await refreshCaseFile(leadId);
    if (!payload) return nothingFound("that lead is not in this workspace");
    let rows: CaseObjection[] = payload.objections;
    const typeFilter = asString(input.type);
    const resolvedFilter = asBool(input.resolved);
    if (typeFilter) rows = rows.filter((row) => row.type === typeFilter);
    if (resolvedFilter !== null) rows = rows.filter((row) => row.resolved === resolvedFilter);
    if (rows.length === 0) return nothingFound("no objections matched");
    return readOk(`${rows.length} objection${rows.length === 1 ? "" : "s"} on ${payload.lead.name}.`, {
      found: true,
      lead: { id: payload.lead.id, name: payload.lead.name, href: `/app/cases/${payload.lead.id}` },
      objections: rows.map((row) => ({
        id: row.id,
        type: row.type,
        resolved: row.resolved,
        resolvedAt: row.resolvedAt,
        resolvedNote: row.resolvedNote,
        createdAt: row.createdAt,
        callId: row.callId,
        callType: row.callType,
        callOccurredAt: row.callOccurredAt,
      })),
    }, {
      kind: "objections",
      rows: rows.map((row) => ({ type: row.type, resolved: row.resolved ? "resolved" : "open" })),
      links: leadLinks([payload.lead]),
    }, [payload.lead.id]);
  } catch (error) {
    return failFromError(error, "Could not load objections.");
  }
}

async function toolQueue(input: Record<string, unknown>, ctx: AuthContext): Promise<ToolOutcome> {
  try {
    const assignedRaw = asString(input.assigned);
    const trackRaw = asString(input.track);
    const statusRaw = asString(input.status);
    const filters: QueueFilters = {
      assigned:
        assignedRaw && (QUEUE_ASSIGNED as readonly string[]).includes(assignedRaw)
          ? (assignedRaw as QueueAssignedFilter)
          : defaultAssignedFilter(ctx.role, ctx.isPlatformAdmin),
      track: trackRaw && (QUEUE_TRACKS as readonly string[]).includes(trackRaw) ? (trackRaw as QueueTrackFilter) : null,
      status:
        statusRaw && (QUEUE_STATUSES as readonly string[]).includes(statusRaw)
          ? (statusRaw as QueueStatusFilter)
          : null,
      source: asString(input.source),
      scoreMin: asInt(input.scoreMin),
      scoreMax: asInt(input.scoreMax),
      breached: asBool(input.breached) === true,
    };
    const cursor = decodeQueueCursor(asString(input.cursor));
    const payload = await refreshQueue(filters, { cursor, limit: OPERATOR_RESULT_PAGE_SIZE });
    const rows = [...payload.alarm, ...payload.queue];
    if (rows.length === 0) return nothingFound("nothing in the queue for those filters");
    const last = payload.queue[payload.queue.length - 1] ?? payload.alarm[payload.alarm.length - 1];
    return readOk(
      `${payload.alarm.length} in alarm, ${payload.queue.length} in queue.`,
      {
        found: true,
        members: payload.members,
        sources: payload.sources,
        hasMore: payload.hasMore,
        nextCursor: payload.hasMore && last ? encodeQueueCursor({
          u: last.urgencyRank ?? 99,
          s: last.sortScore,
          t: last.lastTouchAt,
          id: last.id,
        }) : null,
        alarm: payload.alarm.map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status,
          score: row.score,
          href: `/app/cases/${row.id}`,
        })),
        queue: payload.queue.map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status,
          score: row.score,
          assignedSetterName: row.assignedSetterName,
          assignedCloserName: row.assignedCloserName,
          nextAction: row.nextAction,
          href: `/app/cases/${row.id}`,
        })),
        pendingDrafts: payload.pendingDrafts.map((row) => ({
          id: row.id,
          leadId: row.leadId,
          leadName: row.leadName,
          status: row.status,
          branch: row.branch,
          channel: row.channel,
          createdAt: row.createdAt,
          href: `/app/follow-ups/${row.id}`,
        })),
      },
      {
        kind: "leads",
        rows: rows.map((row) => ({ name: row.name, status: row.status, score: row.score })),
        links: leadLinks(rows),
      },
      rows.map((row) => row.id)
    );
  } catch (error) {
    return failFromError(error, "Could not load the queue.");
  }
}

async function toolReporting(input: Record<string, unknown>, ctx: AuthContext): Promise<ToolOutcome> {
  if (!canViewReporting(ctx.role, ctx.isPlatformAdmin)) {
    return permissionDenied("You do not have permission to read reporting figures.");
  }
  const panelRaw = asString(input.panel);
  if (!panelRaw || !(REPORTING_PANELS as readonly string[]).includes(panelRaw)) {
    return failFromError(new Error("That is not a reporting panel."), "That is not a reporting panel.");
  }
  try {
    const meta = await loadReportingState(ctx.org.id);
    const activatedAt = typeof meta.activated_at === "string" ? meta.activated_at : null;
    const range = parseReportingRange(
      {
        range: asString(input.range) ?? "last_30d",
        from: asString(input.from) ?? undefined,
        to: asString(input.to) ?? undefined,
      },
      activatedAt
    );
    const data = await loadReportingPanel(ctx.org.id, panelRaw as ReportingPanel, range);
    return readOk(`Reporting panel ${panelRaw}.`, {
      found: true,
      panel: panelRaw,
      range: { key: range.key, from: range.from, to: range.to },
      data,
    }, null, []);
  } catch (error) {
    return failFromError(error, "Could not load reporting.");
  }
}

export async function runReadTool(
  name: string,
  rawInput: unknown,
  ctx: AuthContext
): Promise<ToolOutcome> {
  const input = rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
    ? (rawInput as Record<string, unknown>)
    : {};
  switch (name) {
    case "find_leads":
      return toolFindLeads(input);
    case "get_case_file":
      return toolCaseFile(input, ctx);
    case "get_score_history":
      return toolScoreHistory(input);
    case "get_touch_history":
      return toolTouchHistory(input);
    case "get_call_detail":
      return toolCallDetail(input);
    case "get_call_list":
      return toolCallList(input);
    case "get_objections":
      return toolObjections(input);
    case "get_queue":
      return toolQueue(input, ctx);
    case "get_reporting":
      return toolReporting(input, ctx);
    default:
      return {
        ok: false,
        kind: "failed",
        error: "That is not a tool.",
        summary: "That is not a tool.",
        leadIds: [],
      };
  }
}

export function modelToolResultPayload(outcome: ToolOutcome): string {
  if (!outcome.ok) {
    return jsonForModel({
      ok: false,
      kind: outcome.kind,
      error: outcome.error,
    });
  }
  return jsonForModel({ ok: true, summary: outcome.summary, result: outcome.model });
}
