import type { RelayChannel } from "@/lib/relay/facts";

/**
 * The opt-out line and required disclosures. The system adds these, never
 * the model, so they are always present and always worded the same way.
 */
export function buildFooter(input: { channel: RelayChannel; optOutWords: unknown; disclosures: unknown }): string {
  const words = Array.isArray(input.optOutWords) ? input.optOutWords.filter((word): word is string => typeof word === "string" && word.trim() !== "") : [];
  const word = (words[0] ?? "STOP").trim().toUpperCase();
  const disclosures = Array.isArray(input.disclosures)
    ? input.disclosures.filter((line): line is string => typeof line === "string" && line.trim() !== "").map((line) => line.trim())
    : [];
  const optOut =
    input.channel === "sms" ? `Reply ${word} to opt out.` : `Reply ${word} and we will not email you again.`;
  const mentionsOptOut = disclosures.some((line) => new RegExp(`\\b${escapeRe(word)}\\b`, "i").test(line));
  return [...disclosures, mentionsOptOut ? null : optOut].filter(Boolean).join(" ");
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The message exactly as the person should paste it into the CRM. */
export function finalMessage(body: string, footer: string | null): string {
  const text = body.trim();
  return footer ? `${text}\n\n${footer}` : text;
}
