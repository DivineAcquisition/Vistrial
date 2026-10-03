import type { Metadata } from "next";

import { SalesOsWorkspace } from "@/components/sales-os/workspace";
import { openingFromPackage, resolveContext } from "@/lib/sales-os/context";
import { isConversationId } from "@/lib/sales-os/persist";
import { salesOsActor } from "@/lib/sales-os/session";

export const metadata: Metadata = { title: "Ask Vistrial" };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const actor = await salesOsActor();
  const { c } = await searchParams;
  const context = await resolveContext(actor, { conversationId: null });
  return (
    <SalesOsWorkspace
      opening={openingFromPackage(context.pkg)}
      initialThreadId={isConversationId(c) ? c : undefined}
      canManage={actor.canExecute}
    />
  );
}
