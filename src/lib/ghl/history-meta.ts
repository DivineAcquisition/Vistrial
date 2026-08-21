const BODY_KEYS = new Set([
  "body",
  "html",
  "text",
  "message",
  "emailBody",
  "smsBody",
  "content",
  "preview",
  "snippet",
  "subject",
  "attachments",
  "email",
  "raw",
  "rawBody",
  "conversationBody",
  "messageBody",
  "htmlBody",
  "plainText",
]);

export function stripMessageBodies(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => stripMessageBodies(item, depth + 1));
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (BODY_KEYS.has(key) || /body|html|transcript|verbatim/i.test(key)) continue;
    out[key] = stripMessageBodies(nested, depth + 1);
  }
  return out;
}

export function messageHasBody(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (BODY_KEYS.has(key) || /body|html|transcript|verbatim/i.test(key)) return true;
    if (messageHasBody(record[key])) return true;
  }
  return false;
}
