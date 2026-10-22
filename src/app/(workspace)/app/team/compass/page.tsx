import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";

import { CompassLimitsForm, CompassSwitch, WorkspaceLimitsForm } from "@/app/(workspace)/app/team/compass/forms";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/gates";
import { DEFAULT_LIMITS } from "@/lib/compass/usage";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Compass" };

type UsageRow = {
  org_id: string;
  org_name: string;
  questions: number;
  people: number;
  avg_ms: number | null;
  median_first_ms: number | null;
  errors: number;
  no_data: number;
  unverified: number;
  limited: number;
  up: number;
  down: number;
  cost_micros: number;
};

type ReviewRow = {
  at: string;
  org_name: string;
  outcome: string;
  route: string | null;
  model: string | null;
  lookup_names: string[] | null;
  duration_ms: number | null;
  rating: string | null;
  reason: string | null;
  error_code: string | null;
  staff: boolean;
};

type ShareRow = { share_id: string; org_name: string; shared_at: string; expires_at: string; view_count: number };

function lastThirtyDays(): { since: string; now: string } {
  const at = Date.now();
  return { since: new Date(at - 30 * 86_400_000).toISOString(), now: new Date(at + 60_000).toISOString() };
}

function seconds(ms: number | null | undefined): string {
  return ms === null || ms === undefined ? "–" : `${(Number(ms) / 1000).toFixed(1)}s`;
}

function dollars(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(micros < 10_000_000 ? 4 : 2)}`;
}

/**
 * Compass for the Vistrial team. No conversation text appears here: usage
 * and quality are counts and outcomes, and a conversation is readable only
 * when its author has shared it, for 7 days, and each opening is logged.
 */
export default async function TeamCompassPage() {
  const ctx = await requireStaff();
  const db = (await createClient()) as unknown as SupabaseClient;
  const { since, now } = lastThirtyDays();

  const [activation, shares, usage, review, settings, workspaces] = await Promise.all([
    db.from("workspace_agent_activation").select("stage").eq("org_id", ctx.org.id).eq("agent_id", "compass").maybeSingle(),
    db.rpc("compass_shared_list"),
    ctx.isPlatformAdmin ? db.rpc("compass_platform_usage", { p_from: since, p_to: now }) : Promise.resolve({ data: [] }),
    ctx.isPlatformAdmin ? db.rpc("compass_quality_review", { p_limit: 50 }) : Promise.resolve({ data: [] }),
    ctx.isPlatformAdmin ? db.from("compass_platform_settings").select("*").maybeSingle() : Promise.resolve({ data: null }),
    ctx.isPlatformAdmin ? db.from("organizations").select("id, name").order("name").limit(500) : Promise.resolve({ data: [] }),
  ]);
  const on = ((activation.data as { stage?: string } | null)?.stage ?? "on") === "on";
  const usageRows = (usage.data ?? []) as UsageRow[];
  const reviewRows = (review.data ?? []) as ReviewRow[];
  const shareRows = (shares.data ?? []) as ShareRow[];
  const limits = { ...DEFAULT_LIMITS, ...((settings.data ?? {}) as Record<string, number>) };
  const totalQuestions = usageRows.reduce((sum, row) => sum + Number(row.questions), 0);
  const totalCost = usageRows.reduce((sum, row) => sum + Number(row.cost_micros), 0);

  return (
    <PageFrame title="Compass" description="Switch it on or off, read what customers chose to share, and watch speed, quality and cost. Conversation text never shows here unless its author shared it.">
      <Panel className="p-6">
        <h2 className={cardTitle}>{ctx.org.name}</h2>
        <div className="mt-3">
          <CompassSwitch on={on} workspaceName={ctx.org.name} />
        </div>
        <p className={`${helperClass} mt-3`}>Compass is the last activation step. It can only be on while Relay is not off.</p>
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>Shared with the team</h2>
        <p className={helperClass}>Conversations a customer shared with you. Each share ends after 7 days, and every opening is logged in the workspace.</p>
        {shareRows.length ? (
          <ul className="mt-3 divide-y divide-overlay/[0.06]">
            {shareRows.map((row) => (
              <li key={row.share_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <Link href={`/app/team/compass/shared/${row.share_id}`} className="text-sm text-strong underline">
                  {row.org_name}
                </Link>
                <span className={helperClass}>
                  Shared {formatDateTime(row.shared_at)} · ends {formatDateTime(row.expires_at)} · opened {row.view_count} times
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`${helperClass} mt-3`}>Nothing is shared with you right now.</p>
        )}
      </Panel>

      {ctx.isPlatformAdmin ? (
        <>
          <Panel className="overflow-hidden px-2 py-2 sm:px-4">
            <h2 className="px-2 pt-3 font-heading text-sm text-strong">Last 30 days</h2>
            <p className={`${helperClass} px-2`}>
              {totalQuestions} questions
              {totalQuestions ? ` · ${dollars(totalCost)} in model cost · ${dollars(Math.round(totalCost / totalQuestions))} per question` : ""}. Cost is
              measured from the tokens each answer used.
            </p>
            {usageRows.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Questions</TableHead>
                    <TableHead className="hidden md:table-cell">People</TableHead>
                    <TableHead>First words</TableHead>
                    <TableHead className="hidden lg:table-cell">Whole answer</TableHead>
                    <TableHead className="hidden md:table-cell">Errors</TableHead>
                    <TableHead className="hidden lg:table-cell">No data</TableHead>
                    <TableHead className="hidden lg:table-cell">Unchecked figures</TableHead>
                    <TableHead className="hidden md:table-cell">Limited</TableHead>
                    <TableHead className="hidden md:table-cell">Up / down</TableHead>
                    <TableHead>Per question</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageRows.map((row) => (
                    <TableRow key={row.org_id}>
                      <TableCell className="text-strong">{row.org_name}</TableCell>
                      <TableCell>{row.questions}</TableCell>
                      <TableCell className="hidden md:table-cell">{row.people}</TableCell>
                      <TableCell>{seconds(row.median_first_ms)}</TableCell>
                      <TableCell className="hidden lg:table-cell">{seconds(row.avg_ms)}</TableCell>
                      <TableCell className="hidden md:table-cell">{row.errors}</TableCell>
                      <TableCell className="hidden lg:table-cell">{row.no_data}</TableCell>
                      <TableCell className="hidden lg:table-cell">{row.unverified}</TableCell>
                      <TableCell className="hidden md:table-cell">{row.limited}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {row.up} / {row.down}
                      </TableCell>
                      <TableCell>{Number(row.questions) ? dollars(Math.round(Number(row.cost_micros) / Number(row.questions))) : "–"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className={`${helperClass} px-2 pb-3`}>No questions in the last 30 days.</p>
            )}
          </Panel>

          <Panel className="overflow-hidden px-2 py-2 sm:px-4">
            <h2 className="px-2 pt-3 font-heading text-sm text-strong">Answers worth a look</h2>
            <p className={`${helperClass} px-2`}>Errors, answers with figures Compass could not match, and thumbs down. Outcomes only, never the words.</p>
            {reviewRows.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="hidden md:table-cell">Lookups</TableHead>
                    <TableHead className="hidden lg:table-cell">Model</TableHead>
                    <TableHead>Rating</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewRows.map((row, index) => (
                    <TableRow key={`${row.at}-${index}`}>
                      <TableCell>{formatDateTime(row.at)}</TableCell>
                      <TableCell className="text-strong">
                        {row.org_name}
                        {row.staff ? <span className={helperClass}> · staff</span> : null}
                      </TableCell>
                      <TableCell>
                        {row.outcome}
                        {row.error_code ? <span className={helperClass}> · {row.error_code}</span> : null}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{(row.lookup_names ?? []).join(", ") || "–"}</TableCell>
                      <TableCell className="hidden lg:table-cell">{row.route ?? "–"}</TableCell>
                      <TableCell>{row.rating ? `${row.rating}${row.reason ? `, ${row.reason.replaceAll("_", " ")}` : ""}` : "–"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className={`${helperClass} px-2 pb-3`}>Nothing to look at.</p>
            )}
          </Panel>

          <Panel className="p-6">
            <h2 className={cardTitle}>Limits for every workspace</h2>
            <div className="mt-4">
              <CompassLimitsForm limits={limits} />
            </div>
          </Panel>

          <Panel className="p-6">
            <h2 className={cardTitle}>Limits for one workspace</h2>
            <p className={helperClass}>Raise or lower one workspace&apos;s limits. Leave a field blank to use the platform limit.</p>
            <div className="mt-4">
              <WorkspaceLimitsForm workspaces={(workspaces.data ?? []) as Array<{ id: string; name: string }>} />
            </div>
          </Panel>

          <Panel className="p-6">
            <h2 className={cardTitle}>Help articles</h2>
            <p className={helperClass}>The answers Compass gives about how Vistrial works, and the Help page shows.</p>
            <Link href="/app/team/compass/help" className="mt-3 inline-block text-sm text-brand-300 underline">
              Edit help articles
            </Link>
          </Panel>
        </>
      ) : null}
    </PageFrame>
  );
}
