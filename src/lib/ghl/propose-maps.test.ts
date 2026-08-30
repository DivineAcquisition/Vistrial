import { describe, expect, it } from "vitest";

import {
  mappingSentence,
  proposeFieldMaps,
  unmappedFactors,
  type LiveField,
} from "@/lib/ghl/propose-maps";

function field(name: string, samples: string[] = [], id = name): LiveField {
  return { id, name, key: undefined, samples };
}

describe("proposing a mapping from live fields", () => {
  it("reads the question, not our own vocabulary", () => {
    const maps = proposeFieldMaps([
      field("What's your timeline?", ["Next 30 days"]),
      field("Budget for this", ["$10k"]),
      field("Who else decides?", ["Just me"]),
      field("Biggest problem right now", ["Leads go cold"]),
    ]);
    expect(maps.map((map) => map.factor)).toEqual([
      "timeline",
      "investment_capacity",
      "decision_authority",
      "pain_severity",
    ]);
    expect(maps.every((map) => map.confident)).toBe(true);
  });

  it("falls back to the shape of real answers when the question is opaque", () => {
    const maps = proposeFieldMaps([field("Q3 response", ["$12,000", "$8k", "$25,000"])]);
    expect(maps).toHaveLength(1);
    expect(maps[0]?.factor).toBe("investment_capacity");
    expect(maps[0]?.confident).toBe(false);
  });

  it("treats a duration answer as a timeline", () => {
    const maps = proposeFieldMaps([field("Field 7", ["Next 2 weeks", "ASAP", "3 months"])]);
    expect(maps[0]?.factor).toBe("timeline");
    expect(maps[0]?.confident).toBe(false);
  });

  it("prefers the named question over one guessed from values", () => {
    const maps = proposeFieldMaps([
      field("Unlabelled", ["$5,000"], "a"),
      field("What is your budget?", ["Not sure"], "b"),
    ]);
    expect(maps).toHaveLength(1);
    expect(maps[0]?.fieldId).toBe("b");
    expect(maps[0]?.confident).toBe(true);
  });

  it("never proposes two fields for the same thing", () => {
    const maps = proposeFieldMaps([
      field("Timeline", ["30 days"], "a"),
      field("What is your time frame?", ["60 days"], "b"),
    ]);
    expect(maps).toHaveLength(1);
  });

  it("proposes nothing rather than guessing when a field is meaningless", () => {
    expect(proposeFieldMaps([field("Notes", ["hello"])])).toEqual([]);
  });

  it("carries a real answer through as the example", () => {
    const maps = proposeFieldMaps([field("Timeline", ["Next 30 days"])]);
    expect(maps[0]?.example).toBe("Next 30 days");
  });

  it("survives a field nobody has answered yet", () => {
    const maps = proposeFieldMaps([field("Timeline", [])]);
    expect(maps[0]?.example).toBeNull();
  });
});

describe("the sentence a person reads", () => {
  it("names the customer's own field and shows their own answer", () => {
    const [map] = proposeFieldMaps([field("What's your timeline?", ["Next 30 days"])]);
    expect(mappingSentence(map!)).toBe(
      "We'll use “What's your timeline?” to judge how soon they are ready. Example answer: “Next 30 days”."
    );
  });

  it("drops the example rather than inventing one", () => {
    const [map] = proposeFieldMaps([field("Budget", [])]);
    expect(mappingSentence(map!)).toBe("We'll use “Budget” to judge what they can spend.");
  });

  it("never leaks an internal factor name into the sentence", () => {
    const maps = proposeFieldMaps([
      field("Timeline", ["30 days"]),
      field("Budget", ["$5k"]),
      field("Who decides", ["Me"]),
      field("Biggest challenge", ["Cost"]),
    ]);
    for (const map of maps) {
      expect(mappingSentence(map)).not.toMatch(/investment_capacity|decision_authority|pain_severity/);
    }
  });
});

describe("what is still missing", () => {
  it("names the factors nothing was proposed for", () => {
    const maps = proposeFieldMaps([field("Timeline", ["30 days"])]);
    expect(unmappedFactors(maps)).toEqual([
      "investment_capacity",
      "decision_authority",
      "pain_severity",
    ]);
  });

  it("is empty once all four are covered", () => {
    const maps = proposeFieldMaps([
      field("Timeline", []),
      field("Budget", []),
      field("Decision maker", []),
      field("Biggest problem", []),
    ]);
    expect(unmappedFactors(maps)).toEqual([]);
  });
});
