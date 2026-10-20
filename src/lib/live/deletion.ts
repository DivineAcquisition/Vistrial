import "server-only";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api";
import { liveRecordSink } from "@/lib/live/words";

/** Removes a lead's name from history that was copied as the event's own words. */
export async function redactMovedLeadWords(args: { workspaceId: string; leadId: string; names: string[] }): Promise<void> {
  if (liveRecordSink() === "postgres") return;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const key = process.env.CONVEX_SYSTEM_KEY;
  if (!url || !key) throw new Error("Deletion could not reach the activity record.");
  const client = new ConvexHttpClient(url);
  await client.mutation(api.privacy.redactLead, {
    key,
    job: "deletion",
    workspaceId: args.workspaceId,
    leadId: args.leadId,
    names: args.names,
  });
}
