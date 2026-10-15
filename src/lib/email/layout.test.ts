import { describe, expect, it } from "vitest";

import { EMAIL_LOGO_PATH, emailLogoUrl, transactionalEmailHtml } from "@/lib/email/layout";

const logoUrl = "https://app.vistrial.io/brand/vistrial-icon.png";

describe("transactionalEmailHtml", () => {
  it("points the icon at the public site, never localhost", () => {
    expect(emailLogoUrl()).toBe("https://app.vistrial.io/brand/vistrial-icon.png");
    expect(emailLogoUrl()).not.toContain("localhost");
    expect(EMAIL_LOGO_PATH).toBe("/brand/vistrial-icon.png");
  });

  it("puts the ink wordmark at the top left of the card, ahead of the heading", () => {
    const html = transactionalEmailHtml({
      heading: "Welcome to Vistrial",
      lines: ["Your workspace is ready."],
      cta: { label: "Set up my account", href: "https://app.vistrial.io/accept" },
      logoUrl,
      homeHref: "https://app.vistrial.io",
    });

    const logoAt = html.indexOf(`src="${logoUrl}"`);
    const headingAt = html.indexOf("<h1");
    expect(html).toContain(EMAIL_LOGO_PATH);
    expect(html).toContain('width="48"');
    expect(logoAt).toBeGreaterThan(-1);
    expect(logoAt).toBeLessThan(headingAt);
    expect(html).toContain('alt="Vistrial"');
    expect(html).toContain("background-color:#9a88fc");
    expect(html).toContain("Set up my account");
    expect(html).toContain("https://app.vistrial.io/accept");
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("Set up my account"));
  });

  it("escapes copy and renders a list of links", () => {
    const html = transactionalEmailHtml({
      heading: "2 updates <from> Vistrial",
      lines: ['A <script> tag should stay text.'],
      items: [{ text: 'Open "queue"', href: "https://app.vistrial.io/app/queue?x=1&y=2" }],
      logoUrl,
      homeHref: "https://app.vistrial.io",
    });

    expect(html).toContain("2 updates &lt;from&gt; Vistrial");
    expect(html).toContain("A &lt;script&gt; tag should stay text.");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Open &quot;queue&quot;");
    expect(html).toContain("https://app.vistrial.io/app/queue?x=1&amp;y=2");
  });
});
