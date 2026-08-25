import { describe, expect, it } from "vitest";

import { connectedProcessors } from "@/lib/settings/processors";

describe("connectedProcessors", () => {
  it("omits GoHighLevel and Twilio until they are actually in use", () => {
    const list = connectedProcessors({
      crmConnected: false,
      smsEmergenciesEnabled: false,
      hasPushSubscriptions: false,
    });
    expect(list.map((row) => row.name)).toEqual(["Supabase", "Vercel", "Anthropic", "Resend"]);
  });

  it("includes the CRM and SMS processor when those connections are on", () => {
    const list = connectedProcessors({
      crmConnected: true,
      smsEmergenciesEnabled: true,
      hasPushSubscriptions: true,
    });
    expect(list.map((row) => row.name)).toContain("GoHighLevel");
    expect(list.map((row) => row.name)).toContain("Twilio");
    expect(list.map((row) => row.name)).toContain("Web Push");
  });
});
