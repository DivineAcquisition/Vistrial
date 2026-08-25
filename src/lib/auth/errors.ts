export type LoginError = "credentials" | "unconfirmed" | "no_membership" | "generic" | "locked";

export function classifyAuthError(message: string, code?: string): Exclude<LoginError, "no_membership"> {
  const haystack = `${code ?? ""} ${message}`.toLowerCase();
  if (haystack.includes("email_not_confirmed") || haystack.includes("email not confirmed")) {
    return "unconfirmed";
  }
  if (
    haystack.includes("invalid_credentials") ||
    haystack.includes("invalid login credentials") ||
    haystack.includes("invalid email or password")
  ) {
    return "credentials";
  }
  return "generic";
}

export const LOGIN_ERROR_COPY: Record<LoginError, string> = {
  credentials: "That email or password is not right.",
  unconfirmed: "Confirm your email before signing in. Check that address for the confirmation message.",
  no_membership: "This account is not a member of any workspace. You need an invite.",
  generic: "Sign-in failed. Try again, or use a magic link.",
  locked: "Too many sign-in attempts. Wait 15 minutes and try again.",
};
