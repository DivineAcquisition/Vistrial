/**
 * Screens the Sales OS replaces. Their data stays; only the screens move, so
 * every old link keeps working in a Sales OS workspace.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function salesOsRedirect(path: string): string | null {
  const clean = path.split("?")[0]?.replace(/\/+$/, "") ?? "";
  if (clean === "/app/cases") return "/app/leads";
  if (clean.startsWith("/app/cases/")) {
    const id = clean.split("/")[3] ?? "";
    return UUID.test(id) ? `/app/leads/${id}` : "/app/leads";
  }
  for (const prefix of ["/app/onboarding", "/app/forsight"]) {
    if (clean === prefix || clean.startsWith(`${prefix}/`)) return "/app/command";
  }
  return null;
}

/** The roster keeps no links to screens the Sales OS replaced. */
export function withoutRetiredPages<T extends { areas: { workPage: { href: string } | null }[] }>(summary: T): T {
  return { ...summary, areas: summary.areas.map((area) => (area.workPage && salesOsRedirect(area.workPage.href) ? { ...area, workPage: null } : area)) };
}
