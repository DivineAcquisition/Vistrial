import { describe, expect, it } from "vitest";

import { parseBriefPayload } from "@/lib/brief/parse";
import { cursorFromCaseRow, decodeCaseCursor, encodeCaseCursor } from "@/lib/cases/cursor";
import {
  caseFiltersHref,
  caseListHasConstraints,
  isLeadId,
  parseCaseListFilters,
} from "@/lib/cases/filters";
import { caseListEmptyKind, parseCaseTimelinePage } from "@/lib/cases/parse";
import type { CaseListPayload, CaseListRow } from "@/lib/cases/types";

const emptyPayload = (over: Partial<CaseListPayload> = {}): CaseListPayload => ({
  crmStatus: "active",
  ghlLocationId: null,
  orgLeadCount: 0,
  rows: [],
  hasMore: false,
  members: [],
  sources: [],
  speedToLeadMinutes: 15,
  ...over,
});

describe("case list filters", () => {
  it("defaults to last touch descending and reads the rest from the URL", () => {
    expect(parseCaseListFilters({})).toEqual({
      q: null,
      status: null,
      track: null,
      source: null,
      setterId: null,
      closerId: null,
      scoreMin: null,
      scoreMax: null,
      optedFrom: null,
      optedTo: null,
      zeroHumanTouch: false,
      ttftBreach: false,
      sort: "last_touch",
      dir: "desc",
    });

    const filters = parseCaseListFilters({
      q: "Maya",
      status: "working",
      track: "ready",
      source: "facebook",
      setter: "33333333-3333-4333-8333-333333333333",
      closer: "13131313-1313-4131-8131-131313131313",
      scoreMin: "90",
      scoreMax: "10",
      optedFrom: "2026-08-20",
      optedTo: "2026-08-01",
      sort: "score",
      dir: "asc",
    });
    expect(filters.q).toBe("Maya");
    expect(filters.status).toBe("working");
    expect(filters.track).toBe("ready");
    expect(filters.scoreMin).toBe(10);
    expect(filters.scoreMax).toBe(90);
    expect(filters.optedFrom).toBe("2026-08-01");
    expect(filters.optedTo).toBe("2026-08-20");
    expect(filters.sort).toBe("score");
    expect(filters.dir).toBe("asc");
    expect(caseListHasConstraints(filters)).toBe(true);
  });

  it("keeps filter and sort state in the URL", () => {
    const href = caseFiltersHref({
      q: "Maya",
      status: "working",
      track: null,
      source: null,
      setterId: null,
      closerId: null,
      scoreMin: 40,
      scoreMax: null,
      optedFrom: null,
      optedTo: null,
      zeroHumanTouch: false,
      ttftBreach: false,
      sort: "last_touch",
      dir: "desc",
    });
    expect(href).toContain("q=Maya");
    expect(href).toContain("status=working");
    expect(href).toContain("scoreMin=40");
    expect(href).not.toContain("sort=");
    expect(href).not.toContain("dir=");
  });

  it("keeps zero-touch and missed-window filters in the URL", () => {
    const href = caseFiltersHref({
      q: null,
      status: null,
      track: null,
      source: null,
      setterId: null,
      closerId: null,
      scoreMin: null,
      scoreMax: null,
      optedFrom: null,
      optedTo: null,
      zeroHumanTouch: true,
      ttftBreach: true,
      sort: "last_touch",
      dir: "desc",
    });
    expect(href).toContain("zeroTouch=1");
    expect(href).toContain("breached=1");
    expect(caseListHasConstraints(parseCaseListFilters({ zeroTouch: "1", breached: "1" }))).toBe(true);
  });
});

describe("case list empty states", () => {
  const filters = parseCaseListFilters({});
  const searching = parseCaseListFilters({ q: "nobody" });

  it("treats a missing CRM with no leads as not connected, not as no-leads-yet", () => {
    expect(caseListEmptyKind(emptyPayload({ crmStatus: "missing" }), filters)).toBe("not_connected");
    expect(caseListEmptyKind(emptyPayload({ crmStatus: "active" }), filters)).toBe("no_leads");
    expect(caseListEmptyKind(emptyPayload({ crmStatus: "broken" }), filters)).toBe("broken");
  });

  it("renders no-results separately from no-leads-at-all", () => {
    expect(
      caseListEmptyKind(emptyPayload({ crmStatus: "active", orgLeadCount: 4 }), searching)
    ).toBe("no_results");
    expect(
      caseListEmptyKind(emptyPayload({ crmStatus: "active", orgLeadCount: 0 }), searching)
    ).toBe("no_leads");
    expect(
      caseListEmptyKind(emptyPayload({ crmStatus: "active", orgLeadCount: 4 }), filters)
    ).toBeNull();
  });
});

describe("case list cursor", () => {
  const row: CaseListRow = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02",
    orgId: "22222222-2222-4222-8222-222222222222",
    name: "Worked Lead",
    email: "worked.lead@example.com",
    phone: null,
    source: "case-test",
    status: "working",
    leadType: "ready_track",
    score: 52,
    optedInAt: "2026-08-16T00:00:00.000Z",
    lastTouchAt: "2026-08-20T12:00:00.000Z",
    assignedSetterId: null,
    assignedCloserId: null,
    assignedSetterName: null,
    assignedCloserName: null,
    firstHumanTouchAt: null,
  };

  it("round-trips last-touch cursors", () => {
    const encoded = encodeCaseCursor(cursorFromCaseRow(row, "last_touch"));
    expect(decodeCaseCursor(encoded)).toMatchObject({
      id: row.id,
      t: row.lastTouchAt,
    });
  });
});

describe("case file ids", () => {
  it("accepts uuids and rejects other strings", () => {
    expect(isLeadId("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02")).toBe(true);
    expect(isLeadId("not-a-lead")).toBe(false);
  });
});

describe("case timeline activity merge", () => {
  it("keeps derived activity in the same sequence as touches and calls", () => {
    const page = parseCaseTimelinePage({
      entries: [
        {
          kind: "activity",
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          at: "2026-08-25T12:00:00.000Z",
          category: "system",
          activityKind: "lead_scored",
          headline: "Scored 82",
          actorName: "Vistrial scoring",
          result: "succeeded",
          detail: { total: 82, reasoning: "Strong timeline.", outboundBody: "hidden" },
        },
        {
          kind: "touch",
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
          at: "2026-08-25T11:00:00.000Z",
          touchType: "human",
          channel: "sms",
          direction: "outbound",
          outcome: "connected",
          outboundBody: "See you Thursday.",
        },
      ],
      hasMore: false,
    });
    expect(page.entries[0]).toMatchObject({
      kind: "activity",
      headline: "Scored 82",
      activityKind: "lead_scored",
    });
    expect(page.entries[1]).toMatchObject({ kind: "touch", direction: "outbound" });
    expect(page.entries[1]).not.toHaveProperty("outboundBody");
    if (page.entries[0].kind === "activity") {
      expect(page.entries[0].detail).not.toHaveProperty("outboundBody");
    }
  });
});

describe("pre-call brief objections", () => {
  it("keeps the source call id so the brief can link to it", () => {
    const parsed = parseBriefPayload(
      {
        lead: { id: "l1", name: "Maya", optedInAt: "2026-08-01T00:00:00.000Z" },
        openObjections: [
          {
            id: "o1",
            type: "timing",
            verbatim: "after Q1",
            callId: "c1",
            callType: "discovery",
            callOccurredAt: "2026-08-20T12:00:00.000Z",
          },
        ],
      },
      "2026-08-21T00:00:00.000Z"
    );
    expect(parsed.openObjections[0]).toMatchObject({
      id: "o1",
      callId: "c1",
      callType: "discovery",
      callOccurredAt: "2026-08-20T12:00:00.000Z",
    });
    expect(parsed.whatWorks).toEqual([]);
  });
});

describe("time-to-first-touch breach", () => {
  it("flags untouched leads past the response window and ignores touched ones", async () => {
    const { isTtftBreached } = await import("@/lib/cases/ttft");
    expect(
      isTtftBreached({
        optedInAt: "2026-08-01T00:00:00.000Z",
        firstHumanTouchAt: null,
        speedToLeadMinutes: 15,
        now: "2026-08-01T00:16:00.000Z",
      })
    ).toBe(true);
    expect(
      isTtftBreached({
        optedInAt: "2026-08-01T00:00:00.000Z",
        firstHumanTouchAt: null,
        speedToLeadMinutes: 15,
        now: "2026-08-01T00:10:00.000Z",
      })
    ).toBe(false);
    expect(
      isTtftBreached({
        optedInAt: "2026-08-01T00:00:00.000Z",
        firstHumanTouchAt: "2026-08-01T00:20:00.000Z",
        speedToLeadMinutes: 15,
        now: "2026-08-01T01:00:00.000Z",
      })
    ).toBe(false);
  });
});

describe("lead file helpers", () => {
  it("accepts listed types and strips path separators from names", async () => {
    const { isAllowedLeadFileType, sanitizeLeadFileName } = await import("@/lib/cases/files");
    expect(isAllowedLeadFileType("application/pdf")).toBe(true);
    expect(isAllowedLeadFileType("application/zip")).toBe(false);
    expect(sanitizeLeadFileName("../../secret.txt")).toBe(".. .. secret.txt");
  });
});

describe("case file parse extras", () => {
  it("keeps context notes, pipeline, files, and call transcripts without message bodies", async () => {
    const { parseCaseFilePayload } = await import("@/lib/cases/parse");
    const parsed = parseCaseFilePayload({
      lead: {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02",
        orgId: "22222222-2222-4222-8222-222222222222",
        name: "Worked Lead",
        status: "working",
        optedInAt: "2026-08-16T00:00:00.000Z",
        contextNotes: "Ask about the accountant.",
        pipelineStage: "Discovery",
        createdAt: "2026-08-16T00:00:00.000Z",
        firstHumanTouchAt: "2026-08-16T00:10:00.000Z",
        timeToFirstHumanTouchSeconds: 600,
        speedToLeadMinutes: 15,
      },
      calls: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10",
          type: "discovery",
          hasTranscript: true,
          hasExtraction: false,
          extractionStatus: "none",
          transcript: "We talked about timing.",
        },
      ],
      files: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb30",
          fileName: "intake.pdf",
          contentType: "application/pdf",
          byteSize: 1200,
          createdAt: "2026-08-16T00:00:00.000Z",
        },
      ],
      timeline: { entries: [], hasMore: false },
    });
    expect(parsed?.lead.contextNotes).toBe("Ask about the accountant.");
    expect(parsed?.lead.pipelineStage).toBe("Discovery");
    expect(parsed?.calls[0]?.transcript).toBe("We talked about timing.");
    expect(parsed?.files[0]?.fileName).toBe("intake.pdf");
  });
});
