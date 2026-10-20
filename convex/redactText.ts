const PATTERNS: RegExp[] = [
  /(?:^|\n)\s*>[^\n]*/g,
  /lead(?:'s|’) reply\s*:\s*[\s\S]*?(?=\n\n|$)/gi,
  /(?:they|the lead) (?:replied|wrote|said)\s*:\s*["“][\s\S]*?["”]/gi,
  /On .+ wrote:\s*[\s\S]*$/gi,
  /inbound message\s*:\s*[\s\S]*?(?=\n\n|$)/gi,
];

/** Remove a quoted inbound reply from an output body. Other words stay. */
export function redactInbound(text: string | null | undefined): { text: string | null; redacted: boolean } {
  if (text == null || text === "") return { text: text ?? null, redacted: false };
  let next = text;
  let redacted = false;
  for (const pattern of PATTERNS) {
    next = next.replace(pattern, () => {
      redacted = true;
      return "";
    });
  }
  if (!redacted) return { text, redacted: false };
  return { text: next.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), redacted: true };
}

/** New events keep ids. A stored phrase uses "a lead" until a screen fills the name. */
export function withoutLeadName(text: string, leadName: string | null | undefined): string {
  const name = leadName?.replace(/\s+/g, " ").trim();
  if (!name || name.toLowerCase() === "a lead") return text;
  return text.split(name).join("a lead");
}

export function displayLeadPhrase(args: {
  verbatim: boolean;
  stored: string;
  leadName: string | null;
  canSeeLead: boolean;
}): string {
  if (args.verbatim) return args.stored;
  if (!args.canSeeLead || !args.leadName) {
    return args.stored.replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "a lead");
  }
  return args.stored.split("a lead").join(args.leadName);
}
