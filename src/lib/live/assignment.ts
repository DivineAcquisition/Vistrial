import "server-only";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api";
import { liveRecordSink } from "@/lib/live/words";

/** Copies one lead assignment into the access index. Ids only. */
export async function syncLeadAssignment(args: {
  workspaceId: string;
  leadId: string;
  setterMemberId: string | null;
  closerMemberId: string | null;
}): Promise<void> {
  if (liveRecordSink() !== "convex") return;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const key = process.env.CONVEX_SYSTEM_KEY;
  if (!url || !key) return;
  const client = new ConvexHttpClient(url);
  await client.mutation(api.leadAccess.sync, {
    key,
    job: "assignment",
    workspaceId: args.workspaceId,
    leadId: args.leadId,
    setterMemberId: args.setterMemberId ?? undefined,
    closerMemberId: args.closerMemberId ?? undefined,
  });
}
