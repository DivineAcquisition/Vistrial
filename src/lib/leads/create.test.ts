import { describe, expect, it } from "vitest";

import {
  assignmentForCreator,
  parseCreateLeadInput,
  VISTRIAL_LEAD_SOURCE,
} from "@/lib/leads/create";

describe("parseCreateLeadInput", () => {
  it("requires a first name and keeps optional contact fields", () => {
    expect(parseCreateLeadInput({})).toEqual({
      ok: false,
      error: "A first name is required.",
    });
    expect(
      parseCreateLeadInput({
        firstName: "  Maya  ",
        lastName: " Chen ",
        email: "maya@studio.example",
        phone: "555-0100",
      })
    ).toEqual({
      ok: true,
      value: {
        firstName: "Maya",
        lastName: "Chen",
        email: "maya@studio.example",
        phone: "555-0100",
      },
    });
  });

  it("rejects a malformed email and treats blank optionals as absent", () => {
    expect(parseCreateLeadInput({ firstName: "Maya", email: "not-an-email" })).toEqual({
      ok: false,
      error: "That email does not look right.",
    });
    expect(parseCreateLeadInput({ firstName: "Maya", lastName: "  ", email: "", phone: "" })).toEqual({
      ok: true,
      value: { firstName: "Maya", lastName: null, email: null, phone: null },
    });
  });
});

describe("assignmentForCreator", () => {
  it("assigns the person to the setter or closer who added them", () => {
    expect(assignmentForCreator("setter", "member-1")).toEqual({
      assignedSetterId: "member-1",
      assignedCloserId: null,
    });
    expect(assignmentForCreator("closer", "member-2")).toEqual({
      assignedSetterId: null,
      assignedCloserId: "member-2",
    });
    expect(assignmentForCreator("owner", "member-3")).toEqual({
      assignedSetterId: null,
      assignedCloserId: null,
    });
  });
});

describe("Vistrial lead source", () => {
  it("names people stored here rather than ingested from a CRM", () => {
    expect(VISTRIAL_LEAD_SOURCE).toBe("vistrial");
  });
});
