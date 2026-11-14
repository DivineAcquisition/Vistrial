/**
 * The sales roles Dealmaker serves and the home each one gets (docs/rebuild/dealmaker.md, 0.1). A sales role
 * is separate from the app role (Owner, Admin, Member, Viewer): it says what part of selling a person does.
 * Each home is filtered to the deals assigned to that person in the CRM, matched by the CRM user a person
 * linked them to. Owners and Admins see every deal.
 */

export const SALES_ROLES = ["setter", "closer", "lead"] as const;
export type SalesRole = (typeof SALES_ROLES)[number];

export const SALES_ROLE_LABEL: Record<SalesRole, { name: string; home: string }> = {
  setter: { name: "Setter", home: "Booking calls and no-shows" },
  closer: { name: "Closer", home: "Calls and proposals" },
  lead: { name: "Sales lead", home: "Every deal, and what waits for approval" },
};

export type TeamRow = { memberId: string; salesRole: SalesRole; crmUserRef?: string };

export type DealScope =
  | { kind: "all"; why: string }
  | { kind: "assigned"; crmUserRef: string; why: string }
  | { kind: "none"; why: string };

export const SCOPE_WORDS = {
  all: "You see every deal.",
  assigned: "You see the deals assigned to you in your CRM.",
  unlinked: "You are not linked to a CRM user yet, so no deals are shown. An Owner or Admin can link you.",
  noRole: "You have no sales role yet. An Owner or Admin can give you one.",
} as const;

/** Which deals a member's home shows. An Owner or Admin, or a sales lead, sees all of them. */
export function dealScope(appRole: string, row: TeamRow | undefined): DealScope {
  if (appRole === "owner" || appRole === "admin" || row?.salesRole === "lead") return { kind: "all", why: SCOPE_WORDS.all };
  if (!row) return { kind: "none", why: SCOPE_WORDS.noRole };
  if (!row.crmUserRef) return { kind: "none", why: SCOPE_WORDS.unlinked };
  return { kind: "assigned", crmUserRef: row.crmUserRef, why: SCOPE_WORDS.assigned };
}

export function inScope<T extends { ownerRef: string | null }>(scope: DealScope, deals: T[]): T[] {
  if (scope.kind === "all") return deals;
  if (scope.kind === "none") return [];
  return deals.filter((deal) => deal.ownerRef === scope.crmUserRef);
}
