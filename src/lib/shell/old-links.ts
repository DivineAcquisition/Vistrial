/**
 * Links from before the Chat tab. Each work tab once had its own chat box, reached with `?ask=` (a filled-in
 * question), `?objective=` (the same, older) or `?intake=` (a conversation in progress). Those now open the
 * Chat tab: the conversation as it was, or a new one preset for the tab's skill with the question filled in.
 */
export function oldChatLink(base: string, skill: string, query: { get(name: string): string | null }): string | null {
  const intake = query.get("intake");
  if (intake) return `${base}/work/chat?c=${encodeURIComponent(intake)}`;
  const ask = query.get("ask") ?? query.get("objective");
  if (ask) return `${base}/work/chat?skill=${skill}&ask=${encodeURIComponent(ask)}`;
  return null;
}

/** The old "new session" page, with whatever it carried. */
export function newSessionLink(base: string, query: Record<string, string | string[] | undefined>): string {
  const read = (key: string) => (typeof query[key] === "string" && query[key] ? (query[key] as string) : null);
  return oldChatLink(base, "market-intelligence", { get: read }) ?? `${base}/work/chat`;
}
