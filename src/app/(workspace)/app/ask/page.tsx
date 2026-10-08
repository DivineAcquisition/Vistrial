import type { Metadata } from "next";

import { SalesOsWorkspace } from "@/components/sales-os/workspace";
import { openingFromPackage, resolveContext } from "@/lib/sales-os/context";
import { listPendingApprovals } from "@/lib/sales-os/executions/run";
import { isConversationId, listToolCalls } from "@/lib/sales-os/persist";
import { salesOsActor } from "@/lib/sales-os/session";
import { anthropicApiKey } from "@/lib/extraction/anthropic";

export const metadata: Metadata = { title: "Ask Vistrial" };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const actor = await salesOsActor();
  const { c } = await searchParams;
  const [context, pending, recent] = await Promise.all([
    resolveContext(actor, { conversationId: null }),
    listPendingApprovals(actor.db, actor.orgId),
    listToolCalls(actor, { limit: 6 }),
  ]);
  return (
    <SalesOsWorkspace
      opening={openingFromPackage(context.pkg)}
      initialThreadId={isConversationId(c) ? c : undefined}
      canEditAssets={actor.canWriteAssets}
      pending={pending}
      recent={recent}
      unavailable={
        anthropicApiKey()
          ? undefined
          : "Vistrial can't think right now: the model key isn't set for this deployment."
      }
    />
  );
}
