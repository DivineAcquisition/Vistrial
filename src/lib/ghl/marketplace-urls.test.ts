import { afterEach, describe, expect, it, vi } from "vitest";

import { PRODUCTION_APP_ORIGIN } from "@/lib/constants";

/**
 * These two strings are typed by hand into the marketplace app listing. If they
 * change here and nobody re-pastes them there, OAuth and inbound webhooks break
 * with no error on our side, so they are pinned rather than derived in a test.
 */
async function loadEnv() {
  vi.resetModules();
  return import("@/lib/ghl/env");
}

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("marketplace URLs", () => {
  it("uses the production paths the listing is configured with", async () => {
    process.env.NEXT_PUBLIC_APP_URL = PRODUCTION_APP_ORIGIN;
    const env = await loadEnv();
    expect(env.ghlOAuthRedirectUri()).toBe(
      "https://app.vistrial.io/api/leadconnector/oauth/callback"
    );
    expect(env.ghlWebhookUrl()).toBe("https://app.vistrial.io/api/leadconnector/webhooks");
  });

  it("keeps a CRM brand acronym out of both paths", async () => {
    process.env.NEXT_PUBLIC_APP_URL = PRODUCTION_APP_ORIGIN;
    const env = await loadEnv();
    for (const url of [env.ghlOAuthRedirectUri(), env.ghlWebhookUrl()]) {
      expect(url).not.toMatch(/\/ghl\b/);
      expect(url).not.toMatch(/highlevel/i);
    }
  });

  it("follows the deployment origin so staging never registers production URLs", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://staging.vistrial.io";
    const env = await loadEnv();
    expect(env.ghlWebhookUrl()).toBe("https://staging.vistrial.io/api/leadconnector/webhooks");
  });

  it("treats connect as unavailable until both marketplace keys are present", async () => {
    process.env.GHL_CLIENT_ID = "";
    process.env.GHL_CLIENT_SECRET = "";
    let env = await loadEnv();
    expect(env.ghlOAuthConfigured()).toBe(false);

    process.env.GHL_CLIENT_ID = "id-only";
    env = await loadEnv();
    expect(env.ghlOAuthConfigured()).toBe(false);

    process.env.GHL_CLIENT_SECRET = "secret";
    env = await loadEnv();
    expect(env.ghlOAuthConfigured()).toBe(true);
  });
});
