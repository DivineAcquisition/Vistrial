/**
 * The three write destinations. Each is its own named operation: there is
 * deliberately no "post to any service" abstraction.
 */

export const EXECUTION_KINDS = ["slack", "discord", "google_drive"] as const;
export type ExecutionKind = (typeof EXECUTION_KINDS)[number];

export function isExecutionKind(value: unknown): value is ExecutionKind {
  return typeof value === "string" && (EXECUTION_KINDS as readonly string[]).includes(value);
}

export const EXECUTION_OPERATIONS = ["slack.post_message", "discord.post_message", "drive.store_asset"] as const;
export type ExecutionOperation = (typeof EXECUTION_OPERATIONS)[number];

/** Approval action types, matching rows in public.approval_action_types. */
export const EXECUTION_ACTION_TYPES = {
  slack: "slack_post",
  discord: "discord_post",
  google_drive: "drive_store",
} as const satisfies Record<ExecutionKind, string>;

export const EXECUTION_OPERATION_FOR = {
  slack: "slack.post_message",
  discord: "discord.post_message",
  google_drive: "drive.store_asset",
} as const satisfies Record<ExecutionKind, ExecutionOperation>;

export const EXECUTION_TITLES: Record<ExecutionKind, string> = {
  slack: "Slack",
  discord: "Discord",
  google_drive: "Google Drive",
};

/** What each connection can do, in the words shown under the Connect button. */
export const EXECUTION_SCOPE_LINES: Record<ExecutionKind, string> = {
  slack: "Posts to one channel you choose. Cannot read messages, message people, or react.",
  discord: "Posts to one channel you choose. Cannot read messages or manage your server.",
  google_drive:
    "Works only inside one folder you choose. Cannot see or change anything else in your Drive.",
};

export const EXECUTION_UNLOCKS: Record<ExecutionKind, string> = {
  slack: "Send approved updates to your team's Slack channel.",
  discord: "Send approved updates to your team's Discord channel.",
  google_drive: "File approved assets in a folder of your Drive.",
};

/** Provider scopes. Adding to any of these is a new decision, not a quiet edit. */
export const SLACK_BOT_SCOPES = ["chat:write", "channels:read", "channels:join"] as const;

/** View Channels (1 << 10) and Send Messages (1 << 11). Never Administrator (1 << 3). */
export const DISCORD_VIEW_CHANNEL = 1 << 10;
export const DISCORD_SEND_MESSAGES = 1 << 11;
export const DISCORD_ADMINISTRATOR = 1 << 3;
export const DISCORD_PERMISSIONS = DISCORD_VIEW_CHANNEL | DISCORD_SEND_MESSAGES;

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
