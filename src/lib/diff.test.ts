import { describe, expect, it } from "vitest";

import { lineDiff } from "@/lib/diff";

describe("lineDiff", () => {
  it("marks kept, removed and added lines in order", () => {
    expect(lineDiff("a\nb\nc", "a\nc\nd")).toEqual([
      { type: "same", text: "a" },
      { type: "removed", text: "b" },
      { type: "same", text: "c" },
      { type: "added", text: "d" },
    ]);
  });

  it("handles empty sides", () => {
    expect(lineDiff("", "x")).toEqual([
      { type: "removed", text: "" },
      { type: "added", text: "x" },
    ]);
    expect(lineDiff("same", "same")).toEqual([{ type: "same", text: "same" }]);
  });
});
