import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Prompt 4, Part 1: dispatch through the CRM is allowed, display is not.
 * GoHighLevel stays the system of record for conversations; this product
 * never renders a two-way thread. The line drawn in the source is that the
 * word "Inbox" never describes a feature here — the lead triage screen is
 * the Queue, and the notification bell is not a messaging surface.
 *
 * This scans source text, not runtime behavior, so it will not catch a
 * conversation UI built under a different name. It exists to catch the literal
 * regression: someone reaching for "Inbox" as the obvious label for a new
 * screen or component.
 */

const ROOT = path.join(__dirname, "..", "..");
const SCAN_DIRS = ["src", "supabase"];
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".sql", ".md"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, out);
    } else if (TEXT_EXTENSIONS.has(path.extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Prompt 9, Part 6: the brief is reachable in one click from the queue, the
 * case file, and the call record.
 *
 * This is a source-text guard because the brief has already rotted once: the
 * screen stayed fully written while the route redirected past it, so nothing
 * rendered and no test failed. These assertions catch that shape of
 * regression — a live component behind a dead route, or a surface that quietly
 * drops its link.
 */
describe("the pre-call brief is reachable", () => {
  const read = (relative: string) => readFileSync(path.join(ROOT, relative), "utf8");

  it("renders the brief screen instead of redirecting past it", () => {
    const route = read("src/app/app/cases/[id]/brief/page.tsx");
    expect(route).toContain("BriefScreen");
    expect(route).not.toMatch(/\bredirect\(/);
  });

  it("is one click from the queue, the case file, and the call record", () => {
    const surfaces = [
      "src/app/app/queue/queue-row.tsx",
      "src/app/app/queue/queue-mobile-list.tsx",
      "src/app/app/cases/[id]/case-file-screen.tsx",
      "src/app/app/calls/call-detail-screen.tsx",
    ];
    const missing = surfaces.filter((file) => !read(file).includes("}/brief`"));
    expect(missing).toEqual([]);
  });

  it("does not put the ninety-second read behind a scroll container", () => {
    expect(read("src/app/app/cases/[id]/brief/brief-screen.tsx")).not.toContain("overflow-y-auto");
  });
});

describe("no messaging surface named Inbox", () => {
  it('never uses the word "Inbox" anywhere in src/ or supabase/', () => {
    const inboxPattern = /\binbox\b/i;
    const offenders: string[] = [];

    for (const dir of SCAN_DIRS) {
      for (const file of collectFiles(path.join(ROOT, dir))) {
        // Skip this file itself: it necessarily contains the word it checks for.
        if (file === __filename) continue;
        const content = readFileSync(file, "utf8");
        if (inboxPattern.test(content)) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
