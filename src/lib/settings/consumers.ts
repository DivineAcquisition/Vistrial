/**
 * Every persisted org/member setting and the code that reads it.
 * A row with no consumer is an orphan and must not ship.
 */
export const SETTINGS_CONSUMERS = [
  { key: "organizations.name", readBy: ["session org switcher", "export", "deletion confirmation"] },
  { key: "organizations.timezone", readBy: ["ghost detector", "follow-up send-at", "notifications"] },
  { key: "organizations.working_hours_*", readBy: ["notifications", "follow-up send-at", "speed-to-lead observation"] },
  { key: "organizations.working_days", readBy: ["notifications", "follow-up send-at"] },
  { key: "organizations.sales_cycle_days", readBy: ["reporting cohorts"] },
  { key: "organizations.baseline_lookback_days", readBy: ["baseline backfill"] },
  { key: "organizations.transcript_retention_days", readBy: ["retention job"] },
  { key: "organizations.call_coaching_embargo_hours", readBy: ["call coaching visibility"] },
  { key: "organizations.operator_agent_batch_cap", readBy: ["operator agent"] },
  { key: "organizations.holdout_percent", readBy: ["holdout assignment"] },
  { key: "organizations.managed", readBy: ["advanced write gate"] },
  { key: "organizations.managed_taken_over_at", readBy: ["advanced layout"] },
  { key: "organizations.sms_emergencies_enabled", readBy: ["notification observe"] },
  { key: "organizations.activated_at", readBy: ["reporting", "activation gate"] },
  { key: "follow_up_settings.sequences_halted", readBy: ["drafting", "dispatch", "workspace stop"] },
  { key: "notification_team_channels", readBy: ["notification observe"] },
  { key: "score_configs.*", readBy: ["scoring compute", "queue alarm", "ghost detector", "preview"] },
  { key: "score_field_maps", readBy: ["extractFactors"] },
  { key: "ghl_field_maps", readBy: ["ingestion scoring"] },
  { key: "follow_up_settings.*", readBy: ["drafting", "dispatch", "quiet hours"] },
  { key: "org_voice_profiles.*", readBy: ["follow-up generate", "workspace sample"] },
  { key: "notification_preferences", readBy: ["notification offer"] },
  { key: "notification_mutes", readBy: ["notification offer"] },
  { key: "org_members.working_hours_*", readBy: ["notification hours"] },
  { key: "org_members.last_seen_at", readBy: ["workspace members"] },
  { key: "business_profiles.aggregate_opt_out", readBy: ["cross-client aggregates"] },
  { key: "settings_activity", readBy: ["advanced activity log"] },
] as const;
