import { describe, expect, it } from "vitest";

import {
  confirmStep,
  deviceRows,
  deviceWords,
  explainAccountError,
  groupSecret,
  isConfirmCancelled,
  lastActiveWords,
  placeWords,
  startConfirm,
  submitConfirm,
  switchConfirmSecond,
  type ConfirmClient,
  type ConfirmStep,
} from "@/lib/auth/account";

const NOW = Date.UTC(2026, 10, 11, 12);
const ago = (minutes: number) => new Date(NOW - minutes * 60_000);

describe("device wording", () => {
  it("names the browser and device, or what little is known", () => {
    expect(deviceWords({ browserName: "Chrome", deviceType: "Macintosh" })).toBe("Chrome on Macintosh");
    expect(deviceWords({ browserName: "Safari" })).toBe("Safari");
    expect(deviceWords({ isMobile: true })).toBe("A phone or tablet");
    expect(deviceWords(null)).toBe("A browser");
    expect(placeWords({ city: "Dallas", country: "US" })).toBe("Dallas, US");
    expect(placeWords({ ipAddress: "203.0.113.9" })).toBe("203.0.113.9");
    expect(placeWords({})).toBe("Place not known");
  });

  it("says how long ago in words", () => {
    expect(lastActiveWords(ago(0), NOW)).toBe("Active now");
    expect(lastActiveWords(ago(12), NOW)).toBe("Active 12 minutes ago");
    expect(lastActiveWords(ago(60), NOW)).toBe("Active an hour ago");
    expect(lastActiveWords(ago(60 * 5), NOW)).toBe("Active 5 hours ago");
    expect(lastActiveWords(ago(60 * 30), NOW)).toBe("Active yesterday");
    expect(lastActiveWords(ago(60 * 24 * 6), NOW)).toBe("Active 6 days ago");
    expect(lastActiveWords(null, NOW)).toBe("Not used recently");
  });

  it("lists this device first, then the most recent, and leaves out ended ones", () => {
    const rows = deviceRows(
      [
        { id: "old", status: "active", lastActiveAt: ago(60 * 48), latestActivity: { browserName: "Edge", deviceType: "Windows" } },
        { id: "gone", status: "revoked", lastActiveAt: ago(1) },
        { id: "phone", status: "active", lastActiveAt: ago(30), latestActivity: { browserName: "Safari", deviceType: "iPhone", city: "Dallas", country: "US" } },
        { id: "me", status: "active", lastActiveAt: ago(90) },
      ],
      "me",
      NOW,
    );
    expect(rows.map((row) => row.id)).toEqual(["me", "phone", "old"]);
    expect(rows[0]).toMatchObject({ current: true, lastActive: "Active now" });
    expect(rows[1]).toEqual({ id: "phone", current: false, device: "Safari on iPhone", place: "Dallas, US", lastActive: "Active 30 minutes ago" });
  });

  it("groups the set-up key in fours", () => {
    expect(groupSecret("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
    expect(groupSecret("ABC DEF G")).toBe("ABCD EFG");
  });
});

const email = { strategy: "email_code", emailAddressId: "idn_1", safeIdentifier: "j***@example.com" };
const phone = { strategy: "phone_code", phoneNumberId: "idn_p", safeIdentifier: "+1 *** 0142" };

describe("confirmStep", () => {
  it("asks for the password when there is one, and offers an emailed code beside it", () => {
    expect(confirmStep({ status: "needs_first_factor", supportedFirstFactors: [{ strategy: "password" }, email] })).toEqual({ kind: "password", canUseCode: true });
    expect(confirmStep({ status: "needs_first_factor", supportedFirstFactors: [{ strategy: "password" }] })).toEqual({ kind: "password", canUseCode: false });
    expect(confirmStep({ status: "needs_first_factor", supportedFirstFactors: [{ strategy: "password" }, email] }, "code")).toEqual({
      kind: "code",
      sentTo: "j***@example.com",
      emailAddressId: "idn_1",
      canUsePassword: true,
    });
  });

  it("uses the emailed code for an account with no password, such as one made with Google", () => {
    expect(confirmStep({ status: "needs_first_factor", supportedFirstFactors: [email] })).toMatchObject({ kind: "code", canUsePassword: false });
  });

  it("stops plainly when there is no way to check", () => {
    expect(confirmStep({ status: "needs_first_factor", supportedFirstFactors: [{ strategy: "passkey" }] })).toEqual({ kind: "blocked" });
    expect(confirmStep({ status: "needs_second_factor", supportedSecondFactors: [{ strategy: "passkey" }] })).toEqual({ kind: "blocked" });
  });

  it("handles the second step and the finish", () => {
    expect(confirmStep({ status: "needs_second_factor", supportedSecondFactors: [{ strategy: "backup_code" }, phone, { strategy: "totp" }] })).toEqual({
      kind: "second",
      method: "totp",
      methods: ["totp", "phone_code", "backup_code"],
      phone: { id: "idn_p", sentTo: "+1 *** 0142" },
    });
    expect(confirmStep({ status: "complete" })).toEqual({ kind: "done" });
  });
});

const boom = (code: string) => Object.assign(new Error("raw"), { errors: [{ code, message: "raw", meta: {} }] });

function fakeSession(options: { password?: string; second?: boolean } = {}) {
  const calls: string[] = [];
  const first = { status: "needs_first_factor", supportedFirstFactors: [...(options.password ? [{ strategy: "password" }] : []), email], supportedSecondFactors: null };
  const second = { status: "needs_second_factor", supportedFirstFactors: null, supportedSecondFactors: [{ strategy: "totp" }, phone] };
  const done = { status: "complete", supportedFirstFactors: null, supportedSecondFactors: null };
  const session = {
    startVerification: async ({ level }: { level: string }) => (calls.push(`start:${level}`), first),
    prepareFirstFactorVerification: async (params: { strategy: string }) => (calls.push(`prepare1:${params.strategy}`), first),
    attemptFirstFactorVerification: async (params: { strategy: string; password?: string; code?: string }) => {
      calls.push(`attempt1:${params.strategy}`);
      if (params.strategy === "password" && params.password !== options.password) throw boom("form_password_incorrect");
      if (params.strategy === "email_code" && params.code !== "424242") throw boom("form_code_incorrect");
      return options.second ? second : done;
    },
    prepareSecondFactorVerification: async (params: { strategy: string }) => (calls.push(`prepare2:${params.strategy}`), second),
    attemptSecondFactorVerification: async (params: { strategy: string; code: string }) => {
      calls.push(`attempt2:${params.strategy}`);
      if (params.code !== "424242") throw boom("form_code_incorrect");
      return done;
    },
  };
  return { session: session as unknown as ConfirmClient, calls };
}

describe("confirm it is you", () => {
  it("password: wrong, then right", async () => {
    const { session, calls } = fakeSession({ password: "pw" });
    const start = await startConfirm(session, undefined);
    expect(start).toEqual({ step: { kind: "password", canUseCode: true }, problem: null });
    const wrong = await submitConfirm(session, start.step, "nope");
    expect(wrong).toMatchObject({ step: start.step, problem: { field: "password", message: "That password is not right." } });
    expect((await submitConfirm(session, start.step, "pw")).step).toEqual({ kind: "done" });
    expect(calls).toEqual(["start:first_factor", "attempt1:password", "attempt1:password"]);
  });

  it("no password: the code is emailed without asking", async () => {
    const { session, calls } = fakeSession();
    const start = await startConfirm(session, "first_factor");
    expect(start.step.kind).toBe("code");
    expect(calls).toEqual(["start:first_factor", "prepare1:email_code"]);
    expect((await submitConfirm(session, start.step, "111111")).problem).toMatchObject({ field: "code" });
    expect((await submitConfirm(session, start.step, "424242")).step).toEqual({ kind: "done" });
  });

  it("second step: switching method does not ask for the password again", async () => {
    const { session, calls } = fakeSession({ password: "pw", second: true });
    const start = await startConfirm(session, "multi_factor");
    const second = await submitConfirm(session, start.step, "pw");
    expect(second.step).toMatchObject({ kind: "second", method: "totp" });
    const text = await switchConfirmSecond(session, second.step as Extract<ConfirmStep, { kind: "second" }>, "phone_code");
    expect(text.step).toMatchObject({ kind: "second", method: "phone_code" });
    expect(calls.filter((call) => call.startsWith("start"))).toHaveLength(1);
    expect(calls.at(-1)).toBe("prepare2:phone_code");
    expect((await submitConfirm(session, text.step, "424242")).step).toEqual({ kind: "done" });
  });

  it("a check that cannot start says so instead of throwing", async () => {
    const session = { startVerification: async () => Promise.reject(boom("too_many_requests")) } as unknown as ConfirmClient;
    expect(await startConfirm(session, undefined)).toMatchObject({ step: { kind: "blocked" }, problem: { field: "form" } });
  });
});

describe("account errors", () => {
  it("names the current password when that is what was wrong", () => {
    expect(explainAccountError(boom("form_password_incorrect"), "password", true)).toEqual({ field: "form", message: "The current password is not right." });
    expect(explainAccountError(boom("form_password_pwned"), "password").message).toContain("Choose a different one");
    expect(explainAccountError(boom("form_code_incorrect"), "code").field).toBe("code");
    expect(explainAccountError(boom("something_new"), "form").message).not.toMatch(/raw|_/);
  });

  it("treats closing the check as nothing to report", () => {
    expect(isConfirmCancelled({ code: "reverification_cancelled" })).toBe(true);
    expect(isConfirmCancelled(boom("form_code_incorrect"))).toBe(false);
  });
});
