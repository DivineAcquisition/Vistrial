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
  "src/app/(workspace)/app/onboarding/setup-actions.ts",
  "src/app/(workspace)/app/team/onboarding/actions.ts",
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
  "src/app/api/webhooks/stripe-billing/route.ts",
  "src/app/(workspace)/app/agents/actions.ts",
  "src/app/(workspace)/app/agents/roster-actions.ts",
  "src/app/(workspace)/app/team/agents/registry/page.tsx",
  "src/app/(workspace)/app/cases/scribe-actions.ts",
  "src/app/(workspace)/app/agents/simulator/page.tsx",
  "src/app/(workspace)/app/calls/actions.ts",
  "src/app/(workspace)/app/cases/[id]/page.tsx",
  "src/app/(workspace)/app/follow-ups/actions.ts",
  "src/app/(workspace)/app/home/actions.ts",
  "src/app/(workspace)/app/ops/actions.ts",
  "src/app/(workspace)/app/ops/export/route.ts",
  "src/app/(workspace)/app/ops/page.tsx",
  "src/app/(workspace)/app/reporting/actions.ts",
  "src/app/(workspace)/app/results/exports/[id]/route.ts",
  "src/app/(workspace)/app/settings/approvals/actions.ts",
  "src/app/(workspace)/app/settings/billing/actions.ts",
  "src/app/(workspace)/app/settings/data/export/route.ts",
  "src/app/(workspace)/app/settings/privacy/export/route.ts",
  "src/app/(workspace)/app/settings/follow-up/actions.ts",
  "src/app/(workspace)/app/settings/integrations/actions.ts",
  "src/app/(workspace)/app/settings/integrations/advanced/page.tsx",
  "src/app/(workspace)/app/settings/integrations/destination-actions.ts",
  "src/app/(workspace)/app/settings/integrations/page.tsx",
  "src/app/(workspace)/app/settings/notifications/actions.ts",
  "src/app/(workspace)/app/settings/profile/actions.ts",
  "src/app/(workspace)/app/team/actions.ts",
  "src/app/(workspace)/app/team/staff-actions.ts",
  "src/app/(auth)/security/actions.ts",
  "src/app/(workspace)/portal/source-actions.ts",
  "src/lib/auth/invites.ts",
  "src/lib/billing/events.ts",
  "src/lib/billing/stripe.ts",
  "src/lib/brief/load.ts",
  "src/lib/forsight/report/generate.ts",
  "src/lib/forsight/report/send.ts",
  "src/lib/inbound/unplugged.ts",
  "src/lib/live/decisions.ts",
  "src/lib/live/drain.ts",
  "src/lib/live/reconcile.ts",
  "src/lib/live/record.ts",
  "src/lib/live/transport.ts",
  "src/lib/live/simulator.ts",
  "src/lib/relay/quality-run.ts",
  "src/lib/relay/run.ts",
  "src/lib/scribe/store.ts",
  "src/lib/sentry/quality.ts",
  "src/lib/sentry/sweep.ts",
  "src/lib/ops/jobs.ts",
  "src/lib/portal/avatars.ts",
  "src/lib/portal/export.ts",
  "src/lib/portal/load.ts",
  "src/lib/portal/notices.ts",
  "src/lib/profile/preview-draft.ts",
  "src/lib/reporting/load.ts",
  "src/lib/supabase/admin.ts",
  "src/lib/verification/record.ts",
  "src/lib/workspaces/activity.ts",
  "src/lib/api/v1/gateway.ts",
  "src/lib/exports/purge.ts",
  "src/lib/exports/store.ts",
  "src/app/(workspace)/app/cases/[id]/files/[fileId]/route.ts",
  "src/app/(workspace)/app/reports/client-actions.ts",
  "src/app/(workspace)/app/settings/developers/actions.ts",
  "src/app/(workspace)/app/team/billing/actions.ts",
  "src/app/api/webhooks/telnyx/notifications/route.ts",
  "src/lib/access-requests/submit.ts",
  "src/lib/email/send-guard.ts",
  "src/app/(marketing)/privacy/requests/actions.ts",
  "src/app/(marketing)/security/actions.ts",
  "src/app/(workspace)/app/onboarding/step/[slug]/page.tsx",
  "src/app/(workspace)/app/settings/connections/[connector]/page.tsx",
  "src/app/api/connectors/oauth/callback/route.ts",
  "src/app/api/connectors/oauth/start/route.ts",
  "src/app/api/marketing/consent/route.ts",
  "src/lib/connectors/apply.ts",
  "src/lib/connectors/maintain.ts",
  "src/lib/connectors/store.ts",
  "src/lib/connectors/sync.ts",
  "src/lib/directory/commit.ts",
  "src/lib/directory/load.ts",
  "src/lib/marketing/tracking.ts",
  "src/lib/trust/accept.ts",
  "src/lib/trust/public.ts",
  "src/app/(workspace)/app/actions/policy-actions.ts",
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
