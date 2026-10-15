import { describe, expect, it } from "vitest";

import { isPrivateAddress, OutboundUrlError, assertPublicHttps } from "@/lib/security/outbound-url";

describe("outbound URL guard", () => {
  it("treats private and metadata addresses as blocked", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "192.168.1.4", "172.16.0.4", "169.254.169.254", "0.0.0.0", "::1", "fc00::1", "fe80::1"]) {
      expect(isPrivateAddress(address)).toBe(true);
    }
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("refuses non-https, local names, and embedded credentials", async () => {
    await expect(assertPublicHttps("http://example.com/hook")).rejects.toBeInstanceOf(OutboundUrlError);
    await expect(assertPublicHttps("https://user:pass@example.com/hook")).rejects.toBeInstanceOf(OutboundUrlError);
    await expect(assertPublicHttps("https://localhost/hook")).rejects.toBeInstanceOf(OutboundUrlError);
    await expect(assertPublicHttps("https://169.254.169.254/latest")).rejects.toBeInstanceOf(OutboundUrlError);
    await expect(assertPublicHttps("https://example.internal/hook")).rejects.toBeInstanceOf(OutboundUrlError);
  });
});
