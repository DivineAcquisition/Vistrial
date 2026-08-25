const BODY_KEY =
  /^(body|message|html|text|content|transcript|raw_transcript|rawTranscript|outbound_body|outboundBody|generated_body|edited_body|sent_body|opening_text|draft|quotes|verbatim)$/i;

const SECRET_KEY = /^(access_token|refresh_token|token|client_secret|authorization|password)$/i;

function stripValue(value: unknown, depth: number): unknown {
  if (depth > 8) return "[truncated]";
  if (typeof value === "string") {
    return value.length > 400 ? `${value.slice(0, 400)}…` : value;
  }
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => stripValue(item, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (BODY_KEY.test(key) || SECRET_KEY.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = stripValue(nested, depth + 1);
  }
  return out;
}

/** Tool results sent to the model and stored on the run. Message bodies and transcripts never leave. Names stay so the operator can disambiguate people. */
export function redactForAgent(value: unknown): unknown {
  return stripValue(value, 0);
}

export function jsonForModel(value: unknown): string {
  try {
    return JSON.stringify(redactForAgent(value));
  } catch {
    return '{"error":"unserializable"}';
  }
}

export function containsMessageBody(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(record)) {
    if (BODY_KEY.test(key) && nested !== "[redacted]" && nested != null && nested !== "") {
      return true;
    }
    if (typeof nested === "object" && nested && containsMessageBody(nested)) return true;
  }
  return false;
}
