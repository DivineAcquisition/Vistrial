import { describe, expect, it } from "vitest";

import { explainAuthError, waitWords } from "@/lib/auth/errors";

const api = (code: string, meta: Record<string, unknown> = {}) => ({
  clerkError: true,
  code: "api_response_error",
  message: `raw ${code} message from Clerk`,
  errors: [{ code, message: `raw ${code} message from Clerk`, longMessage: `raw long ${code}`, meta }],
});
const signIn = (field: "email" | "password" | "code" | "form" = "form") => ({ flow: "sign-in" as const, field });
const signUp = (field: "email" | "password" | "code" | "form" = "form") => ({ flow: "sign-up" as const, field });

describe("explainAuthError", () => {
  it("puts each failure next to its own field, in plain words", () => {
    expect(explainAuthError(api("form_code_incorrect"), signIn("code"))).toEqual({
      field: "code",
      message: "That code is not right. Check it and try again.",
    });
    expect(explainAuthError(api("verification_expired"), signIn("code"))).toEqual({
      field: "code",
      message: "That code has expired. Send a new one.",
      action: "new-code",
    });
    expect(explainAuthError(api("verification_failed"), signUp("code"))).toMatchObject({ field: "code", action: "new-code" });
    expect(explainAuthError(api("too_many_requests"), signIn("code"))).toEqual({
      field: "form",
      message: "Too many tries in a short time. Wait a minute, then try again.",
    });
    expect(explainAuthError(api("form_identifier_not_found"), signIn("email"))).toMatchObject({ field: "email", action: "sign-up" });
    expect(explainAuthError(api("form_identifier_exists"), signUp("email"))).toEqual({
      field: "email",
      message: "That email already has an account. Sign in instead.",
      action: "sign-in",
    });
    expect(explainAuthError(api("oauth_access_denied"), signIn())).toEqual({
      field: "form",
      message: "Google sign-in was cancelled. Try again, or use your email.",
    });
    expect(explainAuthError(api("form_password_incorrect"), signIn("password"))).toMatchObject({ field: "password", action: "reset-password" });
  });

  it("uses the field Clerk names when the code alone does not say", () => {
    expect(explainAuthError(api("form_param_format_invalid", { paramName: "email_address" }), signUp("password")).field).toBe("email");
    expect(explainAuthError(api("form_param_format_invalid", { paramName: "identifier" }), signIn("password")).message).toBe(
      "That does not look like an email address.",
    );
    expect(explainAuthError(api("form_param_nil", { paramName: "password" }), signIn("email"))).toEqual({
      field: "password",
      message: "Enter your password.",
    });
    expect(explainAuthError(api("form_param_nil"), signIn("code")).message).toBe("Enter the code.");
  });

  it("says how long a locked account has to wait", () => {
    expect(explainAuthError(api("user_locked", { lockoutExpiresInSeconds: 1800 }), signIn("password")).message).toBe(
      "This account is locked after too many wrong tries. Try again in about 30 minutes.",
    );
    expect(explainAuthError(api("user_locked"), signIn("password")).message).toContain("Try again later");
    expect(waitWords(20)).toBe("about a minute");
    expect(waitWords(3600)).toBe("about an hour");
    expect(waitWords(3 * 3600)).toBe("about 3 hours");
  });

  it("words a leaked password differently when signing in and when choosing one", () => {
    expect(explainAuthError(api("form_password_pwned"), signIn("password")).action).toBe("reset-password");
    expect(explainAuthError(api("form_password_pwned"), signUp("password")).action).toBeUndefined();
  });

  it("reads a bare error, a rate-limit status and nothing at all", () => {
    expect(explainAuthError({ code: "network_error", message: "Failed to fetch" }, signIn()).message).toContain("could not be reached");
    expect(explainAuthError({ status: 429, errors: [] }, signIn()).message).toContain("Too many tries");
    expect(explainAuthError(null, signIn())).toEqual({ field: "form", message: "That did not work. Try again in a moment." });
    expect(explainAuthError(new Error("boom"), signIn()).field).toBe("form");
  });

  it("never shows a Clerk code or Clerk's own sentence, known or not", () => {
    const codes = [
      "form_code_incorrect", "verification_expired", "verification_failed", "too_many_requests", "form_identifier_not_found",
      "form_identifier_exists", "oauth_access_denied", "form_password_incorrect", "form_password_pwned", "user_locked",
      "captcha_invalid", "session_exists", "not_allowed_access", "strategy_for_user_invalid", "external_account_not_found",
      "client_state_invalid", "some_code_clerk_adds_next_year", "",
    ];
    for (const code of codes) {
      for (const context of [signIn("code"), signUp("email")]) {
        const { message } = explainAuthError(api(code, { paramName: "code" }), context);
        expect(message).not.toMatch(/raw|clerk|_/i);
        expect(message.length).toBeGreaterThan(10);
      }
    }
  });
});
