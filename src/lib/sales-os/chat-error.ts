/** The sentence a person should read when Ask Vistrial's request fails. */
export function chatErrorMessage(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "Vistrial can't think right now.";
  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error.trim();
  } catch {
    // The body is already a sentence.
  }
  return trimmed.length < 300 ? trimmed : "Something went wrong. Nothing outside Vistrial was changed.";
}
