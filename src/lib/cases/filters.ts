import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads/labels";
import {
  CASE_SORTS,
  CASE_SORT_DIRS,
  CASE_TRACKS,
  type CaseListFilters,
  type CaseSort,
  type CaseSortDir,
  type CaseTrackFilter,
} from "@/lib/cases/types";

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function isStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

function isTrack(value: string): value is CaseTrackFilter {
  return (CASE_TRACKS as readonly string[]).includes(value);
}

function isSort(value: string): value is CaseSort {
  return (CASE_SORTS as readonly string[]).includes(value);
}

function isDir(value: string): value is CaseSortDir {
  return (CASE_SORT_DIRS as readonly string[]).includes(value);
}

function parseScore(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) return null;
  return parsed;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLeadId(value: string): boolean {
  return UUID_RE.test(value);
}

function parseUuid(value: string | null): string | null {
  if (!value || !isLeadId(value)) return null;
  return value;
}

function parseDate(value: string | null): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  return value;
}

export function parseCaseListFilters(
  params: Record<string, string | string[] | undefined>
): CaseListFilters {
  const sortRaw = firstParam(params.sort);
  const dirRaw = firstParam(params.dir);
  const statusRaw = firstParam(params.status);
  const trackRaw = firstParam(params.track);
  let scoreMin = parseScore(firstParam(params.scoreMin));
  let scoreMax = parseScore(firstParam(params.scoreMax));
  if (scoreMin !== null && scoreMax !== null && scoreMin > scoreMax) {
    const swap = scoreMin;
    scoreMin = scoreMax;
    scoreMax = swap;
  }

  let optedFrom = parseDate(firstParam(params.optedFrom));
  let optedTo = parseDate(firstParam(params.optedTo));
  if (optedFrom && optedTo && optedFrom > optedTo) {
    const swap = optedFrom;
    optedFrom = optedTo;
    optedTo = swap;
  }

  return {
    q: firstParam(params.q),
    status: statusRaw && isStatus(statusRaw) ? statusRaw : null,
    track: trackRaw && isTrack(trackRaw) ? trackRaw : null,
    source: firstParam(params.source),
    setterId: parseUuid(firstParam(params.setter)),
    closerId: parseUuid(firstParam(params.closer)),
    scoreMin,
    scoreMax,
    optedFrom,
    optedTo,
    sort: sortRaw && isSort(sortRaw) ? sortRaw : "last_touch",
    dir: dirRaw && isDir(dirRaw) ? dirRaw : "desc",
  };
}

export function caseListHasConstraints(filters: CaseListFilters): boolean {
  return Boolean(
    filters.q ||
      filters.status ||
      filters.track ||
      filters.source ||
      filters.setterId ||
      filters.closerId ||
      filters.scoreMin !== null ||
      filters.scoreMax !== null ||
      filters.optedFrom ||
      filters.optedTo
  );
}

export function caseFiltersToSearchParams(filters: CaseListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.track) params.set("track", filters.track);
  if (filters.source) params.set("source", filters.source);
  if (filters.setterId) params.set("setter", filters.setterId);
  if (filters.closerId) params.set("closer", filters.closerId);
  if (filters.scoreMin !== null) params.set("scoreMin", String(filters.scoreMin));
  if (filters.scoreMax !== null) params.set("scoreMax", String(filters.scoreMax));
  if (filters.optedFrom) params.set("optedFrom", filters.optedFrom);
  if (filters.optedTo) params.set("optedTo", filters.optedTo);
  if (filters.sort !== "last_touch") params.set("sort", filters.sort);
  if (filters.dir !== "desc") params.set("dir", filters.dir);
  return params;
}

export function caseFiltersHref(filters: CaseListFilters): string {
  const qs = caseFiltersToSearchParams(filters).toString();
  return qs ? `/app/cases?${qs}` : "/app/cases";
}
