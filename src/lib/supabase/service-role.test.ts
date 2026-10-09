import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The service-role client skips row-level security, so every file that uses it
 * was reviewed for two things: the caller's permission is checked first, and
 * every query is scoped to the caller's workspace (or, for webhooks and jobs,
 * to the one workspace the event resolved to). A new file that reaches for it
 * fails here until someone reviews it and adds it below.
 */
const REVIEWED = new Set([
  "src/app/(auth)/accept-invite/[token]/actions.ts",
  "src/app/(auth)/login/actions.ts",
  "src/app/api/execution/oauth/callback/route.ts",
  "src/app/api/ghl/oauth/callback/route.ts",
  "src/app/api/ghl/webhooks/route.ts",
  "src/app/api/health/ingestion/route.ts",
  "src/app/api/marketing/events/route.ts",
  "src/app/api/sources/oauth/callback/route.ts",
  "src/app/api/sources/webhooks/commas/[token]/route.ts",
  "src/app/api/sources/webhooks/forms/[token]/route.ts",
  "src/app/api/sources/webhooks/stripe/route.ts",
  "src/app/api/transcripts/webhooks/[source]/[token]/route.ts",
  "src/app/api/webhooks/resend/route.ts",
  "src/app/(workspace)/app/agents/actions.ts",
  "src/app/(workspace)/app/agents/simulator/page.tsx",
  "src/app/(workspace)/app/calls/actions.ts",
  "src/app/(workspace)/app/cases/[id]/page.tsx",
  "src/app/(workspace)/app/follow-ups/actions.ts",
  "src/app/(workspace)/app/home/actions.ts",
  "src/app/(workspace)/app/ops/actions.ts",
  "src/app/(workspace)/app/ops/export/route.ts",
  "src/app/(workspace)/app/ops/page.tsx",
  "src/app/(workspace)/app/reporting/actions.ts",
  "src/app/(workspace)/app/settings/approvals/actions.ts",
  "src/app/(workspace)/app/settings/data/export/route.ts",
  "src/app/(workspace)/app/settings/follow-up/actions.ts",
  "src/app/(workspace)/app/settings/integrations/actions.ts",
  "src/app/(workspace)/app/settings/integrations/advanced/page.tsx",
  "src/app/(workspace)/app/settings/integrations/destination-actions.ts",
  "src/app/(workspace)/app/settings/integrations/page.tsx",
  "src/app/(workspace)/app/settings/notifications/actions.ts",
  "src/app/(workspace)/app/settings/profile/actions.ts",
  "src/app/(workspace)/app/settings/scoring/actions.ts",
  "src/app/(workspace)/app/team/actions.ts",
  "src/app/(workspace)/portal/source-actions.ts",
  "src/lib/auth/invites.ts",
  "src/lib/brief/load.ts",
  "src/lib/forsight/report/generate.ts",
  "src/lib/forsight/report/send.ts",
  "src/lib/inbound/unplugged.ts",
  "src/lib/live/decisions.ts",
  "src/lib/live/record.ts",
  "src/lib/live/simulator.ts",
  "src/lib/ops/jobs.ts",
  "src/lib/portal/load.ts",
  "src/lib/profile/preview-draft.ts",
  "src/lib/reporting/load.ts",
  "src/lib/supabase/admin.ts",
  "src/lib/verification/record.ts",
  "src/lib/workspaces/activity.ts",
]);

const ROOT = path.join(__dirname, "..", "..", "..");

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

const users = collect(path.join(ROOT, "src"))
  .map((file) => ({ file: path.relative(ROOT, file), text: readFileSync(file, "utf8") }))
  .filter(({ text }) => text.includes("getSupabaseAdmin"));

describe("service-role client", () => {
  it("is used only in reviewed files", () => {
    expect(users.map(({ file }) => file).filter((file) => !REVIEWED.has(file))).toEqual([]);
  });

  it("never reaches the browser", () => {
    expect(users.filter(({ text }) => /^["']use client["']/m.test(text)).map(({ file }) => file)).toEqual([]);
  });
});
