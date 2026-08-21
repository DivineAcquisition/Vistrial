export function backfillGradePlain(grade: string | null): string {
  if (grade === "usable") {
    return "Usable. There is enough CRM history to compare against after go-live.";
  }
  if (grade === "partial") {
    return "Partial. The before-figure will carry a caveat. Treat it as directional, not exact.";
  }
  if (grade === "unusable") {
    return "Unusable. Enter a self-reported baseline here, or decline that fallback. Do not leave this for later.";
  }
  return "The history pull has not graded yet.";
}
