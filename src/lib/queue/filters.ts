import type { OrgRole } from "@/types/database";

import {
  QUEUE_ASSIGNED,
  QUEUE_STATUSES,
  QUEUE_TRACKS,
  type QueueAssignedFilter,
  type QueueFilters,
  type QueueStatusFilter,
  type QueueTrackFilter,
} from "@/lib/queue/types";

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function isAssigned(value: string): value is QueueAssignedFilter {
  return (QUEUE_ASSIGNED as readonly string[]).includes(value);
}

function isTrack(value: string): value is QueueTrackFilter {
  return (QUEUE_TRACKS as readonly string[]).includes(value);
}

function isStatus(value: string): value is QueueStatusFilter {
  return (QUEUE_STATUSES as readonly string[]).includes(value);
}

function parseScore(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) return null;
  return parsed;
}

export function defaultAssignedFilter(
  role: OrgRole,
  isPlatformAdmin = false
): QueueAssignedFilter {
  if (isPlatformAdmin || role === "owner" || role === "admin") return "all";
  return "me_or_unassigned";
}

export function parseQueueFilters(
  params: Record<string, string | string[] | undefined>,
  opts: { role: OrgRole; isPlatformAdmin?: boolean }
): QueueFilters {
  const assignedRaw = firstParam(params.assigned);
  const assigned =
    assignedRaw && isAssigned(assignedRaw)
      ? assignedRaw
      : defaultAssignedFilter(opts.role, opts.isPlatformAdmin);

  const trackRaw = firstParam(params.track);
  const statusRaw = firstParam(params.status);
  let scoreMin = parseScore(firstParam(params.scoreMin));
  let scoreMax = parseScore(firstParam(params.scoreMax));
  if (scoreMin !== null && scoreMax !== null && scoreMin > scoreMax) {
    const swap = scoreMin;
    scoreMin = scoreMax;
    scoreMax = swap;
  }

  return {
    assigned,
    track: trackRaw && isTrack(trackRaw) ? trackRaw : null,
    status: statusRaw && isStatus(statusRaw) ? statusRaw : null,
    source: firstParam(params.source),
    scoreMin,
    scoreMax,
    breached:
      firstParam(params.breached) === "1" ||
      firstParam(params.breached) === "true" ||
      firstParam(params.focus) === "breached",
  };
}

/**
 * How many filters the person actually chose. The assignment default is not a
 * choice, so it does not count — otherwise the button always looks filtered.
 */
export function activeQueueFilterCount(
  filters: QueueFilters,
  opts: { role: OrgRole; isPlatformAdmin?: boolean }
): number {
  let count = 0;
  if (filters.assigned !== defaultAssignedFilter(opts.role, opts.isPlatformAdmin)) count += 1;
  if (filters.track) count += 1;
  if (filters.status) count += 1;
  if (filters.source) count += 1;
  if (filters.scoreMin !== null || filters.scoreMax !== null) count += 1;
  return count;
}

export function queueFiltersToSearchParams(filters: QueueFilters): URLSearchParams {
  const params = new URLSearchParams();
  params.set("assigned", filters.assigned);
  if (filters.track) params.set("track", filters.track);
  if (filters.status) params.set("status", filters.status);
  if (filters.source) params.set("source", filters.source);
  if (filters.scoreMin !== null) params.set("scoreMin", String(filters.scoreMin));
  if (filters.scoreMax !== null) params.set("scoreMax", String(filters.scoreMax));
  if (filters.breached) params.set("breached", "1");
  return params;
}

export function queueFiltersHref(filters: QueueFilters): string {
  const qs = queueFiltersToSearchParams(filters).toString();
  return qs ? `/app/queue?${qs}` : "/app/queue";
}
