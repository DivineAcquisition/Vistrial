/**
 * The Sales OS tool allowlist. Adding a tool is a code change and a migration
 * (sales_os_tool_calls.tool_name is a CHECK list). There is no generic
 * "do a thing in an external system" tool, and there never will be.
 */

export const ANALYSIS_TOOLS = [
  "analyze_funnel",
  "analyze_sources",
  "analyze_objections",
  "analyze_speed_to_lead",
  "compare_periods",
  "list_assets",
] as const;

export const ASSET_TOOLS = [
  "create_sales_script",
  "create_ad_angles",
  "create_channel_insights",
  "create_objection_responses",
] as const;

export const EXECUTION_TOOLS = [
  "post_slack_update",
  "post_discord_update",
  "save_asset_to_drive",
  "deliver_asset",
] as const;

export const SALES_OS_TOOLS = [...ANALYSIS_TOOLS, ...ASSET_TOOLS, ...EXECUTION_TOOLS] as const;

export type AnalysisToolName = (typeof ANALYSIS_TOOLS)[number];
export type AssetToolName = (typeof ASSET_TOOLS)[number];
export type ExecutionType = (typeof EXECUTION_TOOLS)[number];
export type SalesOsToolName = (typeof SALES_OS_TOOLS)[number];
export type ToolTier = "analysis" | "asset" | "execution";

export function isSalesOsTool(name: string): name is SalesOsToolName {
  return (SALES_OS_TOOLS as readonly string[]).includes(name);
}

export function isExecutionType(name: string): name is ExecutionType {
  return (EXECUTION_TOOLS as readonly string[]).includes(name);
}

export function toolTier(name: SalesOsToolName): ToolTier {
  if ((ANALYSIS_TOOLS as readonly string[]).includes(name)) return "analysis";
  if ((ASSET_TOOLS as readonly string[]).includes(name)) return "asset";
  return "execution";
}

/** What a person reads while a tool runs, and after. Never the function name. */
export const TOOL_LABELS: Record<SalesOsToolName, { running: string; done: string; failed: string }> = {
  analyze_funnel: {
    running: "Following leads from first contact to close",
    done: "Followed leads from first contact to close",
    failed: "Couldn't follow leads through the funnel",
  },
  analyze_sources: {
    running: "Comparing where leads come from",
    done: "Compared where leads come from",
    failed: "Couldn't compare lead sources",
  },
  analyze_objections: {
    running: "Reading what prospects pushed back on",
    done: "Read what prospects pushed back on",
    failed: "Couldn't read the objections",
  },
  analyze_speed_to_lead: {
    running: "Checking how fast new leads hear from you",
    done: "Checked how fast new leads hear from you",
    failed: "Couldn't check how fast leads hear from you",
  },
  compare_periods: {
    running: "Comparing this month with last month",
    done: "Compared this month with last month",
    failed: "Couldn't compare the two months",
  },
  list_assets: {
    running: "Looking through saved scripts and briefs",
    done: "Looked through saved scripts and briefs",
    failed: "Couldn't open saved scripts and briefs",
  },
  create_sales_script: {
    running: "Writing a talk track from your closed calls",
    done: "Wrote a talk track from your closed calls",
    failed: "Couldn't write the talk track",
  },
  create_ad_angles: {
    running: "Pulling ad angles from how prospects describe the problem",
    done: "Pulled ad angles from how prospects describe the problem",
    failed: "Couldn't pull ad angles",
  },
  create_channel_insights: {
    running: "Working out which channels earn more spend",
    done: "Worked out which channels earn more spend",
    failed: "Couldn't work out the channel picture",
  },
  create_objection_responses: {
    running: "Collecting how your reps answered objections in deals that closed",
    done: "Collected how your reps answered objections in deals that closed",
    failed: "Couldn't collect the objection answers",
  },
  post_slack_update: {
    running: "Getting a Slack post ready",
    done: "Slack post handled",
    failed: "The Slack post didn't go out",
  },
  post_discord_update: {
    running: "Getting a Discord post ready",
    done: "Discord post handled",
    failed: "The Discord post didn't go out",
  },
  save_asset_to_drive: {
    running: "Getting a file ready for Google Drive",
    done: "Google Drive save handled",
    failed: "The file didn't reach Google Drive",
  },
  deliver_asset: {
    running: "Getting an asset ready to send where you keep them",
    done: "Asset delivery handled",
    failed: "The asset didn't reach its destination",
  },
};

export const EXECUTION_TYPE_COPY: Record<ExecutionType, { title: string; description: string }> = {
  post_slack_update: {
    title: "Posting updates in Slack",
    description: "Vistrial writes a summary, brief, or alert and posts it in one of your Slack channels.",
  },
  post_discord_update: {
    title: "Posting updates in Discord",
    description: "Vistrial writes a summary, brief, or alert and posts it in one of your Discord channels.",
  },
  save_asset_to_drive: {
    title: "Saving files to Google Drive",
    description:
      "Vistrial saves a script or brief as a Google Doc inside a Vistrial folder in your Drive. It never opens, changes, or removes anything else there.",
  },
  deliver_asset: {
    title: "Sending finished assets where you keep them",
    description:
      "Vistrial saves the current version to your Drive folder and tells the channel you picked for new assets.",
  },
};

export const GATE_MODES = ["always_ask", "ask_first_time", "automatic"] as const;
export type GateMode = (typeof GATE_MODES)[number];

export const GATE_MODE_COPY: Record<GateMode, { title: string; description: string }> = {
  always_ask: {
    title: "Ask me every time",
    description: "Vistrial shows you exactly what it is about to do and waits for your OK.",
  },
  ask_first_time: {
    title: "Ask the first time for each place",
    description:
      "The first one to a new channel or folder waits for your OK. After you've approved one there, the rest go on their own.",
  },
  automatic: {
    title: "Go ahead without asking",
    description: "Vistrial does it straight away and records what it did. You can still read every one afterwards.",
  },
};

export const MESSAGE_KINDS = ["summary", "brief", "alert", "asset"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const MESSAGE_KIND_COPY: Record<MessageKind, { title: string; description: string }> = {
  summary: {
    title: "Summaries",
    description: "How the week or month went: leads, calls, closes, and what changed.",
  },
  brief: {
    title: "Briefs",
    description: "What the team should focus on next, and why.",
  },
  alert: {
    title: "Alerts",
    description: "Something slipped and needs a person, like leads waiting too long for a first reply.",
  },
  asset: {
    title: "New scripts and assets",
    description: "A note when a script, ad angle, or brief is ready, with a link to it.",
  },
};

export const ASSET_TYPES = ["sales_script", "ad_angles", "channel_insights", "objection_responses"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_COPY: Record<AssetType, { title: string; folder: string }> = {
  sales_script: { title: "Talk track", folder: "Talk tracks" },
  ad_angles: { title: "Ad angles", folder: "Ad angles" },
  channel_insights: { title: "Channel insights", folder: "Channel insights" },
  objection_responses: { title: "Objection answers", folder: "Objection answers" },
};

export const ASSET_TOOL_TYPE: Record<AssetToolName, AssetType> = {
  create_sales_script: "sales_script",
  create_ad_angles: "ad_angles",
  create_channel_insights: "channel_insights",
  create_objection_responses: "objection_responses",
};

export const DESTINATION_KINDS = ["slack_channel", "discord_channel", "google_drive"] as const;
export type DestinationKind = (typeof DESTINATION_KINDS)[number];

export const DESTINATION_KIND_COPY: Record<DestinationKind, string> = {
  slack_channel: "Slack channel",
  discord_channel: "Discord channel",
  google_drive: "Google Drive",
};

/**
 * Names that must never be tools. Kept as a list so a test fails if one is
 * ever added to the catalog above.
 */
export const FORBIDDEN_SALES_OS_TOOLS = [
  "send_message",
  "send_sms",
  "send_email",
  "dispatch_message",
  "approve_follow_up",
  "message_prospect",
  "delete",
  "delete_file",
  "delete_message",
  "http_request",
  "call_endpoint",
  "generic_write",
  "run_sql",
  "execute_code",
  "update_crm_record",
] as const;
