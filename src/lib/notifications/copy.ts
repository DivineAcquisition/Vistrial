const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const QUOTE_RE = /[“"][^”"]{8,}[”"]/g;

const FORBIDDEN = [
  "transcript",
  "recording",
  "budget",
  "objection",
  "said:",
  "spouse",
];

export function leadDisplayName(firstName: string | null | undefined): string {
  const name = firstName?.trim();
  if (!name) return "a lead";
  return name.split(/\s+/)[0] ?? "a lead";
}

export function sanitizeNotificationText(value: string): string {
  let next = value.replace(new RegExp(EMAIL_RE.source, "gi"), "").replace(new RegExp(PHONE_RE.source, "g"), "").replace(QUOTE_RE, "");
  const lower = next.toLowerCase();
  for (const word of FORBIDDEN) {
    if (lower.includes(word)) {
      next = "Open Vistrial to continue.";
      break;
    }
  }
  return next.replace(/\s+/g, " ").trim();
}

export function assertLockScreenSafe(title: string, body: string): void {
  const combined = `${title}\n${body}`;
  if (new RegExp(EMAIL_RE.source, "i").test(combined) || new RegExp(PHONE_RE.source).test(combined)) {
    throw new Error("Notification copy contained contact details.");
  }
}

export function containsContactDetails(value: string): boolean {
  return new RegExp(EMAIL_RE.source, "i").test(value) || new RegExp(PHONE_RE.source).test(value);
}
