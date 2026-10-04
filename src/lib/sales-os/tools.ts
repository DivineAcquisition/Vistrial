import "server-only";

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import {
  analyzeFunnel,
  analyzeObjections,
  analyzeResponseSpeed,
  analyzeSources,
  comparePeriods,
} from "@/lib/sales-os/analysis";
import type { AssetToolResult, AssetView } from "@/lib/sales-os/asset-types";
import {
  createAdAngles,
  createChannelInsights,
  createObjectionResponses,
  createSalesScript,
  listAssets,
  type AssetActor,
} from "@/lib/sales-os/assets";
import { ASSET_TYPES, type ExecutionType, type SalesOsToolName } from "@/lib/sales-os/catalog";
import { priorWindow, windowDays } from "@/lib/sales-os/data";
import { clampDays, loadDataset } from "@/lib/sales-os/dataset";
import { requestApprovalIfNeeded, runExecution, type ExecActor } from "@/lib/sales-os/executions/run";
import type { ExecutionToolResult } from "@/lib/sales-os/executions/types";
import { finishToolCall, recordToolCall, type ToolCallEndState } from "@/lib/sales-os/persist";
import type { SalesOsActor } from "@/lib/sales-os/session";

const days = (fallback: number, description: string) =>
  z.number().int().min(7).max(365).optional().describe(`${description} Defaults to ${fallback}.`);

export type AssetListResult = { kind: "asset_list"; assets: AssetView[]; message: string };

function endState(output: unknown): ToolCallEndState {
  const rec = output as { kind?: string; status?: string; enough?: boolean };
  if (rec?.kind === "asset") {
    if (rec.status === "permission") return "permission";
    if (rec.status === "insufficient_data") return "insufficient_data";
    return "done";
  }
  if (rec?.kind === "execution") {
    if (rec.status === "succeeded") return "done";
    if (rec.status === "permission") return "permission";
    if (rec.status === "rejected") return "rejected";
    if (rec.status === "awaiting_approval") return "awaiting_approval";
    return "failed";
  }
  if (rec?.kind === "finding" && rec.enough === false) return "insufficient_data";
  return "done";
}

export function buildSalesOsTools(actor: SalesOsActor, conversationId: string): ToolSet {
  const record =
    <I, O>(name: SalesOsToolName, run: (input: I, toolCallId: string) => Promise<O>) =>
    async (input: I, options: { toolCallId: string }): Promise<O> => {
      await recordToolCall(actor, conversationId, { toolCallId: options.toolCallId, toolName: name, input, state: "running" });
      try {
        const output = await run(input, options.toolCallId);
        await finishToolCall(actor, conversationId, { toolCallId: options.toolCallId, toolName: name, state: endState(output), output });
        return output;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Something went wrong.";
        await finishToolCall(actor, conversationId, {
          toolCallId: options.toolCallId,
          toolName: name,
          state: "failed",
          output: null,
          error: message,
        });
        throw new Error(message);
      }
    };

  const assetActor: AssetActor = { ...actor, conversationId };
  const execActor: ExecActor = { ...actor, conversationId };

  const tools: ToolSet = {
    analyze_funnel: tool({
      description:
        "Follow leads that arrived in a period through each step: reached by a person, booked a call, showed up, closed. Says where they drop off and where lost leads were when they went cold. Read only.",
      inputSchema: z.object({ days: days(90, "How many days back to look.") }),
      execute: record("analyze_funnel", async (input: { days?: number }) =>
        analyzeFunnel(await loadDataset(actor, windowDays(clampDays(input.days, 90)), { touches: false }))
      ),
    }),
    analyze_sources: tool({
      description:
        "Compare lead sources: which ones send leads, and which ones' leads go on to book, show, and close (and revenue when this person may see it). Read only.",
      inputSchema: z.object({ days: days(90, "How many days back to look.") }),
      execute: record("analyze_sources", async (input: { days?: number }) =>
        analyzeSources(await loadDataset(actor, windowDays(clampDays(input.days, 90)), { touches: false }))
      ),
    }),
    analyze_objections: tool({
      description:
        "What prospects pushed back on, in their own words, how often, and how those deals ended. Includes reasons leads were disqualified on intake and the team's notes on lost deals. Read only.",
      inputSchema: z.object({ days: days(90, "How many days back to look.") }),
      execute: record("analyze_objections", async (input: { days?: number }) =>
        analyzeObjections(await loadDataset(actor, windowDays(clampDays(input.days, 90)), { touches: false }))
      ),
    }),
    analyze_speed_to_lead: tool({
      description:
        "How quickly new leads first heard from a person, how many never did, against the client's own target, and whether reply time lines up with booking and closing in their data. Read only.",
      inputSchema: z.object({ days: days(30, "How many days back to look.") }),
      execute: record("analyze_speed_to_lead", async (input: { days?: number }) =>
        analyzeResponseSpeed(await loadDataset(actor, windowDays(clampDays(input.days, 30))))
      ),
    }),
    compare_periods: tool({
      description: "Compare the most recent period with the one before it: leads, reply speed, calls, no-shows, closes, objections. Read only.",
      inputSchema: z.object({ days: days(30, "Length of each period in days.") }),
      execute: record("compare_periods", async (input: { days?: number }) => {
        const length = clampDays(input.days, 30);
        const current = windowDays(length);
        const previous = priorWindow(current);
        const data = await loadDataset(actor, { from: previous.from, to: current.to }, { touches: false });
        return comparePeriods(data, current, previous);
      }),
    }),
    list_assets: tool({
      description: "List saved talk tracks, ad angles, channel insights, and objection answers with their version, date, and what they were built from.",
      inputSchema: z.object({
        type: z.enum(ASSET_TYPES).optional(),
        includeOld: z.boolean().optional().describe("Include replaced versions too."),
      }),
      execute: record("list_assets", async (input: { type?: (typeof ASSET_TYPES)[number]; includeOld?: boolean }): Promise<AssetListResult> => {
        const assets = await listAssets(actor, { type: input.type, includeOld: input.includeOld });
        return {
          kind: "asset_list",
          assets,
          message: assets.length ? `${assets.length} saved.` : "Nothing saved yet.",
        };
      }),
    }),
  };

  if (actor.canWriteAssets) {
    Object.assign(tools, {
      create_sales_script: tool({
        description:
          "Write a talk track from what reps actually said in this client's calls from deals that closed. Saved in Vistrial for review; not sent anywhere. Refuses when there are too few closed calls.",
        inputSchema: z.object({
          days: days(180, "How far back to look for closed deals."),
          focus: z.string().max(200).optional().describe("Optional: a part of the call to focus on."),
        }),
        execute: record("create_sales_script", (input: { days?: number; focus?: string }): Promise<AssetToolResult> =>
          createSalesScript(assetActor, { days: clampDays(input.days, 180), focus: input.focus })
        ),
      }),
      create_ad_angles: tool({
        description:
          "Ad angles and copy drawn from how this client's prospects describe their own problem on calls. Copy only, no images. Saved in Vistrial; not sent anywhere.",
        inputSchema: z.object({ days: days(120, "How far back to read prospect quotes.") }),
        execute: record("create_ad_angles", (input: { days?: number }): Promise<AssetToolResult> =>
          createAdAngles(assetActor, { days: clampDays(input.days, 120) })
        ),
      }),
      create_channel_insights: tool({
        description:
          "A brief on which acquisition channels deserve more investment and which don't, from this client's own source, close, revenue, and spend numbers. Saved in Vistrial; not sent anywhere.",
        inputSchema: z.object({ days: days(90, "How far back to look.") }),
        execute: record("create_channel_insights", (input: { days?: number }): Promise<AssetToolResult> =>
          createChannelInsights(assetActor, { days: clampDays(input.days, 90) })
        ),
      }),
      create_objection_responses: tool({
        description:
          "How this client's reps answered objections in deals that closed, in their own words, grouped by objection. Saved in Vistrial; not sent anywhere.",
        inputSchema: z.object({ days: days(180, "How far back to look for closed deals.") }),
        execute: record("create_objection_responses", (input: { days?: number }): Promise<AssetToolResult> =>
          createObjectionResponses(assetActor, { days: clampDays(input.days, 180) })
        ),
      }),
    });
  }

  if (actor.canExecute) {
    const updateSchema = z.object({
      kind: z.enum(["summary", "brief", "alert"]).describe("What sort of update this is. Decides the default channel."),
      destinationId: z.string().uuid().optional().describe("A channel id from the list, only if they named a channel."),
      title: z.string().min(3).max(150),
      summary: z.string().min(10).max(1200).describe("Two to four sentences, numbers with their samples."),
      sections: z
        .array(z.object({ heading: z.string().max(80), bullets: z.array(z.string().max(300)).max(8) }))
        .max(6),
    });
    const assetSchema = z.object({ assetId: z.string().uuid() });

    const gated = (type: ExecutionType) => async (input: unknown, options: { toolCallId: string }) => {
      const needs = await requestApprovalIfNeeded(execActor, type, input, options.toolCallId);
      if (needs) {
        await recordToolCall(actor, conversationId, { toolCallId: options.toolCallId, toolName: type, input, state: "awaiting_approval" });
      }
      return needs;
    };
    const run = (type: ExecutionType) =>
      record(type, (input: unknown, toolCallId: string): Promise<ExecutionToolResult> => runExecution(execActor, type, input, toolCallId));

    Object.assign(tools, {
      post_slack_update: tool({
        description:
          "Post a structured update (summary, brief, or alert) to one of the client's Slack channels. Team channels only, never a prospect. Subject to the workspace's approval setting.",
        inputSchema: updateSchema,
        needsApproval: gated("post_slack_update"),
        execute: run("post_slack_update"),
      }),
      post_discord_update: tool({
        description:
          "Post a structured update (summary, brief, or alert) to one of the client's Discord channels. Team channels only, never a prospect. Subject to the workspace's approval setting.",
        inputSchema: updateSchema,
        needsApproval: gated("post_discord_update"),
        execute: run("post_discord_update"),
      }),
      save_asset_to_drive: tool({
        description:
          "Save the current version of a saved asset as a new Google Doc in the client's Vistrial folder in Drive. Never overwrites or removes anything. Subject to the approval setting.",
        inputSchema: assetSchema,
        needsApproval: gated("save_asset_to_drive"),
        execute: run("save_asset_to_drive"),
      }),
      deliver_asset: tool({
        description:
          "Send the current version of a saved asset where the client keeps assets: their Drive folder, and a note in the channel picked for new assets. Subject to the approval setting.",
        inputSchema: assetSchema,
        needsApproval: gated("deliver_asset"),
        execute: run("deliver_asset"),
      }),
    });
  }

  return tools;
}
