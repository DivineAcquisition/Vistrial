import { describe, expect, it } from "vitest";

import { TRUST_FALLBACK } from "@/lib/trust/model";
import { privacyPolicyText } from "@/lib/trust/privacy-policy";
import { requestAgeDays, requestNeedsAttention } from "@/lib/trust/request-age";

const text = privacyPolicyText(TRUST_FALLBACK);

describe("privacy policy stays inside verified behavior", () => {
  it("names the operator and the Lanham address", () => {
    expect(text).toContain("Divine Agency LLC");
    expect(text).toContain("7404 Executive Place, Lanham, MD 20706");
    expect(text).toContain("Effective: November 13, 2026");
    expect(text).toContain("Last updated: November 13, 2026");
  });

  it("says plainly where GPT, Gemini and image work goes, and what may be kept", () => {
    // GPT text runs on Microsoft Azure, Gemini on Google Cloud, both reached through OpenRouter.
    expect(text).toContain("Microsoft Azure for GPT models, Google Cloud for Gemini models");
    expect(text).toContain("zero data retention list");
    // The two exceptions are stated, not hidden: Google's abuse retention, and OpenAI for images.
    expect(text).toContain("Google may keep the requests and answers of Gemini work for a time, only to detect and prevent abuse");
    expect(text).toContain("OpenAI is not on the zero data retention list for image requests");
    // Image making through Google is covered, which the policy did not say before.
    expect(text).toContain("Ad images are made by Google's image models");
    // A choice is per person and remembered; there is no organization default to describe.
    expect(text).toContain("Their choice is remembered");
    expect(text).not.toMatch(/default for your organization/i);
    // Nothing is promised about never keeping, or about where processing happens.
    expect(text).not.toMatch(/never (kept|stored|retained)/i);
  });

  it("drops claims the product does not enforce", () => {
    expect(text).not.toContain("\u2014");
    expect(text).not.toMatch(/vercel analytics/i);
    expect(text).not.toMatch(/last four/i);
    expect(text).not.toMatch(/seven years/i);
    expect(text).not.toMatch(/two years/i);
    // Retention: only what the product does today. No invented deletion schedules.
    expect(text).toContain("does not currently delete workspace information on an automatic schedule");
    expect(text).not.toMatch(/after 12 months|after 14 days|365 days|after 90 days/i);
    expect(text).not.toMatch(/train/i);
    expect(text).not.toMatch(/at rest/i);
    expect(text).toContain("Global Privacy Control");
    expect(text).toContain("Meta pixel");
    expect(text).not.toContain("[COUNSEL:");
    // The policy names the providers the code actually calls, and no retired ones.
    for (const name of ["Vercel", "Convex", "Clerk", "Anthropic", "Google", "OpenRouter", "Microsoft", "OpenAI", "Cloudflare", "Resend", "Autumn", "Stripe"]) expect(text).toContain(name);
    expect(text).not.toMatch(/supabase|compass|quiet hours|embeddings/i);
    expect(text).not.toMatch(/GoHighLevel is the CRM/i);
  });

  it("describes the current product and its research rules", () => {
    expect(text).toContain("Strategist");
    expect(text).toContain("official access only");
    expect(text).toContain("does not store copies of ad images or video files");
    expect(text).toContain("We do not currently use Google Analytics or the Meta pixel");
  });

  it("says what is read from Meta, how it is deleted, and keeps outcome learning de-identified", () => {
    expect(text).toContain("Connected Meta ad accounts");
    expect(text).toContain("Vistrial never creates, edits, pauses or pays for ads");
    expect(text).toContain("Disconnecting the account in Connections deletes the token and every saved read straight away");
    expect(text).toContain("Only Vistrial uses it; it is never shown to other customers");
    expect(text).toContain("Uploaded results files are deleted as soon as they are read");
  });

  it("says how credits are paid for and that card numbers stay with Stripe", () => {
    expect(text).not.toContain("does not take payments");
    expect(text).toContain("Payment is taken by Stripe on its own checkout page");
    expect(text).toContain("Vistrial does not see or store a full card number");
  });

  it("says what is read from calendars and kept from call transcripts, and how each is deleted", () => {
    expect(text).toContain("J. Connected calendars");
    expect(text).toContain("Vistrial keeps counts only");
    expect(text).toContain("It does not keep event titles, descriptions, locations, or the names or email addresses of guests and invitees");
    expect(text).toContain("adheres to the Google API Services User Data Policy, including the Limited Use requirements");
    expect(text).toContain("K. Call transcripts");
    expect(text).toContain("Vistrial takes text only and does not accept audio or video");
    expect(text).toContain("A connected calendar's access and saved counts are deleted as soon as the calendar is disconnected");
    expect(text).toContain("A call transcript you add is kept until someone in the workspace deletes it");
    // Not built yet, so not promised.
    expect(text).not.toMatch(/Google Ads account|Search Console|Fathom|Fireflies/);
  });

  it("shows Not in effect while the policy is switched off", () => {
    expect(privacyPolicyText({ ...TRUST_FALLBACK, privacyLive: false })).toContain("Effective: Not in effect");
  });

  it("adds a switch line only when that switch is on", () => {
    const on = privacyPolicyText({
      ...TRUST_FALLBACK,
      privacyLive: true,
      mailingAddress: "Registered agent, Maryland",
      switches: { ...TRUST_FALLBACK.switches, aiNoTraining: true, encryptionAtRest: true },
    });
    expect(on).toMatch(/not used to train/i);
    expect(on).toMatch(/encrypted at rest/i);
    expect(on).toContain("Effective: November 13, 2026");
    expect(on).toContain("Registered agent, Maryland");
  });
});

describe("data request age", () => {
  const now = new Date("2026-10-15T12:00:00Z");

  it("flags an open request once it is 30 days old", () => {
    expect(requestAgeDays("2026-09-15T12:00:00Z", now)).toBe(30);
    expect(requestNeedsAttention("received", "2026-09-15T12:00:00Z", now)).toBe(true);
    expect(requestNeedsAttention("received", "2026-10-01T12:00:00Z", now)).toBe(false);
    expect(requestNeedsAttention("completed", "2026-08-01T12:00:00Z", now)).toBe(false);
  });
});
