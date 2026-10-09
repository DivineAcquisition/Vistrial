import type { Metadata } from "next";

import { SalesOsWorkspace } from "@/components/sales-os/workspace";
import { openingFromPackage, resolveContext } from "@/lib/sales-os/context";
import { listPendingApprovals } from "@/lib/sales-os/executions/run";
import { isConversationId, listToolCalls } from "@/lib/sales-os/persist";
import { salesOsActor } from "@/lib/sales-os/session";
import { anthropicApiKey } from "@/lib/extraction/anthropic";
import { getEffectiveConfig } from "@/lib/config/server";
import { compassStarters } from "@/lib/live/compass-starters";

export const metadata: Metadata = { title: "Ask Vistrial" };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const actor = await salesOsActor();
  const { c } = await searchParams;
  const [context, pending, recent, config] = await Promise.all([
    resolveContext(actor, { conversationId: null }),
    listPendingApprovals(actor.db, actor.orgId),
    listToolCalls(actor, { limit: 6 }),
    getEffectiveConfig(actor.db, actor.orgId).catch(() => null),
  ]);
  const opening = openingFromPackage(context.pkg);
  if (config) {
    const starters = compassStarters(config.values as Record<string, unknown>);
    const seen = new Set(opening.suggestions.map((item) => item.prompt));
    opening.suggestions = [...starters.filter((item) => !seen.has(item.prompt)), ...opening.suggestions].slice(0, 5);
  }
  return (
    <SalesOsWorkspace
      opening={opening}
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
