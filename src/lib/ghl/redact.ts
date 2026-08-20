const SENSITIVE_KEY =
  /^(access_token|refresh_token|token|client_secret|authorization|password|body|message|html|text|email|phone|firstName|lastName|first_name|last_name|from|to|attachments|raw|rawBody|content|transcript|raw_transcript|quotes|verbatim|summary|stated_objection|budget_signal|timeline_signal|decision_process|next_step_agreed|opening_text)$/i;

const SENSITIVE_FRAGMENT =
  /(access_token|refresh_token|client_secret|authorization|bearer )/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

function redactUnknown(value: unknown, depth: number): unknown {
  if (depth > 8) return "[truncated]";
  if (typeof value === "string") {
    if (SENSITIVE_FRAGMENT.test(value)) return "[redacted]";
    return value.length > 240 ? `${value.slice(0, 240)}…` : value;
  }
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactUnknown(item, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? "[redacted]" : redactUnknown(nested, depth + 1);
  }
  return out;
}

/** Structured-log sanitizer. Tokens, bodies, and contact details become [redacted]. */
export function redactForLog(value: unknown): unknown {
  return redactUnknown(value, 0);
}

export function assertNoSecrets(text: string): boolean {
  return !SENSITIVE_FRAGMENT.test(text);
}
