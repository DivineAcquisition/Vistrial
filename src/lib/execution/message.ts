/**
 * The one shape a Slack or Discord post takes. Structured, so what the team
 * reads is consistent whichever the client uses.
 */
export type StructuredMessage = {
  title: string;
  summary?: string;
  fields?: Array<{ label: string; value: string }>;
  footer?: string;
};

export const MAX_FIELDS = 10;

export function normalizeMessage(message: StructuredMessage): StructuredMessage {
  return {
    title: message.title.trim(),
    summary: message.summary?.trim() || undefined,
    fields: (message.fields ?? [])
      .map((field) => ({ label: field.label.trim(), value: field.value.trim() }))
      .filter((field) => field.label && field.value)
      .slice(0, MAX_FIELDS),
    footer: message.footer?.trim() || undefined,
  };
}

/** The plain-text form: the fallback a client shows, and what the write log keeps. */
export function messageToText(message: StructuredMessage): string {
  const normal = normalizeMessage(message);
  return [
    normal.title,
    normal.summary,
    ...(normal.fields ?? []).map((field) => `${field.label}: ${field.value}`),
    normal.footer,
  ]
    .filter(Boolean)
    .join("\n");
}

export function validateMessage(message: StructuredMessage): string | null {
  if (!message.title.trim()) return "A post needs a title.";
  return null;
}
