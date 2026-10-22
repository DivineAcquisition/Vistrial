import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SalesOsWorkspace } from "@/components/sales-os/workspace";
import { getAuthContext } from "@/lib/auth/session";
import { getEffectiveConfig } from "@/lib/config/server";
import { anthropicApiKey } from "@/lib/extraction/anthropic";
import { compassStarters } from "@/lib/live/compass-starters";
import { openingFromPackage, resolveContext } from "@/lib/sales-os/context";
import type { OpeningState } from "@/lib/sales-os/context-types";
import { listPendingApprovals } from "@/lib/sales-os/executions/run";
import { salesOsEnabled } from "@/lib/sales-os/flag";
import { isConversationId, listToolCalls } from "@/lib/sales-os/persist";
import { askPageRedirect } from "@/lib/sales-os/routes";
import { salesOsActor } from "@/lib/sales-os/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Ask Vistrial" };

/**
 * Sales OS workspaces render the conversation workspace. Every other
 * workspace still opens Compass, including an old link to a conversation.
 */
export default async function AskPage({ searchParams }: { searchParams: Promise<{ c?: string; q?: string }> }) {
  const { c, q } = await searchParams;
  const ctx = await getAuthContext();
  const moved = askPageRedirect(await salesOsEnabled(ctx.org.id), c);
  if (moved) redirect(moved);

  const actor = await salesOsActor();
  const asked = typeof q === "string" ? q.trim().slice(0, 2000) : "";
  let opening: OpeningState = {
    conversationReady: false,
    greetingName: actor.personName.trim().split(/\s+/)[0] || "there",
    lines: ["Vistrial is still reading this workspace."],
    leaks: [],
    thin: true,
    thinReasons: [],
    builtAt: new Date().toISOString(),
    suggestions: [],
  };
  let pending: Awaited<ReturnType<typeof listPendingApprovals>> = [];
  let recent: Awaited<ReturnType<typeof listToolCalls>> = [];
  let unavailable = anthropicApiKey()
    ? undefined
    : "Vistrial can't think right now: the model key isn't set for this deployment.";
  try {
    const [context, pendingRows, recentRows, config] = await Promise.all([
      resolveContext(actor, { conversationId: null }),
      listPendingApprovals(actor.db, actor.orgId),
      listToolCalls(actor, { limit: 6 }),
      getEffectiveConfig(actor.db, actor.orgId).catch(() => null),
    ]);
    opening = openingFromPackage(context.pkg);
    pending = pendingRows;
    recent = recentRows;
    if (config) {
      const starters = compassStarters(config.values as Record<string, unknown>);
      const seen = new Set(opening.suggestions.map((item) => item.prompt));
      opening.suggestions = [...starters.filter((item) => !seen.has(item.prompt)), ...opening.suggestions].slice(0, 5);
    }
  } catch {
    unavailable = unavailable ?? "Vistrial can't read this workspace right now. Nothing was changed.";
  }
  if (asked && !opening.suggestions.some((item) => item.prompt === asked)) {
    opening.suggestions = [{ prompt: asked, label: asked }, ...opening.suggestions].slice(0, 5);
  }

  return (
    <SalesOsWorkspace
      opening={opening}
      initialThreadId={isConversationId(c) ? c : undefined}
      canEditAssets={actor.canWriteAssets}
      pending={pending}
      recent={recent}
      unavailable={unavailable}
    />
  );
}
