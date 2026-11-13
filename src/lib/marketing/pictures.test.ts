import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AGENTS_SECTION, GROWTH_ARCHITECT } from "@/lib/marketing/content";
import { APP_SCREENS, PICTURES, PICTURE_NOTE, picturesFor } from "@/lib/marketing/pictures";

describe("the app screens on the public page", () => {
  it("shows only real screens, each with its file and a description", () => {
    expect(PICTURES.map((picture) => picture.id)).toEqual([
      "offer-compare",
      "ad-set",
      "page-teardown",
      "tasks-board",
      "briefing-approval",
      "home",
      "organizations-clients",
      "test-plan",
      "tasks-result",
    ]);
    for (const picture of PICTURES) {
      expect(picture.on, picture.id).toBe(true);
      expect(picture.alt.length, picture.id).toBeGreaterThan(40);
      expect(picture.width * picture.height, picture.id).toBeGreaterThan(0);
      expect(existsSync(join(process.cwd(), "public/marketing/product", `${picture.file}.png`)), picture.id).toBe(true);
    }
    expect(PICTURE_NOTE).toMatch(/sample data/);
    // Industry trend posts are off by default and have not run for a customer, so no picture features them.
    expect(PICTURES.map((picture) => `${picture.title} ${picture.alt}`).join(" ")).not.toMatch(/trend/i);
  });

  it("names a real, available skill wherever it says a skill made the screen", () => {
    const available = GROWTH_ARCHITECT.skills.filter((skill) => skill.status === "available").map((skill) => skill.name as string);
    for (const picture of PICTURES) {
      if (picture.place === "skill") expect(available, picture.id).toContain(picture.by);
      else expect(available, picture.id).not.toContain(picture.by);
    }
    expect(AGENTS_SECTION.departments.flatMap((group) => [...group.agents]).find((agent) => agent.name === APP_SCREENS.agent)?.live).toBe(true);
  });

  it("gives the tour a tab and a line for every screen, and has pictures for each place", () => {
    const tour = picturesFor("app");
    expect(tour.map((picture) => picture.tab)).toEqual(["Tasks", "Briefing", "Home", "Clients"]);
    for (const picture of tour) expect(picture.doing, picture.id).toBeTruthy();
    expect(picturesFor("skill")).toHaveLength(3);
    expect(picturesFor("loop")).toHaveLength(2);
  });

  it("uses no em dash and promises no result", () => {
    const words = JSON.stringify({ APP_SCREENS, PICTURES });
    expect(words).not.toMatch(/\u2014/);
    expect(words).not.toMatch(/guarantee[ds]? (results|revenue)|\d+% (more|increase)/i);
  });
});
