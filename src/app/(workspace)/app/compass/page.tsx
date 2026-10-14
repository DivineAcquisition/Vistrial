import type { UIMessage } from "ai";
import type { Metadata } from "next";

import { CompassPage } from "@/components/compass/compass-page";
import { compassActor, unavailableMessage } from "@/lib/compass/actor";
import { isConversationId, listConversations, loadLegacyMessages, loadMessages, requireOwnConversation } from "@/lib/compass/persist";
import { startersFor } from "@/lib/compass/starters";
import type { CompassContext } from "@/lib/compass/types";
import { getEffectiveConfig } from "@/lib/config/server";
import { CompassIcon } from "lucide-react";

export const metadata: Metadata = { title: "Compass" };

export default async function CompassRoute({ searchParams }: { searchParams: Promise<{ c?: string; q?: string; legacy?: string }> }) {
  const actor = await compassActor();
  const { c, q, legacy } = await searchParams;

  if (!actor.available) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-3 px-4 pt-16" role="status">
        <CompassIcon className="size-6 text-brand-300" aria-hidden />
        <h1 className="font-heading text-xl text-card-foreground">Compass</h1>
        <p className="text-sm text-muted-foreground">{unavailableMessage(actor.unavailableReason)}</p>
      </div>
    );
  }

  const [rows, config, pins] = await Promise.all([
    listConversations(actor),
    getEffectiveConfig(actor.db, actor.orgId).catch(() => null),
    actor.db.from("compass_pins").select("id, question").eq("org_id", actor.orgId).eq("user_id", actor.userId).order("created_at"),
  ]);
  const pinRows = ((pins.data ?? []) as Array<{ id: string; question: string }>).slice(0, 20);
  const values = (config?.values ?? {}) as Record<string, unknown>;
  const starters = startersFor(actor.access, values["industry.compass_questions"], pinRows.map((pin) => pin.question));

  let initial: { conversationId: string | null; messages: UIMessage[]; legacy: boolean; context: CompassContext } = {
    conversationId: null,
    messages: [],
    legacy: false,
    context: { kind: "none" },
  };
  if (isConversationId(c)) {
    if (legacy === "1") {
      const messages = await loadLegacyMessages(actor, c);
      if (messages) initial = { conversationId: c, messages, legacy: true, context: { kind: "none" } };
    } else {
      const row = await requireOwnConversation(actor, c);
      if (row) initial = { conversationId: row.id, messages: await loadMessages(actor, row.id), legacy: false, context: row.context ?? { kind: "none" } };
    }
  }

  const staffNote = actor.isStaff
    ? `You're using Compass as Vistrial staff inside ${actor.orgName}. It answers only from what your staff access allows here, and your conversations stay private to you.`
    : null;

  return (
    <CompassPage
      rows={rows}
      initial={initial}
      starters={starters}
      pins={pinRows}
      staffNote={staffNote}
      prefill={typeof q === "string" && q.trim() ? q.trim().slice(0, 2000) : null}
    />
  );
}
