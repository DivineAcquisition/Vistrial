import { describe, expect, it } from "vitest";

import { idleLine } from "./live-aside";

describe("live panel", () => {
  it("says the agents are off only when every agent is off", () => {
    expect(idleLine([{ state: "on" }, { state: "off" }])).toBe("Nothing is running.");
    expect(idleLine([{ state: "suggesting" }])).toBe("Nothing is running.");
    expect(idleLine([{ state: "off" }, { state: "off" }])).toBe("Nothing is running. Agents are off.");
    expect(idleLine([])).toBe("Nothing is running. Agents are off.");
  });
});
