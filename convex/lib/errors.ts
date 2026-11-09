import { ConvexError } from "convex/values";

export const NOT_FOUND = "Not found.";
export const NOT_ALLOWED = "Not allowed.";

/**
 * What the app shows a person when something they asked for cannot be done. Codes let the screen offer the
 * right next step (out_of_credits opens Billing). Production hides the message of a plain Error behind
 * "Server Error"; a ConvexError's data reaches the browser, so every message meant for a person uses this.
 * Never put raw provider responses, tokens or stack text in `message`.
 */
export type UserErrorCode = "invalid" | "not_found" | "not_allowed" | "out_of_credits" | "limit";
export type UserErrorData = { code: UserErrorCode; message: string };

export function userError(message: string, code: UserErrorCode = "invalid") {
  return new ConvexError<UserErrorData>({ code, message });
}

export function notFound(): never {
  throw userError(NOT_FOUND, "not_found");
}

export function notAllowed(): never {
  throw userError(NOT_ALLOWED, "not_allowed");
}
