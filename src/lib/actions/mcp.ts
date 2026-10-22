import { actionDef, type ActionName } from "@/lib/actions/registry";

/**
 * MCP servers agents may reach (decision 3: a curated list only; workspaces
 * cannot add their own). Every tool a server exposes is mapped to a named
 * action or blocked. A tool that is not listed is blocked. A tool result is
 * data for the agent, never instructions.
 */

export type McpServer = {
  id: string;
  label: string;
  connector: string;
  /** Tool name to the named action it performs, or null when blocked on purpose. */
  tools: Record<string, ActionName | null>;
};

export const MCP_SERVERS: McpServer[] = [
  {
    id: "hubspot",
    label: "HubSpot",
    connector: "hubspot",
    tools: {
      search_crm_objects: "crm.search",
      get_crm_object: "crm.fetch_record",
      update_crm_object: "crm.update_field",
      update_deal_stage: "crm.move_stage",
      create_task: "crm.create_task",
      create_note: "crm.add_note",
      delete_crm_object: null,
      send_marketing_email: null,
      batch_update_crm_objects: null,
    },
  },
  {
    id: "google_workspace",
    label: "Google Workspace",
    connector: "google_workspace",
    tools: {
      calendar_list_events: "calendar.list_events",
      calendar_create_event: "calendar.create_hold",
      docs_create_document: "docs.upsert",
      docs_update_document: "docs.upsert",
      sheets_upsert_row: "sheets.upsert_row",
      gmail_send_message: null,
      gmail_read_message: null,
      drive_delete_file: null,
      drive_share_file: null,
    },
  },
  {
    id: "airtable",
    label: "Airtable",
    connector: "airtable",
    tools: {
      search_records: "airtable.search",
      create_record: "airtable.upsert_record",
      update_records: "airtable.upsert_record",
      delete_records: null,
      create_table: null,
    },
  },
  {
    id: "fathom",
    label: "Fathom",
    connector: "fathom",
    tools: { get_meeting: "calls.fetch_meeting", list_meetings: null },
  },
  {
    id: "fireflies",
    label: "Fireflies",
    connector: "fireflies",
    tools: { get_transcript_summary: "calls.fetch_meeting", delete_transcript: null },
  },
];

export type McpDecision = { allowed: true; action: ActionName } | { allowed: false; reason: "server_not_listed" | "tool_not_mapped" | "tool_blocked" };

export function mapMcpTool(serverId: string, tool: string): McpDecision {
  const server = MCP_SERVERS.find((candidate) => candidate.id === serverId);
  if (!server) return { allowed: false, reason: "server_not_listed" };
  if (!Object.prototype.hasOwnProperty.call(server.tools, tool)) return { allowed: false, reason: "tool_not_mapped" };
  const action = server.tools[tool];
  if (!action || !actionDef(action)) return { allowed: false, reason: "tool_blocked" };
  return { allowed: true, action };
}
