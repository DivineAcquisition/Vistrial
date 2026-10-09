import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { PageFrame } from "@/components/app/page-frame";
import { CaseFileScreen } from "@/app/(workspace)/app/cases/[id]/case-file-screen";
import { CaseRecord } from "@/components/cases/case-tools";
import { LeadLiveIndicator } from "@/components/live/handoff-pipeline";
import { ScribeCaseFile } from "@/components/live/scribe-case-file";
import { getAuthContext } from "@/lib/auth/session";
import { loadPrecallBrief } from "@/lib/brief/load";
import { loadCaseActivity } from "@/lib/cases/experience-load";
import { isLeadId } from "@/lib/cases/filters";
import { loadOrgCaseFile } from "@/lib/cases/load";
import { loadLeadPipeline } from "@/lib/live/load";
import { loadScribeCaseFile } from "@/lib/scribe/case-file";
import { DEFAULT_READY_THRESHOLD, loadScoreConfig } from "@/lib/scoring/store";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { throwIfForcedRouteError } from "@/lib/route-error";

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  throwIfForcedRouteError(query.forceError);
  if (!isLeadId(id)) notFound();

  const [payload, brief, ctx] = await Promise.all([loadOrgCaseFile(id), loadPrecallBrief(id), getAuthContext()]);
  if (!payload) notFound();
  const db = (await createClient()) as unknown as SupabaseClient;
  const [scoreConfig, pipeline, scribeFile, notes, flag, optOut, settings, activity] = await Promise.all([
    loadScoreConfig(getSupabaseAdmin(), payload.lead.orgId).catch(() => null),
    loadLeadPipeline(payload.lead.orgId, payload.lead.id).catch(() => ({ runs: [], waiting: [] })),
    loadScribeCaseFile(payload.lead.orgId, payload.lead.id).catch(() => null),
    db.from("lead_notes").select("id, body, visibility, created_at").eq("org_id", ctx.org.id).eq("lead_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("leads").select("do_not_contact, do_not_contact_reason, merged_into").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    db.from("lead_opt_outs").select("lead_id").eq("lead_id", id).eq("org_id", ctx.org.id).maybeSingle(),
    db.rpc("case_list_settings", { p_org_id: ctx.org.id }),
    loadCaseActivity(ctx.org.id, id, ctx.isStaff).catch(() => []),
  ]);
  const windowMinutes = Number((settings.data as { windowMinutes?: number } | null)?.windowMinutes) || payload.lead.speedToLeadMinutes || 15;
  const timezone = String((settings.data as { timezone?: string } | null)?.timezone || "the workspace time zone");
  const leadFlag = flag.data as { do_not_contact?: boolean; do_not_contact_reason?: string | null; merged_into?: string | null } | null;

  return (
    <PageFrame
      title={payload.lead.name}
      description="Who this is, how ready they are, and what to do next."
      breadcrumbs={[
        { href: "/app/cases", label: "People" },
        { href: `/app/cases/${payload.lead.id}`, label: payload.lead.name },
      ]}
    >
      <LeadLiveIndicator leadId={payload.lead.id} className="mb-3" />
      <CaseRecord
        leadId={payload.lead.id}
        leadName={payload.lead.name}
        optedOut={Boolean(optOut.data)}
        doNotContact={leadFlag?.do_not_contact === true}
        doNotContactReason={leadFlag?.do_not_contact_reason ?? null}
        mergedInto={leadFlag?.merged_into ?? null}
        paused={ctx.org.status === "paused" || ctx.org.status === "closed"}
        partial={scribeFile?.status === "needs_review" || scribeFile?.status === "held"}
        windowMinutes={windowMinutes}
        timezone={timezone}
        firstHumanTouchAt={payload.lead.firstHumanTouchAt}
        optedInAt={payload.lead.optedInAt}
        drafts={payload.pendingFollowUps}
        pipelineRuns={pipeline.runs}
        pipelineWaiting={pipeline.waiting}
        canClear={ctx.isStaff || ctx.workspaceRole === "owner" || ctx.isPlatformAdmin}
        canWrite={ctx.workspaceRole !== "member" || ctx.isStaff}
        staff={ctx.isStaff}
        notes={((notes.data ?? []) as Array<{ id: string; body: string; visibility: string; created_at: string }>).map((note) => ({
          id: note.id,
          body: note.body,
          visibility: note.visibility,
          createdAt: note.created_at,
        }))}
        overview={
          <>
            <ScribeCaseFile leadId={payload.lead.id} initial={scribeFile} />
            <CaseFileScreen initial={payload} brief={brief} readyThreshold={scoreConfig?.readyThreshold ?? DEFAULT_READY_THRESHOLD} />
          </>
        }
        timeline={
          <ol className="space-y-3">
            {payload.timeline.entries.length === 0 ? <li className="text-sm text-muted-foreground">Nothing has happened yet.</li> : null}
            {payload.timeline.entries.map((entry) => (
              <li key={`${entry.kind}-${entry.id}`} className="rounded-md border border-border p-3 text-sm">
                <p className="text-xs text-muted-foreground">{entry.at.slice(0, 16).replace("T", " ")} · {entry.kind === "touch" ? (entry.touchType === "human" ? "A person" : "Automated") : entry.kind}</p>
                <p>
                  {entry.kind === "touch"
                    ? `${entry.channel} ${entry.direction}${entry.outcome ? `, ${entry.outcome.replaceAll("_", " ")}` : ""}${entry.actorName ? ` · ${entry.actorName}` : ""}`
                    : entry.kind === "call"
                      ? `${entry.callType} call${entry.outcome ? `, ${entry.outcome}` : ""}${entry.actorName ? ` · ${entry.actorName}` : ""}`
                      : entry.kind === "status"
                        ? `Stage changed to ${entry.toStatus.replaceAll("_", " ")}`
                        : entry.headline}
                </p>
                {entry.kind === "call" ? (
                  <Link className="text-xs underline" href={`/app/calls/${entry.id}`}>Open the call</Link>
                ) : null}
              </li>
            ))}
          </ol>
        }
        files={
          <div className="space-y-3">
            {payload.calls.length === 0 && payload.files.length === 0 ? <p className="text-sm text-muted-foreground">No transcripts or files yet.</p> : null}
            {payload.calls.map((call) => (
              <p key={call.id} className="text-sm">
                <Link className="underline" href={`/app/calls/${call.id}`}>{call.type} call</Link>
                <span className="text-muted-foreground"> · {call.hasTranscript ? "Transcript ready" : call.extractionStatus === "pending" ? "Processing" : call.extractionStatus === "failed" ? "Could not read" : "No transcript"}</span>
              </p>
            ))}
            {payload.files.map((file) => (
              <p key={file.id} className="text-sm">
                <Link className="underline" href={`/app/cases/${id}/files/${file.id}`}>{file.fileName}</Link>
              </p>
            ))}
          </div>
        }
        activity={
          <ol className="space-y-2">
            {activity.length === 0 ? <li className="text-sm text-muted-foreground">No recorded activity yet.</li> : null}
            {activity.map((item) => (
              <li key={item.id} className="text-sm">
                <span className="text-muted-foreground">{item.created_at.slice(0, 16).replace("T", " ")} · </span>
                {item.actor_label ?? "Vistrial"} · {item.action.replaceAll(".", " ").replaceAll("_", " ")}
              </li>
            ))}
          </ol>
        }
      />
    </PageFrame>
  );
}
