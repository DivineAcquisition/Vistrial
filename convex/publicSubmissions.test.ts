/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { NOT_FOUND } from "./lib/errors";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const post = {
  kind: "private_access",
  name: "Jordan Lee",
  email: "jordan@example.com",
  business: "Glow Med Spa",
  summary: "Leads go quiet",
  fields: [
    { label: "Main problem", value: "Leads go quiet" },
    { label: "Website", value: "" },
  ],
  pagePath: "/request",
};

function staff(subject: string) {
  return {
    subject,
    email: `${subject}@example.com`,
    issuer: "https://clerk.vistrial.test",
    tokenIdentifier: `https://clerk.vistrial.test|${subject}`,
    secondFactor: true,
  };
}

describe("public form submissions", () => {
  beforeEach(() => {
    vi.stubEnv("PUBLIC_FORM_SECRET", "s3cret-value");
    vi.stubEnv("RESEND_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses a caller without the server secret", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.publicSubmissions.submit, { ...post, secret: "wrong-value!" })).rejects.toThrow(NOT_FOUND);
    await expect(t.mutation(api.publicSubmissions.submit, { ...post, secret: "" })).rejects.toThrow(NOT_FOUND);
    vi.stubEnv("PUBLIC_FORM_SECRET", "");
    await expect(t.mutation(api.publicSubmissions.submit, { ...post, secret: "" })).rejects.toThrow(NOT_FOUND);
  });

  it("saves the post, drops blank answers, and records that email was skipped without a key", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { id } = await t.mutation(api.publicSubmissions.submit, { ...post, secret: "s3cret-value" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const row = await t.query(internal.publicSubmissions.getForEmail, { id });
    expect(row?.fields).toEqual([{ label: "Main problem", value: "Leads go quiet" }]);
    expect(row?.status).toBe("new");
    expect(row?.emailStatus).toBe("skipped");
    vi.useRealTimers();
  });

  it("lists submissions to staff only", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.publicSubmissions.submit, { ...post, secret: "s3cret-value" });
    const outsider = t.withIdentity(staff("not-staff"));
    await expect(outsider.query(api.publicSubmissions.list, {})).rejects.toThrow(NOT_FOUND);
    await t.mutation(internal.staffAdmin.enroll, { userId: "admin-1", role: "platform_admin" });
    const admin = t.withIdentity(staff("admin-1"));
    const rows = await admin.query(api.publicSubmissions.list, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("jordan@example.com");
  });
});
