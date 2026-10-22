/**
 * Screens the Sales OS replaces. Their data stays; only the screens move, so
 * every old link keeps working in a Sales OS workspace.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONVERSATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function salesOsRedirect(path: string): string | null {
  const clean = path.split("?")[0]?.replace(/\/+$/, "") ?? "";
  if (clean === "/app/cases") return "/app/leads";
  if (clean.startsWith("/app/cases/")) {
    const id = clean.split("/")[3] ?? "";
    return UUID.test(id) ? `/app/leads/${id}` : "/app/leads";
  }
  for (const prefix of ["/app/onboarding", "/app/forsight", "/app/today"]) {
    if (clean === prefix || clean.startsWith(`${prefix}/`)) return "/app/command";
  }
  return null;
}

/**
 * Where /app/ask goes. A Sales OS workspace renders the conversation
 * workspace. Every other workspace still opens Compass.
 */
export function askPageRedirect(salesOs: boolean, conversationId: string | undefined): string | null {
  if (salesOs) return null;
  const id = conversationId ?? "";
  return CONVERSATION_ID.test(id) ? `/app/compass?c=${id}&legacy=1` : "/app/compass";
}

/** The Sales OS conversation, with an optional question ready to send. */
export function askHref(question?: string): string {
  const text = question?.trim().slice(0, 2000) ?? "";
  return text ? `/app/ask?q=${encodeURIComponent(text)}` : "/app/ask";
}

/** The roster keeps no links to screens the Sales OS replaced. */
export function withoutRetiredPages<T extends { areas: { workPage: { href: string } | null }[] }>(summary: T): T {
  return { ...summary, areas: summary.areas.map((area) => (area.workPage && salesOsRedirect(area.workPage.href) ? { ...area, workPage: null } : area)) };
}
