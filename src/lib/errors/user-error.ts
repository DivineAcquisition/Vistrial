/**
 * Reading errors from Convex in the browser. A message meant for a person arrives as ConvexError data
 * ({ code, message }); anything else is an unexpected failure, which production shows only as
 * "Server Error", so the screen uses its own fallback words instead.
 */
export type UserErrorCode = "invalid" | "not_found" | "not_allowed" | "out_of_credits" | "limit";
export type ShownError = { code: UserErrorCode | "unexpected"; message: string };

const CODES = new Set<string>(["invalid", "not_found", "not_allowed", "out_of_credits", "limit"]);

/** The person-facing error carried by a ConvexError, or null. */
export function readUserError(problem: unknown): { code: UserErrorCode; message: string } | null {
  const data = (problem as { data?: unknown } | null)?.data;
  if (!data || typeof data !== "object") return null;
  const { code, message } = data as { code?: unknown; message?: unknown };
  if (typeof message !== "string" || !message) return null;
  return { code: typeof code === "string" && CODES.has(code) ? (code as UserErrorCode) : "invalid", message };
}

/** The words to show for any failure, with a fallback for unexpected ones. Never shows a stack or request id. */
export function describeError(problem: unknown, fallback: string): ShownError {
  const known = readUserError(problem);
  if (known) return known;
  // Local development still sends a plain Error's text; production does not.
  if (problem instanceof Error) {
    const line = problem.message.replace(/^[\s\S]*?Uncaught Error: /, "").split("\n")[0].trim();
    if (line && !line.startsWith("[CONVEX") && !/Server Error/.test(line)) return { code: "unexpected", message: line };
  }
  return { code: "unexpected", message: fallback };
}
