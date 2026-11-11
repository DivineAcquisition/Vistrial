import { describe, expect, it } from "vitest";

import {
  chooseSecondMethod,
  resendSignInCode,
  startPasswordReset,
  startSignIn,
  startSignUp,
  submitNewPassword,
  submitPassword,
  submitSignUpDetails,
  switchToCode,
  switchToPassword,
  verifySignInCode,
  verifySignUpCode,
  type SignInClient,
  type SignUpClient,
} from "@/lib/auth/actions";
import type { SignUpStep } from "@/lib/auth/flow";

/**
 * A stand-in for Clerk that behaves the way its sign-in resource does: each call changes `status`
 * and the supported factors, or answers with an error carrying one of Clerk's codes. The real
 * service was not reachable from the tests, so this is what the step logic is checked against.
 */
const fail = (code: string) => ({ error: { code: "api_response_error", errors: [{ code, message: "raw", meta: {} }] } });
const ok = { error: null };
const CODE = "424242";

type Account = { password?: string; emailCode?: boolean; second?: string[]; newDevice?: boolean };

function fakeSignIn(accounts: Record<string, Account>, options: { sendFails?: string } = {}) {
  const calls: string[] = [];
  let account: Account | null = null;
  const state = {
    status: null as string | null,
    supportedFirstFactors: [] as { strategy: string }[],
    supportedSecondFactors: [] as { strategy: string; safeIdentifier?: string }[],
  };
  const afterFirst = () => {
    if (!account) return;
    if (account.second?.length) {
      state.status = "needs_second_factor";
      state.supportedSecondFactors = account.second.map((strategy) => ({ strategy, safeIdentifier: strategy === "phone_code" ? "+1 *** 0100" : undefined }));
    } else if (account.newDevice) {
      state.status = "needs_client_trust";
      state.supportedSecondFactors = [{ strategy: "email_code", safeIdentifier: "j***@example.com" }];
    } else state.status = "complete";
  };
  const send = (name: string) => async () => {
    calls.push(name);
    return options.sendFails ? fail(options.sendFails) : ok;
  };
  const verify = (name: string, then: () => void) => async ({ code }: { code: string }) => {
    calls.push(name);
    if (code !== CODE) return fail(code === "000000" ? "verification_expired" : "form_code_incorrect");
    then();
    return ok;
  };
  const client = {
    get status() {
      return state.status;
    },
    get supportedFirstFactors() {
      return state.supportedFirstFactors;
    },
    get supportedSecondFactors() {
      return state.supportedSecondFactors;
    },
    create: async ({ identifier }: { identifier?: string }) => {
      calls.push(`create:${identifier}`);
      account = accounts[identifier ?? ""] ?? null;
      if (!account) return fail("form_identifier_not_found");
      state.status = "needs_first_factor";
      state.supportedFirstFactors = [
        ...(account.password ? [{ strategy: "password" }, { strategy: "reset_password_email_code" }] : []),
        ...(account.emailCode ? [{ strategy: "email_code" }] : []),
      ];
      return ok;
    },
    password: async ({ password }: { password: string }) => {
      calls.push("password");
      if (password !== account?.password) return fail("form_password_incorrect");
      afterFirst();
      return ok;
    },
    emailCode: { sendCode: send("emailCode.send"), verifyCode: verify("emailCode.verify", afterFirst) },
    resetPasswordEmailCode: {
      sendCode: send("reset.send"),
      verifyCode: verify("reset.verify", () => {
        state.status = "needs_new_password";
      }),
      submitPassword: async ({ password, signOutOfOtherSessions }: { password: string; signOutOfOtherSessions?: boolean }) => {
        calls.push(`reset.submit:${signOutOfOtherSessions}`);
        if (password === "password") return fail("form_password_pwned");
        afterFirst();
        return ok;
      },
    },
    mfa: {
      sendPhoneCode: send("mfa.sendPhone"),
      sendEmailCode: send("mfa.sendEmail"),
      verifyPhoneCode: verify("mfa.verifyPhone", () => (state.status = "complete")),
      verifyEmailCode: verify("mfa.verifyEmail", () => (state.status = "complete")),
      verifyTOTP: verify("mfa.verifyTOTP", () => (state.status = "complete")),
      verifyBackupCode: verify("mfa.verifyBackup", () => (state.status = "complete")),
    },
  };
  return { signIn: client as unknown as SignInClient, calls };
}

const ME = "jay@example.com";

describe("sign-in actions", () => {
  it("email and password, straight in", async () => {
    const { signIn, calls } = fakeSignIn({ [ME]: { password: "correct horse" } });
    const first = await startSignIn(signIn, `  ${ME} `);
    expect(first).toEqual({ step: { kind: "password", canUseCode: false, canReset: true }, problem: null });
    const wrong = await submitPassword(signIn, first.step, "nope");
    expect(wrong.step).toEqual(first.step);
    expect(wrong.problem).toMatchObject({ field: "password", message: "That password is not right." });
    expect(await submitPassword(signIn, first.step, "correct horse")).toEqual({ step: { kind: "done" }, problem: null });
    expect(calls).toEqual([`create:${ME}`, "password", "password"]);
  });

  it("an account with no password gets its code sent without being asked", async () => {
    const { signIn, calls } = fakeSignIn({ [ME]: { emailCode: true } });
    const first = await startSignIn(signIn, ME);
    expect(first).toEqual({ step: { kind: "code", canUsePassword: false }, problem: null });
    expect(calls).toEqual([`create:${ME}`, "emailCode.send"]);
    const wrong = await verifySignInCode(signIn, first.step, "111111");
    expect(wrong).toMatchObject({ step: first.step, problem: { field: "code", message: "That code is not right. Check it and try again." } });
    const expired = await verifySignInCode(signIn, first.step, "000000");
    expect(expired.problem).toMatchObject({ field: "code", action: "new-code" });
    expect(await resendSignInCode(signIn, first.step)).toBeNull();
    expect((await verifySignInCode(signIn, first.step, CODE)).step).toEqual({ kind: "done" });
  });

  it("an unknown email stays on the email step and points to sign-up", async () => {
    const { signIn, calls } = fakeSignIn({});
    expect(await startSignIn(signIn, "nobody@example.com")).toMatchObject({ step: { kind: "email" }, problem: { field: "email", action: "sign-up" } });
    expect(calls).toHaveLength(1);
  });

  it("lets the person swap between password and emailed code when the account has both", async () => {
    const { signIn, calls } = fakeSignIn({ [ME]: { password: "pw", emailCode: true } });
    const first = await startSignIn(signIn, ME);
    expect(first.step).toEqual({ kind: "password", canUseCode: true, canReset: true });
    expect(calls).not.toContain("emailCode.send");
    const code = await switchToCode(signIn);
    expect(code.step).toEqual({ kind: "code", canUsePassword: true });
    expect(calls).toContain("emailCode.send");
    expect(switchToPassword(signIn).step.kind).toBe("password");
  });

  it("shows the code step with the reason when the code could not be sent", async () => {
    const { signIn } = fakeSignIn({ [ME]: { emailCode: true } }, { sendFails: "too_many_requests" });
    const first = await startSignIn(signIn, ME);
    expect(first.step.kind).toBe("code");
    expect(first.problem?.message).toContain("Too many tries");
    expect(await resendSignInCode(signIn, first.step)).toMatchObject({ field: "form" });
  });

  it("forgot password: code, new password, signed out elsewhere, then in", async () => {
    const { signIn, calls } = fakeSignIn({ [ME]: { password: "old" } });
    const first = await startSignIn(signIn, ME);
    const reset = await startPasswordReset(signIn, first.step);
    expect(reset).toEqual({ step: { kind: "reset-code" }, problem: null });
    const verified = await verifySignInCode(signIn, reset.step, CODE);
    expect(verified).toEqual({ step: { kind: "new-password" }, problem: null });
    const leaked = await submitNewPassword(signIn, "password");
    expect(leaked).toMatchObject({ step: { kind: "new-password" }, problem: { field: "password" } });
    expect((await submitNewPassword(signIn, "a much better one")).step).toEqual({ kind: "done" });
    expect(calls).toEqual([`create:${ME}`, "reset.send", "reset.verify", "reset.submit:true", "reset.submit:true"]);
  });

  it("two-step account: authenticator first, text message and backup code on request", async () => {
    const { signIn, calls } = fakeSignIn({ [ME]: { password: "pw", second: ["phone_code", "backup_code", "totp"] } });
    const first = await startSignIn(signIn, ME);
    const second = await submitPassword(signIn, first.step, "pw");
    expect(second.step).toMatchObject({ kind: "second", method: "totp", methods: ["totp", "phone_code", "backup_code"] });
    expect(calls).not.toContain("mfa.sendPhone");

    const text = await chooseSecondMethod(signIn, "phone_code");
    expect(text.step).toMatchObject({ kind: "second", method: "phone_code", sentTo: "+1 *** 0100" });
    expect(calls.filter((call) => call === "mfa.sendPhone")).toHaveLength(1);
    expect((await verifySignInCode(signIn, text.step, "123456")).problem?.field).toBe("code");

    const backup = await chooseSecondMethod(signIn, "backup_code");
    expect((await verifySignInCode(signIn, backup.step, CODE)).step).toEqual({ kind: "done" });
    expect(calls.at(-1)).toBe("mfa.verifyBackup");
  });

  it("a new device gets an emailed code after the password, sent on arrival", async () => {
    const { signIn, calls } = fakeSignIn({ [ME]: { password: "pw", newDevice: true } });
    const first = await startSignIn(signIn, ME);
    const trust = await submitPassword(signIn, first.step, "pw");
    expect(trust.step).toEqual({ kind: "second", method: "email_code", methods: ["email_code"], sentTo: "j***@example.com", newDevice: true });
    expect(calls.at(-1)).toBe("mfa.sendEmail");
    expect((await verifySignInCode(signIn, trust.step, CODE)).step).toEqual({ kind: "done" });
  });

  it("a reset on a two-step account still asks for the second step", async () => {
    const { signIn } = fakeSignIn({ [ME]: { password: "old", second: ["totp"] } });
    const first = await startSignIn(signIn, ME);
    const reset = await startPasswordReset(signIn, first.step);
    await verifySignInCode(signIn, reset.step, CODE);
    expect((await submitNewPassword(signIn, "brand new words")).step).toMatchObject({ kind: "second", method: "totp" });
  });
});

/* ------------------------------------------------------------------ sign-up */

function fakeSignUp(instance: { required: string[]; taken?: string[] }) {
  const calls: string[] = [];
  const state = { status: null as string | null, missingFields: [] as string[], unverifiedFields: [] as string[] };
  const settle = (given: Record<string, unknown>) => {
    state.missingFields = instance.required.filter((field) => {
      const key = field.replace(/_(\w)/g, (_, letter: string) => letter.toUpperCase());
      return given[key] === undefined || given[key] === "" || given[key] === false;
    });
    state.unverifiedFields = ["email_address"];
    state.status = "missing_requirements";
  };
  let given: Record<string, unknown> = {};
  const client = {
    get status() {
      return state.status;
    },
    get missingFields() {
      return state.missingFields;
    },
    get unverifiedFields() {
      return state.unverifiedFields;
    },
    create: async (params: { emailAddress?: string }) => {
      calls.push(`create:${params.emailAddress}`);
      if (instance.taken?.includes(params.emailAddress ?? "")) return fail("form_identifier_exists");
      given = { ...params };
      settle(given);
      return ok;
    },
    password: async (params: { emailAddress?: string; password: string }) => {
      calls.push(`password:${params.emailAddress}`);
      if (params.password === "password") return fail("form_password_pwned");
      given = { ...params };
      settle(given);
      return ok;
    },
    update: async (params: Record<string, unknown>) => {
      calls.push(`update:${Object.keys(params).sort().join(",")}`);
      given = { ...given, ...params };
      settle(given);
      return ok;
    },
    verifications: {
      sendEmailCode: async () => {
        calls.push("sendEmailCode");
        return ok;
      },
      verifyEmailCode: async ({ code }: { code: string }) => {
        calls.push("verifyEmailCode");
        if (code !== CODE) return fail("form_code_incorrect");
        state.unverifiedFields = [];
        state.status = "complete";
        return ok;
      },
    },
  };
  return { signUp: client as unknown as SignUpClient, calls };
}

const details = (step: SignUpStep) => step as Extract<SignUpStep, { kind: "details" }>;

describe("sign-up actions", () => {
  it("email and password instance: password, then the emailed code, then done", async () => {
    const { signUp, calls } = fakeSignUp({ required: ["password"] });
    const first = await startSignUp(signUp, ` ${ME} `);
    expect(first).toEqual({ step: { kind: "details", fields: ["password"] }, problem: null });
    expect(calls).toEqual([`create:${ME}`]);

    const leaked = await submitSignUpDetails(signUp, ME, details(first.step), { password: "password" });
    expect(leaked).toMatchObject({ step: first.step, problem: { field: "password" } });

    const made = await submitSignUpDetails(signUp, ME, details(first.step), { password: "long enough words" });
    expect(made).toEqual({ step: { kind: "verify" }, problem: null });
    expect(calls.slice(-2)).toEqual([`password:${ME}`, "sendEmailCode"]);

    expect(await verifySignUpCode(signUp, "111111")).toMatchObject({ step: { kind: "verify" }, problem: { field: "code" } });
    expect(await verifySignUpCode(signUp, CODE)).toEqual({ step: { kind: "done" }, problem: null });
  });

  it("code-only instance: straight from the email to the code", async () => {
    const { signUp, calls } = fakeSignUp({ required: [] });
    expect(await startSignUp(signUp, ME)).toEqual({ step: { kind: "verify" }, problem: null });
    expect(calls).toEqual([`create:${ME}`, "sendEmailCode"]);
  });

  it("an email that already has an account points to sign-in", async () => {
    const { signUp } = fakeSignUp({ required: ["password"], taken: [ME] });
    expect(await startSignUp(signUp, ME)).toMatchObject({ step: { kind: "email" }, problem: { field: "email", action: "sign-in" } });
  });

  it("sends only the answers the instance asked for", async () => {
    const { signUp, calls } = fakeSignUp({ required: ["first_name", "last_name", "legal_accepted"] });
    const first = await startSignUp(signUp, ME);
    expect(first.step).toEqual({ kind: "details", fields: ["first_name", "last_name", "legal_accepted"] });
    const next = await submitSignUpDetails(signUp, ME, details(first.step), { firstName: " Jay ", lastName: "Brooks", legalAccepted: true, password: "ignored" });
    expect(next.step).toEqual({ kind: "verify" });
    expect(calls).toContain("update:firstName,lastName,legalAccepted");
    expect(calls.some((call) => call.startsWith("password:"))).toBe(false);
  });

  it("adds a password to a sign-up Google started without sending an email it never asked for", async () => {
    const { signUp, calls } = fakeSignUp({ required: ["password"] });
    await startSignUp(signUp, ME);
    const step: SignUpStep = { kind: "details", fields: ["password"] };
    expect((await submitSignUpDetails(signUp, null, step, { password: "whatever words" })).step).toEqual({ kind: "verify" });
    expect(calls).toContain("password:undefined");
  });
});
