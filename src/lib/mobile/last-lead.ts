const PREFIX = "vistrial:last-opened-lead:";
const RECENT_PREFIX = "vistrial:recent-leads:";
const RECENT_LIMIT = 8;

export function lastOpenedLeadKey(orgId: string): string {
  return `${PREFIX}${orgId}`;
}

export function recentLeadsKey(orgId: string): string {
  return `${RECENT_PREFIX}${orgId}`;
}

export function readRecentLeads(orgId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(recentLeadsKey(orgId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

export function rememberOpenedLead(orgId: string, leadId: string): void {
  if (typeof window === "undefined") return;
  if (!orgId || !leadId) return;
  window.localStorage.setItem(lastOpenedLeadKey(orgId), leadId);
  const recent = [leadId, ...readRecentLeads(orgId).filter((id) => id !== leadId)].slice(0, RECENT_LIMIT);
  window.localStorage.setItem(recentLeadsKey(orgId), JSON.stringify(recent));
}

export function readLastOpenedLead(orgId: string): string | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(lastOpenedLeadKey(orgId));
  return value && value.length > 0 ? value : null;
}

export function lastOpenedLeadHref(orgId: string): string | null {
  const id = readLastOpenedLead(orgId);
  return id ? `/app/cases/${id}` : null;
}
