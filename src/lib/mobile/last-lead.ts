const PREFIX = "vistrial:last-opened-lead:";

export function lastOpenedLeadKey(orgId: string): string {
  return `${PREFIX}${orgId}`;
}

export function rememberOpenedLead(orgId: string, leadId: string): void {
  if (typeof window === "undefined") return;
  if (!orgId || !leadId) return;
  window.localStorage.setItem(lastOpenedLeadKey(orgId), leadId);
}

export function readLastOpenedLead(orgId: string): string | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(lastOpenedLeadKey(orgId));
  return value && value.length > 0 ? value : null;
}

export function lastOpenedLeadHref(orgId: string): string | null {
  const id = readLastOpenedLead(orgId);
  return id ? `/app/cases/${id}/brief` : null;
}
