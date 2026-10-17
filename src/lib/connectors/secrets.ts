const SECRET_SHAPE =
  /(access_token|refresh_token|client_secret|api_key|signing_secret|bearer\s+[a-z0-9._\-]{8,})/i;

export function lastFour(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length <= 4) return trimmed;
  return trimmed.slice(-4);
}

export function safeLogFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (/token|secret|password|key|authorization/i.test(key)) continue;
    if (typeof value === "string" && SECRET_SHAPE.test(value)) continue;
    out[key] = value;
  }
  return out;
}

export function logLineHasSecret(line: string): boolean {
  return SECRET_SHAPE.test(line);
}
