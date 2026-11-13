import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The sidebar is `position: sticky`. A sticky element sticks to its nearest scroll container, and
 * `overflow-x: hidden` (or `overflow: hidden`/`auto`) on any ancestor makes that ancestor one. The wrapper
 * then never scrolls, the page does, and the sidebar scrolls away with the page. `overflow-x: clip` hides
 * the same overflow without creating a scroll container.
 */
const FRAMES = ["src/components/shell/product-shell.tsx", "src/app/dev/step2/frame.tsx"];

describe("the sidebar stays put while the page scrolls", () => {
  for (const file of FRAMES) {
    it(`${file} keeps the sticky sidebar's ancestors from becoming scroll containers`, () => {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      const aside = source.indexOf("<aside");
      expect(aside).toBeGreaterThan(-1);
      expect(source.slice(aside, source.indexOf(">", aside))).toContain("sticky top-0");
      const before = source.slice(0, aside);
      expect(before).not.toMatch(/overflow-(x-|y-)?(hidden|auto|scroll)\b/);
    });
  }
});
