import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_INTEGRATIONS,
  type ActivityCategory,
  type ActivityFilters,
  type ActivityIntegration,
} from "@/lib/activity/types";

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function isCategory(value: string): value is ActivityCategory {
  return (ACTIVITY_CATEGORIES as readonly string[]).includes(value);
}

function isIntegration(value: string): value is ActivityIntegration {
  return (ACTIVITY_INTEGRATIONS as readonly string[]).includes(value);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function flag(value: string | null): boolean {
  return value === "1" || value === "true";
}

export function parseActivityFilters(
  params: Record<string, string | string[] | undefined>
): ActivityFilters {
  const categoryRaw = firstParam(params.category);
  const actorRaw = firstParam(params.actor);
  const integrationRaw = firstParam(params.integration);
  const fromRaw = firstParam(params.from);
  const toRaw = firstParam(params.to);
  const orgRaw = firstParam(params.client) ?? firstParam(params.org);

  return {
    category: categoryRaw && isCategory(categoryRaw) ? categoryRaw : null,
    actorUserId: actorRaw && isUuid(actorRaw) ? actorRaw : null,
    integration: integrationRaw && isIntegration(integrationRaw) ? integrationRaw : null,
    failuresOnly: flag(firstParam(params.failures)),
    includeSync: flag(firstParam(params.sync)),
    includeRoutine: flag(firstParam(params.routine)),
    q: firstParam(params.q),
    from: fromRaw && isIsoDate(fromRaw) ? fromRaw : null,
    to: toRaw && isIsoDate(toRaw) ? toRaw : null,
    orgId: orgRaw && isUuid(orgRaw) ? orgRaw : null,
  };
}

export function activityFiltersHref(
  filters: ActivityFilters,
  base = "/app/activity"
): string {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.actorUserId) params.set("actor", filters.actorUserId);
  if (filters.integration) params.set("integration", filters.integration);
  if (filters.failuresOnly) params.set("failures", "1");
  if (filters.includeSync) params.set("sync", "1");
  if (filters.includeRoutine) params.set("routine", "1");
  if (filters.q) params.set("q", filters.q);
  if (filters.from) params.set("from", filters.from.slice(0, 10));
  if (filters.to) params.set("to", filters.to.slice(0, 10));
  if (filters.orgId) params.set("client", filters.orgId);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function activityHasConstraints(filters: ActivityFilters): boolean {
  return Boolean(
    filters.category ||
      filters.actorUserId ||
      filters.integration ||
      filters.failuresOnly ||
      filters.includeSync ||
      filters.includeRoutine ||
      filters.q ||
      filters.from ||
      filters.to ||
      filters.orgId
  );
}

export function activityRangeBounds(filters: ActivityFilters): {
  from: string | null;
  to: string | null;
} {
  const from = filters.from
    ? filters.from.includes("T")
      ? filters.from
      : `${filters.from}T00:00:00.000Z`
    : null;
  const to = filters.to
    ? filters.to.includes("T")
      ? filters.to
      : `${filters.to}T23:59:59.999Z`
    : null;
  return { from, to };
}
