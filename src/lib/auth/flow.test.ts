import { describe, expect, it } from "vitest";

import {
  cleanBackupCode,
  cleanCode,
  looksLikeEmail,
  resumeSignInStep,
  secondMethods,
  secondStep,
  signInStep,
  signUpStep,
  waitClock,
} from "@/lib/auth/flow";

const f = (...strategies: string[]) => strategies.map((strategy) => ({ strategy }));

describe("signInStep", () => {
  it("starts at the email when there is no attempt", () => {
    expect(signInStep({ status: null })).toEqual({ kind: "email" });
    expect(signInStep({ status: "needs_identifier" })).toEqual({ kind: "email" });
  });

  it("asks for the password when the account has one, and offers what else the account allows", () => {
    expect(signInStep({ status: "needs_first_factor", supportedFirstFactors: f("password", "email_code", "reset_password_email_code") })).toEqual({
      kind: "password",
      canUseCode: true,
      canReset: true,
    });
    expect(signInStep({ status: "needs_first_factor", supportedFirstFactors: f("password") })).toEqual({
      kind: "password",
      canUseCode: false,
      canReset: false,
    });
  });

  it("goes to the emailed code when that is the only way in, or the person asked for it", () => {
    expect(signInStep({ status: "needs_first_factor", supportedFirstFactors: f("email_code") })).toEqual({ kind: "code", canUsePassword: false });
    expect(signInStep({ status: "needs_first_factor", supportedFirstFactors: f("password", "email_code") }, "code")).toEqual({
      kind: "code",
      canUsePassword: true,
    });
  });

  it("does not offer a code to an account that cannot use one, whatever was asked for", () => {
    expect(signInStep({ status: "needs_first_factor", supportedFirstFactors: f("password") }, "code").kind).toBe("password");
  });

  it("says so when the account only signs in with Google, or in a way this page lacks", () => {
    expect(signInStep({ status: "needs_first_factor", supportedFirstFactors: f("oauth_google") })).toEqual({ kind: "blocked", reason: "google-only" });
    expect(signInStep({ status: "needs_first_factor", supportedFirstFactors: f("passkey") })).toEqual({ kind: "blocked", reason: "no-method" });
    expect(signInStep({ status: "needs_first_factor", supportedFirstFactors: [] })).toEqual({ kind: "blocked", reason: "no-method" });
  });

  it("never leaves a two-step account stuck", () => {
    const step = signInStep({ status: "needs_second_factor", supportedSecondFactors: f("backup_code", "totp", "phone_code") });
    expect(step).toEqual({ kind: "second", method: "totp", methods: ["totp", "phone_code", "backup_code"], sentTo: null, newDevice: false });
    expect(signInStep({ status: "needs_second_factor", supportedSecondFactors: f("passkey") })).toEqual({ kind: "blocked", reason: "no-method" });
  });

  it("treats a new device like a second step and says where the code went", () => {
    expect(
      signInStep({ status: "needs_client_trust", supportedSecondFactors: [{ strategy: "email_code", safeIdentifier: "j***@example.com" }] }),
    ).toEqual({ kind: "second", method: "email_code", methods: ["email_code"], sentTo: "j***@example.com", newDevice: true });
  });

  it("covers the remaining statuses", () => {
    expect(signInStep({ status: "needs_new_password" })).toEqual({ kind: "new-password" });
    expect(signInStep({ status: "complete" })).toEqual({ kind: "done" });
    expect(signInStep({ status: "needs_protect_check" })).toEqual({ kind: "blocked", reason: "extra-check" });
  });
});

describe("secondStep", () => {
  it("honours the method the person picked, when the account has it", () => {
    const snapshot = { status: "needs_second_factor", supportedSecondFactors: f("totp", "backup_code") };
    expect(secondStep(snapshot, "backup_code")).toMatchObject({ method: "backup_code" });
    expect(secondStep(snapshot, "phone_code")).toMatchObject({ method: "totp" });
    expect(secondMethods(f("email_link", "totp"))).toEqual(["totp"]);
  });
});

describe("resumeSignInStep", () => {
  it("resumes only the later steps", () => {
    expect(resumeSignInStep({ status: "needs_first_factor", supportedFirstFactors: f("password") })).toEqual({ kind: "email" });
    expect(resumeSignInStep({ status: "complete" })).toEqual({ kind: "email" });
    expect(resumeSignInStep({ status: "needs_second_factor", supportedSecondFactors: f("totp") }).kind).toBe("second");
    expect(resumeSignInStep({ status: "needs_new_password" }).kind).toBe("new-password");
  });
});

describe("signUpStep", () => {
  it("asks only for what Clerk says is missing", () => {
    expect(signUpStep({ status: null })).toEqual({ kind: "email" });
    expect(signUpStep({ status: "missing_requirements", missingFields: ["password"], unverifiedFields: ["email_address"] })).toEqual({
      kind: "details",
      fields: ["password"],
    });
    expect(
      signUpStep({ status: "missing_requirements", missingFields: ["last_name", "legal_accepted", "first_name", "password"], unverifiedFields: [] }),
    ).toEqual({ kind: "details", fields: ["password", "first_name", "last_name", "legal_accepted"] });
  });

  it("moves to the email code once nothing else is missing", () => {
    expect(signUpStep({ status: "missing_requirements", missingFields: [], unverifiedFields: ["email_address"] })).toEqual({ kind: "verify" });
    expect(signUpStep({ status: "complete" })).toEqual({ kind: "done" });
  });

  it("stops with a reason when the instance wants something this page cannot collect", () => {
    expect(signUpStep({ status: "missing_requirements", missingFields: ["phone_number", "password"], unverifiedFields: [] })).toEqual({
      kind: "blocked",
      missing: ["phone_number"],
    });
    expect(signUpStep({ status: "missing_requirements", missingFields: [], unverifiedFields: ["phone_number"] })).toEqual({
      kind: "blocked",
      missing: ["phone_number"],
    });
  });

  it("goes back to the email when that is what is missing", () => {
    expect(signUpStep({ status: "missing_requirements", missingFields: ["email_address"], unverifiedFields: [] })).toEqual({ kind: "email" });
    expect(signUpStep({ status: "abandoned" })).toEqual({ kind: "email" });
  });
});

describe("code helpers", () => {
  it("accepts a pasted code however it was written", () => {
    expect(cleanCode("123 456")).toBe("123456");
    expect(cleanCode("Your code is 424242.")).toBe("424242");
    expect(cleanCode("12345678")).toBe("123456");
    expect(cleanCode("abc")).toBe("");
    expect(cleanBackupCode("AB12-cd34 ")).toBe("ab12cd34");
  });

  it("shows the wait as a clock", () => {
    expect(waitClock(30)).toBe("0:30");
    expect(waitClock(4.2)).toBe("0:05");
    expect(waitClock(75)).toBe("1:15");
    expect(waitClock(-3)).toBe("0:00");
  });

  it("checks an email only loosely", () => {
    expect(looksLikeEmail(" jay@example.com ")).toBe(true);
    expect(looksLikeEmail("jay+clerk_test@example.co.uk")).toBe(true);
    expect(looksLikeEmail("jay@example")).toBe(false);
    expect(looksLikeEmail("jay example.com")).toBe(false);
  });
});
