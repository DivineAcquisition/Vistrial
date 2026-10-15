import { describe, expect, it } from "vitest";

import { filterSearch, phoneDigits, SEARCH_EMPTY, type SearchRow } from "@/lib/search/query";

const visible: SearchRow[] = [
  { kind: "leads", id: "1", title: "Maya Chen", detail: "working", href: "/app/cases/1" },
  { kind: "tasks", id: "2", title: "Send the quote", detail: "open", href: "/app/tasks" },
];

describe("search", () => {
  it("matches only rows it was given, so a hidden name cannot change the count", () => {
    expect(filterSearch(visible, "Hidden Person", "all")).toHaveLength(0);
    expect(filterSearch(visible, "Maya", "all")).toHaveLength(1);
    expect(filterSearch(visible, "Maya", "tasks")).toHaveLength(0);
    expect(SEARCH_EMPTY).not.toMatch(/hidden|exist/);
  });

  it("matches a partial phone number without keeping the raw text", () => {
    const rows: SearchRow[] = [{ kind: "leads", id: "3", title: "Lead", detail: "(410) 555-0199", href: "/app/cases/3" }];
    expect(phoneDigits("(410) 555-0199")).toBe("4105550199");
    expect(filterSearch(rows, "5550199", "leads")).toHaveLength(1);
  });
});
