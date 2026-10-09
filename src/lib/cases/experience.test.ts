import { describe, expect, it } from "vitest";

import { activeChips, clearChip, headlineOf, parseExperienceFilter, responseState } from "@/lib/cases/experience";

const base = {
  doNotContact: false,
  optedOut: false,
  status: "new",
  optedInAt: "2026-10-09T12:00:00.000Z",
  firstHumanTouchAt: null as string | null,
  windowMinutes: 10,
};

describe("response clock", () => {
  it("is on time while most of the window remains", () => {
    expect(responseState({ ...base, now: "2026-10-09T12:03:00.000Z" })).toBe("on_time");
  });

  it("is at risk near the end of the window and missed after it", () => {
    expect(responseState({ ...base, now: "2026-10-09T12:08:00.000Z" })).toBe("at_risk");
    expect(responseState({ ...base, now: "2026-10-09T12:11:00.000Z" })).toBe("missed");
  });

  it("is on time when a person touched inside the window, and missed when they did not", () => {
    expect(responseState({ ...base, firstHumanTouchAt: "2026-10-09T12:04:00.000Z", now: "2026-10-09T13:00:00.000Z" })).toBe("on_time");
    expect(responseState({ ...base, firstHumanTouchAt: "2026-10-09T12:20:00.000Z", now: "2026-10-09T13:00:00.000Z" })).toBe("missed");
  });

  it("does not run for opt-outs, do-not-contact, or closed leads", () => {
    expect(responseState({ ...base, optedOut: true, now: "2026-10-09T18:00:00.000Z" })).toBe("not_applicable");
    expect(responseState({ ...base, doNotContact: true, now: "2026-10-09T18:00:00.000Z" })).toBe("not_applicable");
    expect(responseState({ ...base, status: "closed_won", now: "2026-10-09T18:00:00.000Z" })).toBe("not_applicable");
  });
});

describe("list filters", () => {
  it("reads a built-in view and meaning search from the address", () => {
    const filter = parseExperienceFilter({ view: "hot", q: "price", meaning: "1", sort: "name" });
    expect(filter.view).toBe("hot");
    expect(filter.meaning).toBe(true);
    expect(filter.sort).toBe("name");
  });

  it("drops a saved view that names a field the configuration no longer has", () => {
    const filter = parseExperienceFilter({ fact: "old_field", factValue: "gold" });
    const chips = activeChips(filter, []);
    expect(chips[0]?.label).toBe("old_field: gold");
    expect(clearChip(filter, "fact").factKey).toBeNull();
  });

  it("uses the first sentence as the headline", () => {
    expect(headlineOf("Ready to book. Still deciding on the date.")).toBe("Ready to book.");
  });
});
