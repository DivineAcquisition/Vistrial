import { describe, expect, it } from "vitest";

import { isApprovedInput } from "@/lib/assay/inputs";
import {
  MAPPABLE_INPUTS,
  mappingSentence,
  proposeFieldMaps,
  unmappedInputs,
  type LiveField,
} from "@/lib/ghl/propose-maps";

function field(name: string, samples: string[] = [], id = name): LiveField {
  return { id, name, key: undefined, samples };
}

describe("proposing a mapping from live fields", () => {
  it("reads the question and maps it to an approved Assay input", () => {
    const maps = proposeFieldMaps([
      field("Do you own or rent?", ["Own"]),
      field("Are you in our service area?", ["Yes"]),
      field("Estimated value of the job", ["$4,000"]),
      field("Who decides on this?", ["Me"]),
    ]);
    expect(maps.map((map) => map.input)).toEqual(["property_owner", "in_service_area", "estimated_value", "decision_maker"]);
    expect(maps.every((map) => map.confident)).toBe(true);
  });

  it("only ever proposes approved inputs", () => {
    for (const input of MAPPABLE_INPUTS) expect(isApprovedInput(input)).toBe(true);
  });

  it("never proposes a personal detail, whatever the question is called", () => {
    expect(
      proposeFieldMaps([
        field("First name"),
        field("Your age"),
        field("Zip code", ["60614"]),
        field("Household income", ["$90k"]),
        field("Health conditions"),
        field("Preferred language"),
      ])
    ).toEqual([]);
  });

  it("does not guess from money-looking answers, which may be about the person", () => {
    expect(proposeFieldMaps([field("Q3 response", ["$12,000", "$8k", "$25,000"])])).toEqual([]);
    expect(proposeFieldMaps([field("Budget", ["$10k"])])).toEqual([]);
  });

  it("never proposes two fields for the same thing", () => {
    const maps = proposeFieldMaps([field("Homeowner?", ["Yes"], "a"), field("Do you own the home?", ["Yes"], "b")]);
    expect(maps).toHaveLength(1);
  });

  it("proposes nothing rather than guessing when a field is meaningless", () => {
    expect(proposeFieldMaps([field("Notes", ["hello"])])).toEqual([]);
  });

  it("carries a real answer through as the example, or none", () => {
    expect(proposeFieldMaps([field("Homeowner", ["Yes"])])[0]?.example).toBe("Yes");
    expect(proposeFieldMaps([field("Homeowner", [])])[0]?.example).toBeNull();
  });
});

describe("the sentence a person reads", () => {
  it("names the customer's own field and shows their own answer", () => {
    const [map] = proposeFieldMaps([field("Do you own or rent?", ["Own"])]);
    expect(mappingSentence(map!)).toBe("We'll read “Do you own or rent?” as: owns the property. Example answer: “Own”.");
  });

  it("drops the example rather than inventing one", () => {
    const [map] = proposeFieldMaps([field("Service area", [])]);
    expect(mappingSentence(map!)).toBe("We'll read “Service area” as: inside the service area.");
  });
});

describe("what is still missing", () => {
  it("names the inputs nothing was proposed for", () => {
    const maps = proposeFieldMaps([field("Homeowner", [])]);
    expect(unmappedInputs(maps)).toEqual(["in_service_area", "travel_distance", "estimated_value", "decision_maker"]);
  });
});
