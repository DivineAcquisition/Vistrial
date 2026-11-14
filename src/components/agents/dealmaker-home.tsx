"use client";

import Link from "next/link";
import { useState } from "react";

import { ArrowRight, BookOpenCheck, CalendarIcon, ClipboardList, LayoutGrid, MessagesSquare, SendIcon, Zap, type LucideIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { showError } from "@/lib/errors/show-error";
import { DEALMAKER_PAGE } from "@/lib/marketing/agent-pages";

const ICON: Record<string, LucideIcon> = { chat: MessagesSquare, calendar: CalendarIcon, pipeline: LayoutGrid, calls: ClipboardList, comms: SendIcon, playbook: BookOpenCheck };

export const DEALMAKER_HOME_TEXT = {
  offAdmin: "Dealmaker is off in this organization. Turn it on to start: then connect HighLevel in Connections, and its tabs fill from your CRM.",
  offMember: "Dealmaker is off in this organization. An Owner or Admin turns it on, here or in Settings.",
  on: "Dealmaker is on. Start with Calendar for today's calls, or Chat to ask for anything. Connect HighLevel in Connections if you have not yet.",
} as const;

/** Dealmaker's home: whether it is on, a switch for an Owner or Admin, and its six places, each a link. */
export function DealmakerHomeView({ base, on, canTurnOn, onTurnOn }: { base: string; on: boolean; canTurnOn: boolean; onTurnOn?: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-5" data-dealmaker-home>
      <Panel className="flex min-w-0 flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
        <div className="grid min-w-0 gap-1">
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Status <StatusBadge label={on ? "On" : "Off"} tone={on ? "good" : "neutral"} />
          </p>
          <p className="max-w-2xl text-sm text-card-foreground">{on ? DEALMAKER_HOME_TEXT.on : canTurnOn ? DEALMAKER_HOME_TEXT.offAdmin : DEALMAKER_HOME_TEXT.offMember}</p>
        </div>
        {!on && canTurnOn && onTurnOn ? (
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onTurnOn();
              } catch (error) {
                showError(error);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Zap aria-hidden className="size-4" /> Turn on Dealmaker
          </Button>
        ) : null}
      </Panel>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Dealmaker's tabs">
        {DEALMAKER_PAGE.tabs.items.map((tab) => {
          const Icon = ICON[tab.id] ?? ArrowRight;
          return (
            <li key={tab.id}>
              <Link href={`${base}/work/${tab.id}`} className="group grid h-full gap-1.5 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50">
                <span className="flex items-center gap-2 font-heading text-base text-foreground">
                  <Icon aria-hidden className="size-4 text-primary" />
                  {tab.name}
                  <ArrowRight aria-hidden className="ml-auto size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="text-sm text-muted-foreground">{tab.does}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
