import { describe, expect, it } from "vitest";

import {
  COMPANY_ADDRESS,
  CONTACT_EMAIL,
  DISCLAIMER_LAST_UPDATED,
  LEGAL_EMAIL,
  LEGAL_ENTITY,
  PRIVACY_EFFECTIVE,
  PRIVACY_LAST_UPDATED,
  TERMS_EFFECTIVE,
  TERMS_LAST_UPDATED,
} from "@/lib/constants";

describe("public legal identity", () => {
  it("matches the published privacy policy", () => {
    expect(LEGAL_ENTITY).toBe("Divine Acquisition LLC");
    expect(COMPANY_ADDRESS).toBe("7404 Executive Place, Lanham, MD 20706");
    expect(CONTACT_EMAIL).toBe("contact@vistrial.io");
    expect(LEGAL_EMAIL).toBe("legal@divineacquisition.io");
    expect(PRIVACY_LAST_UPDATED).toBe("8/22/2026");
    expect(PRIVACY_EFFECTIVE).toBe("8/22/2026");
  });

  it("dates the terms of service when they were published", () => {
    expect(TERMS_LAST_UPDATED).toBe("8/23/2026");
    expect(TERMS_EFFECTIVE).toBe("8/23/2026");
  });

  it("dates the disclaimer from the published document", () => {
    expect(DISCLAIMER_LAST_UPDATED).toBe("8/22/2026");
  });
});
