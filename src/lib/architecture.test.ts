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
