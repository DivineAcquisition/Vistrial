import Link from "next/link";
import {
  ArrowUpRight,
  Bell,
  CalendarClock,
  FileText,
  MessageSquare,
  Reply,
  Sparkles,
  Tags,
  type LucideIcon,
} from "lucide-react";

import { ApprovalQueueList } from "@/app/app/home/approval-queue";
import { HeroCard, SupportingNumbers } from "@/app/app/home/number-cards";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AuthContext } from "@/lib/auth/types";
import { loadHomeNumbers } from "@/lib/home/load";
import type { HomePeriodKey } from "@/lib/home/periods";
import { runModeLabel, type ActivityEntry } from "@/lib/home/queue";
import { loadActivity, loadApprovalQueue } from "@/lib/home/views";
import { cn } from "@/lib/utils";

export const ACTIVITY_PREVIEW = 5;

const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  quiet_lead_follow_up: MessageSquare,
  no_show_rebook: CalendarClock,
  first_reply: Reply,
  client_report: FileText,
  crm_stage_change: Tags,
  setter_nudge: Bell,
  owner_escalation: ArrowUpRight,
  slack_post: MessageSquare,
  discord_post: MessageSquare,
  drive_store: FileText,
};

function SectionHeading({ id, title, count }: { id: string; title: string; count?: number }) {
  return (
    <h2 id={id} className="flex items-center gap-2 font-heading text-base text-card-foreground">
      {title}
      {count !== undefined ? (
        <Badge variant={count > 0 ? "default" : "outline"} size="sm" aria-label={`${count} waiting`}>
          {count}
        </Badge>
      ) : null}
    </h2>
  );
}

/* ---------------------------------------------------------------------------
 * Numbers
 * ------------------------------------------------------------------------- */

function EmptyWorkspace({ name, canConnect }: { name: string; canConnect: boolean }) {
  return (
    <Card className="items-start gap-4 border-brand-500/30 p-6 sm:p-8">
      <span className="grid size-10 place-items-center rounded-xl bg-brand-500/12 text-brand-700 dark:text-brand-300">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <div className="space-y-2">
        <h2 className="font-heading text-xl text-card-foreground">{name} is ready for its first lead</h2>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Once leads start coming in, this is where you will see how many calls were booked and what each one cost,
          how fast your team replied, which quiet leads came back, which no-shows rebooked, and the revenue that
          followed. Anything Vistrial wants to send will wait here for your approval first.
        </p>
      </div>
      {canConnect ? (
        <Link
          href="/app/settings/integrations"
          className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
        >
          Connect your CRM to bring leads in
        </Link>
      ) : null}
    </Card>
  );
}

export async function NumbersSection({ ctx, period }: { ctx: AuthContext; period: HomePeriodKey }) {
  const numbers = await loadHomeNumbers(ctx, period);
  if (numbers.isEmpty) {
    return <EmptyWorkspace name={numbers.workspaceName} canConnect={numbers.canSeeMoney} />;
  }
  return (
    <>
      <HeroCard numbers={numbers} />
      <SupportingNumbers numbers={numbers} />
    </>
  );
}

export function NumbersSkeleton({ showMoney = true }: { showMoney?: boolean }) {
  return (
    <>
      <Card className="p-5 sm:p-7" aria-busy="true" aria-label="Loading numbers">
        <Skeleton className="h-4 w-56 max-w-full" />
        <div className="mt-5 flex items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-14 w-24 sm:h-[4.5rem]" />
          </div>
          {showMoney ? (
            <div className="flex flex-col items-end gap-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-8 w-20" />
            </div>
          ) : null}
        </div>
        <Skeleton className="mt-4 h-4 w-40" />
      </Card>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {Array.from({ length: showMoney ? 4 : 3 }, (_, index) => (
          <Card key={index} className="p-4 sm:p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-8 w-16" />
            <Skeleton className="mt-2 h-3 w-20" />
          </Card>
        ))}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------
 * Approval queue
 * ------------------------------------------------------------------------- */

export async function QueueSection({ ctx }: { ctx: AuthContext }) {
  const items = await loadApprovalQueue(ctx);
  return (
    <section aria-labelledby="home-queue" className="flex flex-col gap-3">
      <SectionHeading id="home-queue" title="Needs your approval" count={items.length} />
      {items.length ? (
        <ApprovalQueueList items={items} />
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          Nothing is waiting on you. Drafts Vistrial wants to send will show up here first.
        </p>
      )}
    </section>
  );
}

export function QueueSkeleton() {
  return (
    <section className="flex flex-col gap-3" aria-busy="true" aria-label="Loading approvals">
      <Skeleton className="h-5 w-44" />
      {[0, 1].map((index) => (
        <Card key={index} className="gap-3 p-4 sm:p-5">
          <Skeleton className="h-4 w-16 rounded-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-14" />
          </div>
        </Card>
      ))}
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Activity log
 * ------------------------------------------------------------------------- */

function when(iso: string, timeZone: string, now = Date.now()): string {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function ActivityList({ entries, timeZone }: { entries: ActivityEntry[]; timeZone: string }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {entries.map((entry) => {
        const Icon = ACTIVITY_ICONS[entry.actionType] ?? Sparkles;
        return (
          <li key={entry.key} className="flex items-start gap-3 px-4 py-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-700 dark:text-brand-300">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-card-foreground">{entry.description}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "font-medium",
                    entry.runMode === "auto_run" ? "text-brand-700 dark:text-brand-300" : "text-card-foreground"
                  )}
                >
                  {runModeLabel(entry)}
                </span>
                <span aria-hidden>·</span>
                <time dateTime={entry.at}>{when(entry.at, timeZone)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export async function ActivitySection({ ctx }: { ctx: AuthContext }) {
  const { entries, more } = await loadActivity(ctx, ACTIVITY_PREVIEW);
  return (
    <section aria-labelledby="home-activity" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <SectionHeading id="home-activity" title="Handled while you were away" />
        {entries.length ? (
          <Link
            href="/app/home/activity"
            className="shrink-0 text-sm font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
          >
            {more ? "See full log" : "Open log"}
          </Link>
        ) : null}
      </div>
      {entries.length ? (
        <ActivityList entries={entries} timeZone={ctx.org.timezone} />
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          Nothing yet. When Vistrial sends a message or adds a task, on its own or after you approve it, it is logged
          here.
        </p>
      )}
    </section>
  );
}

export function ActivitySkeleton() {
  return (
    <section className="flex flex-col gap-3" aria-busy="true" aria-label="Loading activity">
      <Skeleton className="h-5 w-52" />
      <div className="divide-y divide-border rounded-2xl border border-border bg-card">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-8 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
