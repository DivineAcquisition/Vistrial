import { WorkspaceBasicsForm } from "@/app/app/settings/workspace/workspace-basics-form";
import { WorkspaceConnections, WorkspaceLocationPicker } from "@/app/app/settings/workspace/workspace-connections";
import { SensitivityForm } from "@/app/app/settings/workspace/sensitivity-form";
import { OrgStopForm } from "@/app/app/settings/workspace/org-stop-form";
import { loadWorkspaceSettings } from "@/app/app/settings/workspace/load";
import { MembersPanel } from "@/app/app/settings/members/members-panel";
import { VoiceExamplesPanel } from "@/app/app/settings/follow-up/voice-examples-panel";
import { SampleDraftPanel } from "@/app/app/settings/follow-up/sample-draft-panel";
import { PageFrame } from "@/components/app/page-frame";
import { SettingsDirtyRoot } from "@/components/app/unsaved-changes-guard";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { Notice } from "@/components/ui/states";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { listSessionLocations } from "@/lib/ghl/connect";
import { ghlOAuthConfigured } from "@/lib/ghl/env";
import { canWriteAdvancedSettings } from "@/lib/settings/managed";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cardTitle, helperClass } from "@/lib/ui";

export default async function WorkspaceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ghl_error?: string; connected?: string; select_location?: string }>;
}) {
  const ctx = await requireOrgSettingsManager();
  const params = await searchParams;
  const data = await loadWorkspaceSettings(ctx);
  const writableAdvanced = canWriteAdvancedSettings(ctx, data.org.managed);
  const locations =
    params.select_location === "1"
      ? await listSessionLocations(getSupabaseAdmin(), ctx.org.id, ctx.member.id)
      : [];

  return (
    <PageFrame
      title="Workspace"
      description="Team, connections, and how leads are prioritized. Most businesses never need the advanced screen."
    >
      <SettingsDirtyRoot>
        <div className="space-y-10">
          {data.stalled ? (
            <Notice tone="critical" title="Ingestion has stalled">
              {data.stalledReason ??
                "Nothing new has arrived from GoHighLevel in the expected window, while the queue still looks calm. Check the connection before the team works a stale list."}
            </Notice>
          ) : null}

          {params.ghl_error ? (
            <Notice tone="critical" title="GoHighLevel did not connect">
              Start again from the connection card below.
            </Notice>
          ) : null}
          {params.connected === "1" ? (
            <Notice tone="success" title="GoHighLevel is connected">
              Field mapping and retries live in Advanced.
            </Notice>
          ) : null}

          {params.select_location === "1" ? (
            <Panel className="p-6">
              <h2 className={cardTitle}>Choose a GoHighLevel location</h2>
              <p className={helperClass}>Agency access was granted. Link exactly one location to this workspace.</p>
              <div className="mt-4">
                <WorkspaceLocationPicker locations={locations} />
              </div>
            </Panel>
          ) : null}

          <section>
            <SectionHeader
              title="Business basics"
              hint="Name, timezone, and hours. Hours are not decoration."
            />
            <WorkspaceBasicsForm
              name={data.org.name}
              timezone={data.org.timezone}
              workingHoursStart={data.org.workingHoursStart}
              workingHoursEnd={data.org.workingHoursEnd}
              workingDays={data.org.workingDays}
            />
          </section>

          <section>
            <SectionHeader title="Team" hint="Who is on the team, their role, invite, and deactivate." />
            <MembersPanel
              members={data.members}
              invites={data.invites}
              platformAdminIds={data.platformAdminIds}
              viewerRole={data.role}
              isPlatformAdmin={data.isPlatformAdmin}
              now={data.now}
            />
          </section>

          <section>
            <SectionHeader
              title="Connections"
              hint="Connected or not, whether it is healthy, and when it last received something."
            />
            <Panel className="p-6">
              <WorkspaceConnections
                cards={data.connections}
                ghlStatus={data.ghlStatus}
                oauthConfigured={ghlOAuthConfigured()}
              />
            </Panel>
          </section>

          <section>
            <SectionHeader
              title="How leads are prioritized"
              hint="What the system treats as ready, how many are in each track, and the response-time target."
            />
            <Panel className="p-6 space-y-4">
              <p className="text-sm text-white">{data.readySentence}</p>
              <p className={helperClass}>
                Ready {data.tracks.ready} · Nurture {data.tracks.nurture}
              </p>
              <p className={helperClass}>{data.responseTarget}</p>
              <SensitivityForm
                config={{
                  timeline: data.scoring.weights.timeline,
                  investment_capacity: data.scoring.weights.investment_capacity,
                  decision_authority: data.scoring.weights.decision_authority,
                  pain_severity: data.scoring.weights.pain_severity,
                  readyThreshold: data.scoring.readyThreshold,
                  speedToLeadMinutes: data.scoring.speedToLeadMinutes,
                  ghostDaysSoft: data.scoring.ghostDaysSoft,
                  ghostDaysHard: data.scoring.ghostDaysHard,
                }}
                writable={writableAdvanced}
                managed={data.org.managed}
              />
              <p>
                <a href="/app/settings/advanced/scoring" className="text-sm text-white underline">
                  Advanced scoring settings
                </a>
              </p>
            </Panel>
          </section>

          <section>
            <SectionHeader
              title="Follow-up voice"
              hint="Paste what this business actually sent. These examples matter more than every slider in Advanced."
            />
            <Panel className="p-6 space-y-6">
              <VoiceExamplesPanel examples={data.examples} sent={data.sent} />
              <SampleDraftPanel preview={data.samplePreview} />
            </Panel>
          </section>

          <section>
            <SectionHeader title="Stop all outbound" hint="In an emergency this is the control. It is never locked." />
            <Panel className="p-6">
              <OrgStopForm halted={data.followUp.sequencesHalted} />
            </Panel>
          </section>
        </div>
      </SettingsDirtyRoot>
    </PageFrame>
  );
}
