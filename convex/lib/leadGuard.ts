const SCOPED: Array<[string, string[]]> = [
  ["leadId", ["leadQuery", "leadMutation"]],
  ["callId", ["callQuery", "callMutation"]],
  ["bookingId", ["bookingQuery", "bookingMutation"]],
  ["taskId", ["taskQuery", "taskMutation"]],
  ["noteId", ["noteQuery", "noteMutation"]],
  ["conversationId", ["conversationQuery", "conversationMutation"]],
  ["messageId", ["messageQuery", "messageMutation"]],
];

export function leadBuilderViolations(files: Array<{ path: string; source: string }>): string[] {
  const violations: string[] = [];
  for (const file of files) {
    if (file.path.endsWith(".test.ts")) continue;
    if (file.path.includes("/_generated/")) continue;
    if (file.path.includes("/lib/")) continue;
    const chunks = file.source.split("export const ").slice(1);
    for (const chunk of chunks) {
      const builder = chunk.split("=")[1]?.trim().split("(")[0]?.trim() ?? "";
      for (const [field, allowed] of SCOPED) {
        if (!chunk.includes(`${field}:`)) continue;
        if (!allowed.includes(builder)) {
          violations.push(`${file.path} uses ${field} via ${builder || "an unknown builder"}`);
        }
      }
    }
  }
  return violations;
}
