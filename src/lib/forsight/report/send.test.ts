import { describe, expect, it } from "vitest";

import { clientReportRecipients } from "@/lib/forsight/report/send";
import type { ForsightDb } from "@/lib/forsight/sources";

describe("clientReportRecipients", () => {
  it("uses active owner and admin members, because there is no contacts table", async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: async () => ({
                data: [
                  { email: "owner@stellar.test", role: "owner", active: true },
                  { email: "admin@stellar.test", role: "admin", active: true },
                  { email: " OWNER@stellar.test ", role: "owner", active: true },
                ],
              }),
            }),
          }),
        }),
      }),
    } as unknown as ForsightDb;

    expect(await clientReportRecipients(db, "org-1")).toEqual([
      "owner@stellar.test",
      "admin@stellar.test",
    ]);
  });
});
