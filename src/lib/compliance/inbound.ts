/** The text of an inbound message, from the webhook's original body (the stored payload has it redacted). */
export function inboundMessageText(rawBody: string | null | undefined): string | null {
  if (!rawBody) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const records = [parsed, (parsed as { data?: unknown } | null)?.data, (parsed as { message?: unknown } | null)?.message];
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;
    for (const key of ["body", "message", "messageBody", "text"]) {
      const value = (record as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return null;
}
