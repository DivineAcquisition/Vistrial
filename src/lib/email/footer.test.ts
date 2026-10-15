import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  COUNSEL_FLAGS,
  EMAIL_IDENTITY,
  renderFooter,
  sendingStream,
  staffRecipientAllowed,
  lifecycleFromSeparated,
  unresolvedCopy,
  type EmailCategory,
} from "@/lib/email/footer";

const filled = {
  recipientEmail: "owner@example.com",
  workspaceName: "Northwind Legal",
  role: "Owner",
  inviterName: "Ada",
  referenceId: "req-1",
  siteName: "vistrial.io",
  date: "October 22, 2026",
  preferencesUrl: "https://app.vistrial.io/app/settings/notifications",
  unsubscribeUrl: "https://app.vistrial.io/email/unsubscribe?token=abc",
};

describe("email footers", () => {
  it("renders every sendable category without brackets, braces, or an em dash", () => {
    const categories: EmailCategory[] = ["A", "A2", "B", "C", "D", "E", "G", "H", "I"];
    for (const category of categories) {
      const result = renderFooter({ category, vars: filled });
      expect(result.ok, category).toBe(true);
      if (!result.ok) continue;
      expect(result.footer.text).not.toMatch(/\{[a-z_]+\}/);
      expect(result.footer.text).not.toMatch(/\[[A-Z ]+\]/);
      expect(result.footer.text).not.toContain("\u2014");
      if (category !== "I") expect(result.footer.html).toContain(EMAIL_IDENTITY.legalEntity);
      else expect(result.footer.text).toContain("Internal Vistrial message.");
      expect(result.footer.text.length).toBeGreaterThan(40);
    }
  });

  it("blocks message copy that still has a draft placeholder", () => {
    expect(unresolvedCopy("We reply within 2 business days.")).toBe(false);
    expect(unresolvedCopy("[CONFIRM: we reply within 2 business days.]")).toBe(true);
  });

  it("blocks a send when a required fact is missing", () => {
    const result = renderFooter({ category: "B", vars: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toContain("workspaceName");
  });

  it("does not send category F until counsel supplies the advertisement line", () => {
    const result = renderFooter({ category: "F", vars: filled });
    expect(result.ok).toBe(false);
    expect(COUNSEL_FLAGS[0]).toMatch(/Footer F/);
  });

  it("offers unsubscribe only on lifecycle mail", () => {
    const lifecycle = renderFooter({ category: "E", vars: filled });
    const account = renderFooter({ category: "A", vars: filled });
    expect(lifecycle.ok && lifecycle.footer.text).toMatch(/unsubscribe/i);
    expect(account.ok && account.footer.text).not.toMatch(/unsubscribe/i);
    expect(sendingStream("E")).toBe("lifecycle");
    expect(sendingStream("A")).toBe("transactional");
  });

  it("keeps internal mail off customer addresses", () => {
    expect(staffRecipientAllowed("ada@vistrial.io", ["Ada@vistrial.io"])).toBe(true);
    expect(staffRecipientAllowed("owner@customer.test", ["ada@vistrial.io"])).toBe(false);
  });

  it("requires a separate sending host for lifecycle mail", () => {
    expect(
      lifecycleFromSeparated("Vistrial <notifications@vistrial.io>", "Vistrial <updates@mail.vistrial.io>")
    ).toBe(true);
    expect(
      lifecycleFromSeparated("Vistrial <notifications@vistrial.io>", "Vistrial <news@vistrial.io>")
    ).toBe(false);
    expect(lifecycleFromSeparated("Vistrial <notifications@vistrial.io>", "")).toBe(false);
  });

  it("does not put a Vistrial footer on mail a customer sends through their CRM", () => {
    const dispatch = readFileSync(path.join(__dirname, "../ghl/dispatch.ts"), "utf8");
    expect(dispatch).not.toContain("@/lib/email");
  });
});
