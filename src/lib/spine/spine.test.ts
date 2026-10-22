import { describe, expect, it } from "vitest";

import { mappingProblems, spineSideEffects, type SpineEvent } from "@/lib/spine/contract";
import {
  decideIdentity,
  identityKeys,
  normalizeEmail,
  normalizePhone,
  planMerge,
  reverseMerge,
  type IdentityKey,
  type SourcePerson,
} from "@/lib/spine/identity";
import { identitySourceFor } from "@/lib/spine/sources";

/** An in-memory lead_identities table, run through the same decision the server uses. */
function workspace() {
  const rows: Array<{ leadId: string } & IdentityKey> = [];
  let next = 0;
  const index = (key: IdentityKey) => rows.filter((row) => row.kind === key.kind && row.value === key.value).map((row) => row.leadId);
  return {
    rows,
    intake(person: SourcePerson) {
      const keys = identityKeys(person);
      const decision = decideIdentity(keys, (key) => [...new Set(index(key))]);
      let leadId: string | null = null;
      if (decision.kind === "match") leadId = decision.leadId;
      if (decision.kind === "new") leadId = `lead-${(next += 1)}`;
      if (leadId) for (const key of keys) if (!index(key).includes(leadId)) rows.push({ leadId, ...key });
      return { decision, leadId };
    },
  };
}

describe("identity keys", () => {
  it("reads emails case-blind and phones as E.164", () => {
    expect(normalizeEmail("  Dana.Price@Example.COM ")).toBe("dana.price@example.com");
    expect(normalizeEmail("not an email")).toBeNull();
    expect(normalizePhone("(415) 555-0134")).toBe("+14155550134");
    expect(normalizePhone("+1 415 555 0134")).toBe("+14155550134");
    expect(normalizePhone("12")).toBeNull();
  });

  it("keys a CRM contact by system and id, and an attendee by email", () => {
    expect(identityKeys({ source: "crm", crm: { system: "HubSpot", id: " 901 " }, email: "a@b.co" })).toEqual([
      { kind: "crm", value: "hubspot:901" },
      { kind: "email", value: "a@b.co" },
    ]);
    expect(identityKeys({ source: "calendar", attendeeEmail: "A@B.co", email: "a@b.co" })).toEqual([{ kind: "email", value: "a@b.co" }]);
  });
});

describe("the same person from every source", () => {
  it("resolves the CRM, calendar, Gmail and a transcript to one lead", () => {
    const ws = workspace();
    const crm = ws.intake({ source: "crm", crm: { system: "hubspot", id: "901" }, email: "dana@example.com", phone: "415-555-0134" });
    expect(crm.decision.kind).toBe("new");
    const calendar = ws.intake({ source: "calendar", attendeeEmail: "Dana@Example.com" });
    const gmail = ws.intake({ source: "gmail", email: "dana@example.com" });
    const transcript = ws.intake({ source: "transcript", email: "DANA@example.com", phone: "+14155550134" });
    const again = ws.intake({ source: "crm", crm: { system: "hubspot", id: "901" } });
    expect(new Set([crm.leadId, calendar.leadId, gmail.leadId, transcript.leadId, again.leadId])).toEqual(new Set(["lead-1"]));
    expect(transcript.decision).toEqual({ kind: "match", leadId: "lead-1", via: ["email", "phone"] });
  });

  it("learns a new key from a matched source, so the next source finds the lead by it", () => {
    const ws = workspace();
    ws.intake({ source: "crm", crm: { system: "hubspot", id: "901" }, email: "dana@example.com" });
    ws.intake({ source: "gmail", email: "dana@example.com", phone: "415 555 0134" });
    expect(ws.intake({ source: "transcript", email: "dana@example.com" }).leadId).toBe("lead-1");
  });

  it("never merges two leads on its own: a person decides", () => {
    const ws = workspace();
    ws.intake({ source: "crm", crm: { system: "hubspot", id: "1" }, email: "one@example.com" });
    ws.intake({ source: "crm", crm: { system: "hubspot", id: "2" }, email: "two@example.com" });
    const both = ws.intake({ source: "form", email: "one@example.com", crm: { system: "hubspot", id: "2" } });
    expect(both.decision).toEqual({ kind: "review", reason: "conflict", leadIds: ["lead-1", "lead-2"] });
    expect(both.leadId).toBeNull();
  });

  it("asks a person when only a phone number matches, because offices and families share them", () => {
    const ws = workspace();
    ws.intake({ source: "crm", email: "dana@example.com", phone: "415-555-0134" });
    const sameLine = ws.intake({ source: "form", email: "sam@example.com", phone: "(415) 555-0134" });
    expect(sameLine.decision).toEqual({ kind: "review", reason: "phone_only", leadIds: ["lead-1"] });
  });

  it("cannot match on nothing", () => {
    expect(decideIdentity([], () => [])).toEqual({ kind: "unusable" });
  });
});

describe("merges", () => {
  it("are reversible: Undo gives back exactly the keys the merged lead brought", () => {
    const snapshot = planMerge({
      survivorLeadId: "lead-1",
      mergedLeadId: "lead-2",
      survivorKeys: [{ kind: "email", value: "dana@example.com" }],
      mergedKeys: [
        { kind: "email", value: "dana@example.com" },
        { kind: "phone", value: "+14155550134" },
      ],
      mergedLead: { first_name: "Dana", status: "new" },
    });
    expect(snapshot.movedKeys).toEqual([{ kind: "phone", value: "+14155550134" }]);
    expect(reverseMerge(snapshot)).toEqual({
      leadId: "lead-2",
      restoreKeys: [{ kind: "phone", value: "+14155550134" }],
      restoreLead: { first_name: "Dana", status: "new" },
    });
    expect(() => planMerge({ survivorLeadId: "a", mergedLeadId: "a", survivorKeys: [], mergedKeys: [], mergedLead: {} })).toThrow();
  });
});

describe("history stays silent", () => {
  const event = (over: Partial<SpineEvent>): SpineEvent => ({
    source: "hubspot",
    sourceId: "e1",
    kind: "touch",
    occurredAt: "2026-10-01T12:00:00.000Z",
    historic: false,
    person: null,
    fields: {},
    ...over,
  });

  it("starts nothing for imported history, duplicates, or anything before go-live", () => {
    expect(spineSideEffects(event({ historic: true }), { duplicate: false, goLiveAt: null })).toEqual([]);
    expect(spineSideEffects(event({}), { duplicate: true, goLiveAt: null })).toEqual([]);
    expect(spineSideEffects(event({}), { duplicate: false, goLiveAt: "2026-10-02T00:00:00.000Z" })).toEqual([]);
    expect(spineSideEffects(event({}), { duplicate: false, goLiveAt: "2026-09-01T00:00:00.000Z" })).toContain("alert");
  });
});

describe("field mapping", () => {
  it("flags unmapped vendor fields and two fields claiming one Vistrial field", () => {
    expect(
      mappingProblems([
        { vendorField: "Lifecycle", spineField: "stage", conflict: false },
        { vendorField: "Deal stage", spineField: "stage", conflict: false },
        { vendorField: "Favourite colour", spineField: null, conflict: false },
      ])
    ).toEqual({ unmapped: ["Favourite colour"], conflicts: ["stage"] });
  });

  it("names where a key came from", () => {
    expect(identitySourceFor("hubspot")).toBe("crm");
    expect(identitySourceFor("fathom")).toBe("transcript");
    expect(identitySourceFor("something_new")).toBe("webhook");
  });
});
