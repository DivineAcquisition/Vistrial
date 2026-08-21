export const SETUP_STEPS = [
  "organization",
  "crm",
  "backfill",
  "field_mapping",
  "scoring",
  "team",
  "transcripts",
  "voice",
  "review",
] as const;

export type SetupStepId = (typeof SETUP_STEPS)[number];

export const GOLIVE_CONTACT_PREFIX = "vistrial-golive-";
export const GOLIVE_SOURCE = "vistrial_golive";
export const SPEED_TO_LEAD_WIDE_MINUTES = 60;
export const CRM_VERIFY_WINDOW_MS = 60 * 60 * 1000;
export const ZERO_INGEST_WARNING_HOURS = 24;
export const ACTIVATION_OVERRIDE_PHRASE = "ACTIVATE";

export const HARD_REQUIREMENT_IDS = [
  "crm_verified",
  "backfill_resolved",
  "field_mapping",
  "scoring_config",
  "worker_member",
] as const;

export const WARNING_IDS = [
  "no_voice_examples",
  "no_transcript_source",
  "thin_team",
  "wide_speed_to_lead",
  "partial_backfill",
] as const;

export type HardRequirementId = (typeof HARD_REQUIREMENT_IDS)[number];
export type WarningId = (typeof WARNING_IDS)[number];

export const SETUP_STEP_COPY: Record<
  SetupStepId,
  { title: string; why: string; href: string }
> = {
  organization: {
    title: "Organization basics",
    why: "Timezone first. Every threshold, quiet hour, and ghost calculation evaluates against it.",
    href: "/app/setup?step=organization",
  },
  crm: {
    title: "Connect the CRM",
    why: "Nothing meaningful can proceed without the location this workspace will actually run on.",
    href: "/app/setup?step=crm",
  },
  backfill: {
    title: "Baseline backfill",
    why: "Activation divides baseline from measured. If this has not resolved, there is no before-figure later.",
    href: "/app/setup?step=backfill",
  },
  field_mapping: {
    title: "Field mapping",
    why: "Scoring reads application answers. Those answers only exist if this location's CRM fields are mapped.",
    href: "/app/setup?step=field_mapping",
  },
  scoring: {
    title: "Scoring configuration",
    why: "Changing a threshold is a decision about who gets called today. Defaults already work if you change nothing.",
    href: "/app/setup?step=scoring",
  },
  team: {
    title: "Team",
    why: "Setters see their assigned leads. Closers see theirs. Admins can change configuration. Owners over-assign admin when that difference is not stated.",
    href: "/app/setup?step=team",
  },
  transcripts: {
    title: "Transcript source",
    why: "A recorder feeds extraction, briefs, and grounded follow-up. Manual paste still works. An unsupported recorder is not a blocker.",
    href: "/app/setup?step=transcripts",
  },
  voice: {
    title: "Voice profile",
    why: "Two to five messages this team has actually sent matter more than formality sliders. Without them, drafts read generic.",
    href: "/app/setup?step=voice",
  },
  review: {
    title: "Review and activate",
    why: "Activation is earned. It stamps the timestamp that every outcome number is measured from, once.",
    href: "/app/setup?step=review",
  },
};

export const ROLE_EXPLANATIONS = {
  owner: "Sees everything, including revenue and activation. Can invite, configure, and go live.",
  admin: "Same configuration access as owner. Cannot be the last owner. Use this for operators who run the workspace, not for every setter.",
  closer: "Works assigned leads, logs outcomes, opens case files and briefs. Cannot change scoring, CRM, or members.",
  setter: "Works assigned leads and logs touches. Cannot change scoring, CRM, or members.",
} as const;
