export const SETTINGS_SECTIONS = [
  "organization",
  "members",
  "scoring",
  "integrations",
  "follow_up",
  "data",
  "activation",
  "managed",
  "agent",
  "notifications",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const SETTINGS_ACTOR_KINDS = ["member", "da_operator", "system"] as const;
export type SettingsActorKind = (typeof SETTINGS_ACTOR_KINDS)[number];

export const MANAGED_ADVANCED_PLAIN =
  "These settings are managed by your install team at Divine Acquisition. Email your install contact to request a change. Taking over management is available to an owner and makes this workspace responsible for scoring, routing, and contact rules.";

export const ADVANCED_ENTRY_PLAIN =
  "These settings change how leads are scored, routed, and contacted. Changes take effect immediately for the whole team.";

export const BUSINESS_HOURS_EFFECT =
  "Business hours control when notifications fire, when follow-up is allowed to send, and how response time is measured.";

export const SENSITIVITY_EFFECT =
  "More leads flagged ready versus fewer, higher-confidence. This only moves the ready bar. Weights stay as they are.";

export const ORG_STOP_EFFECT =
  "Stops every further sequence step and outbound dispatch for this workspace. Already-approved drafts that are sending still go out. Nothing here can take this control away.";
