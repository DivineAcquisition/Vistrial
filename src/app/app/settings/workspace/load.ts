import { loadFollowUpSettings, loadVoiceProfile } from "@/lib/follow-up/load";
import { loadOrgIngestionHealth } from "@/lib/ghl/health";
import { parseVoiceSamplePreview, type VoiceSamplePreview } from "@/lib/settings/sample";
import { loadScoreConfig } from "@/lib/scoring/store";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { MembersPanelInvite, MembersPanelMember } from "@/app/app/settings/members/members-panel";
import type { AuthContext } from "@/lib/auth/types";
import type { VoiceExample } from "@/lib/follow-up/types";
import type { Json } from "@/types/database";

export type WorkspaceConnectionCard = {
  key: "ghl" | "slack" | "teams" | "sms";
  title: string;
  connected: boolean;
  healthy: boolean;
  lastReceivedLabel: string | null;
};

function hoursAgoLabel(iso: string | null, now: string): string | null {
  if (!iso) return null;
  const mins = Math.round((Date.parse(now) - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export async function loadWorkspaceSettings(ctx: AuthContext) {
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const orgId = ctx.org.id;
  const now = new Date().toISOString();

  const [
    orgRow,
    members,
    invites,
    platformAdmins,
    followUp,
    voiceRow,
    scoring,
    health,
    teamChannels,
    leads,
    sentDrafts,
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "name, timezone, working_hours_start, working_hours_end, working_days, managed, sms_emergencies_enabled"
      )
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("org_members")
      .select(
        "id, display_name, email, role, active, user_id, logged_outcome_from_mobile_at, last_seen_at"
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
    supabase
      .from("org_invites")
      .select("id, email, role, token, expires_at")
      .eq("org_id", orgId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("platform_admins").select("user_id"),
    loadFollowUpSettings(orgId),
    supabase.from("org_voice_profiles").select("examples, sample_preview").eq("org_id", orgId).maybeSingle(),
    loadScoreConfig(supabase, orgId),
    loadOrgIngestionHealth(admin, orgId),
    supabase
      .from("notification_team_channels")
      .select("slack_webhook_encrypted, teams_webhook_encrypted")
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase.from("leads").select("status, lead_type").eq("org_id", orgId),
    supabase
      .from("follow_up_drafts")
      .select("id, sent_body, channel, lead_id")
      .eq("org_id", orgId)
      .eq("status", "sent")
      .not("sent_body", "is", null)
      .order("sent_at", { ascending: false })
      .limit(8),
  ]);

  const open = new Set(["new", "working", "nurture"]);
  const tracks = { ready: 0, nurture: 0 };
  for (const lead of leads.data ?? []) {
    if (!open.has(lead.status)) continue;
    if (lead.lead_type === "ready_track") tracks.ready += 1;
    else tracks.nurture += 1;
  }

  const ghlConnected = health.connectionStatus === "active";
  const ghlHealthy = ghlConnected && !health.stale && health.connectionStatus === "active";
  const slackOn = Boolean(teamChannels.data?.slack_webhook_encrypted);
  const teamsOn = Boolean(teamChannels.data?.teams_webhook_encrypted);

  const connections: WorkspaceConnectionCard[] = [
    {
      key: "ghl",
      title: "GoHighLevel",
      connected: ghlConnected || health.connectionStatus === "broken",
      healthy: ghlHealthy,
      lastReceivedLabel: hoursAgoLabel(health.lastProcessedAt, now),
    },
    {
      key: "slack",
      title: "Slack",
      connected: slackOn,
      healthy: slackOn,
      lastReceivedLabel: null,
    },
    {
      key: "teams",
      title: "Microsoft Teams",
      connected: teamsOn,
      healthy: teamsOn,
      lastReceivedLabel: null,
    },
    {
      key: "sms",
      title: "Emergency SMS",
          connected: Boolean(orgRow.data?.sms_emergencies_enabled),
          healthy: Boolean(orgRow.data?.sms_emergencies_enabled),
      lastReceivedLabel: null,
    },
  ];

  const voice = await loadVoiceProfile(orgId);
  const sample = parseVoiceSamplePreview(voiceRow.data?.sample_preview as Json | null);

  const sentLeadIds = [...new Set((sentDrafts.data ?? []).map((row) => row.lead_id))];
  const { data: sentLeads } =
    sentLeadIds.length > 0
      ? await supabase
          .from("leads")
          .select("id, first_name, last_name, email")
          .eq("org_id", orgId)
          .in("id", sentLeadIds)
      : { data: [] };
  const sentNameById = new Map(
    (sentLeads ?? []).map((lead) => [
      lead.id,
      [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() || lead.email || "Unnamed lead",
    ])
  );
  const sent = (sentDrafts.data ?? [])
    .filter((row) => row.sent_body)
    .map((row) => ({
      id: row.id,
      body: row.sent_body as string,
      channel: (row.channel === "email" ? "email" : "sms") as "sms" | "email",
      leadName: sentNameById.get(row.lead_id) ?? "Unnamed lead",
    }));

  return {
    org: {
      name: orgRow.data?.name ?? ctx.org.name,
      timezone: orgRow.data?.timezone ?? ctx.org.timezone,
      workingHoursStart: orgRow.data?.working_hours_start?.slice(0, 5) ?? "08:00",
      workingHoursEnd: orgRow.data?.working_hours_end?.slice(0, 5) ?? "18:00",
      workingDays: orgRow.data?.working_days ?? [1, 2, 3, 4, 5],
      managed: orgRow.data?.managed ?? true,
    },
    role: ctx.role,
    isPlatformAdmin: ctx.isPlatformAdmin,
    members: (members.data ?? []) as MembersPanelMember[],
    invites: (invites.data ?? []) as MembersPanelInvite[],
    platformAdminIds: new Set((platformAdmins.data ?? []).map((row) => row.user_id)),
    followUp,
    examples: voice.examples as VoiceExample[],
    sent,
    sample,
    scoring,
    tracks,
    readySentence: `Leads scoring ${scoring.readyThreshold} or above that arrived within the last ${scoring.speedToLeadMinutes} working minutes are treated as ready.`,
    responseTarget: `Respond to ready leads within ${scoring.speedToLeadMinutes} working minutes.`,
    connections,
    stalled: health.stale,
    stalledReason: health.staleReason,
    ghlStatus: health.connectionStatus,
    samplePreview: sample as VoiceSamplePreview | null,
    now,
  };
}
