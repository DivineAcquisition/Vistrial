export function emailFromGhlUser(json: unknown): string | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const row = json as Record<string, unknown>;
  const nested =
    row.user && typeof row.user === "object" && !Array.isArray(row.user)
      ? (row.user as Record<string, unknown>)
      : null;
  const raw =
    (typeof row.email === "string" && row.email) ||
    (typeof row.emailAddress === "string" && row.emailAddress) ||
    (nested && typeof nested.email === "string" && nested.email) ||
    null;
  const email = raw?.trim().toLowerCase() ?? "";
  return email.includes("@") ? email : null;
}
