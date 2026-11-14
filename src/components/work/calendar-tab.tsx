"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";

import { CalendarIcon, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, Clock, FileText, UserX, XCircle, type LucideIcon } from "@/components/icons";
import { useClientScope } from "@/components/shell/shell-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { SectionTitle, WorkHero } from "./work-shell";

export type CalendarData = FunctionReturnType<typeof api.dealCalendar.week>;
type Week = Extract<CalendarData, { appointments: true }>;
type Call = Week["days"][number]["calls"][number];

/** Colour is never alone: every status has an icon and its word. */
const STATUS_STYLE: Record<Call["status"], { icon: LucideIcon; badge: "success" | "warning" | "outline" | "info" | "error" }> = {
  booked: { icon: Clock, badge: "outline" },
  confirmed: { icon: CheckCircle2, badge: "info" },
  showed: { icon: CheckCircle2, badge: "success" },
  noShow: { icon: UserX, badge: "warning" },
  cancelled: { icon: XCircle, badge: "error" },
  unknown: { icon: CircleHelp, badge: "outline" },
};

const BRIEF_STYLE: Record<Call["brief"], string> = {
  ready: "text-success",
  "being written": "text-muted-foreground",
  due: "text-warning font-medium",
  none: "text-muted-foreground",
  check: "text-warning",
};

/** Where a call's brief lives. */
const CALLS_HREF = "/app/agents/sales-conversion/work/calls";

function CallChip({ call, wide = false }: { call: Call; wide?: boolean }) {
  const style = STATUS_STYLE[call.status];
  const Icon = style.icon;
  return (
    <li className={cn("grid min-w-0 gap-1 rounded-lg border border-border bg-card p-2.5", call.status === "cancelled" && "opacity-70")} data-call={call.ref}>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="text-xs font-medium text-foreground tabular-nums">{call.time}</span>
        <Badge variant={style.badge} size="sm">
          <Icon aria-hidden className="size-3" />
          {call.statusLabel}
        </Badge>
      </div>
      <p className={cn("text-sm text-foreground", call.status === "cancelled" && "line-through", !wide && "truncate")}>{call.leadName}</p>
      {call.stage ? <p className="truncate text-xs text-muted-foreground">{call.stage}</p> : null}
      {call.status === "cancelled" ? null : (
        <Link href={CALLS_HREF} className={cn("inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline", BRIEF_STYLE[call.brief])}>
          <FileText aria-hidden className="size-3" />
          {call.briefLabel}
        </Link>
      )}
    </li>
  );
}

function Figure({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <li className="grid gap-0.5 rounded-lg border border-border bg-card px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-heading text-lg text-foreground tabular-nums">{value}</span>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
    </li>
  );
}

/** The Calendar with its data handed in, so a story can show it without a server. */
export function CalendarView({ data, onWeek }: { data: CalendarData; onWeek: (week: number) => void }) {
  const hero = (
    <WorkHero
      icon={CalendarIcon}
      agent="sales-conversion"
      eyebrow="Dealmaker · Calendar"
      title="Every booked call, and whether it is ready"
      promise={data.connected && data.appointments ? `${data.scopeWhy} Read from your ${data.crm.label}, in ${data.timezone.replace(/_/g, " ")} time.` : data.scopeWhy}
    />
  );
  if (!data.connected) {
    return (
      <div className="grid min-w-0 gap-5">
        {hero}
        <Panel className="grid gap-2 p-4 sm:p-6">
          <p className="text-sm text-muted-foreground">Connect your CRM in Connections and Dealmaker will show your booked calls here, each with its brief.</p>
        </Panel>
      </div>
    );
  }
  if (!data.appointments) {
    return (
      <div className="grid min-w-0 gap-5">
        {hero}
        <Panel className="grid gap-2 p-4 sm:p-6">
          <p className="text-sm text-muted-foreground">{data.crm.label} does not share booked calls with Vistrial, so there is no calendar to show.</p>
        </Panel>
      </div>
    );
  }
  const figures = data.figures;
  const weekWords = data.week === 0 ? "This week" : data.week === 1 ? "Next week" : data.week === -1 ? "Last week" : data.week > 0 ? `In ${data.week} weeks` : `${-data.week} weeks ago`;
  return (
    <div className="grid min-w-0 gap-5">
      {hero}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Figures">
        <Figure label="Show rate" value={figures.showRate} />
        <Figure label="Showed" value={figures.showed} note={`last ${figures.days} days`} />
        <Figure label="No-shows" value={figures.noShow} note={`last ${figures.days} days`} />
        <Figure label="Cancelled" value={figures.cancelled} note={`last ${figures.days} days`} />
        <Figure label="Confirmed this week" value={`${figures.confirmed} of ${figures.upcoming}`} />
        <Figure label="Briefs due" value={figures.briefsDue} note="calls within a day" />
      </ul>
      <p className="-mt-3 text-xs text-muted-foreground">
        {figures.basis}
        {figures.notMarked ? ` ${figures.notMarked} past call${figures.notMarked === 1 ? " is" : "s are"} not marked either way, so not counted.` : ""}
      </p>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <Panel className="grid min-w-0 content-start gap-3 p-4 sm:p-6">
          <SectionTitle
            icon={CalendarIcon}
            aside={
              <div className="flex items-center gap-1" role="group" aria-label="Choose the week">
                <Button size="icon-sm" variant="outline" aria-label="Previous week" disabled={data.week <= -data.weeksRange} onClick={() => onWeek(data.week - 1)}>
                  <ChevronLeft aria-hidden className="size-4" />
                </Button>
                <Button size="sm" variant="outline" disabled={data.week === 0} onClick={() => onWeek(0)}>
                  This week
                </Button>
                <Button size="icon-sm" variant="outline" aria-label="Next week" disabled={data.week >= data.weeksRange} onClick={() => onWeek(data.week + 1)}>
                  <ChevronRight aria-hidden className="size-4" />
                </Button>
              </div>
            }
          >
            {weekWords}
          </SectionTitle>
          <div className="grid min-w-0 gap-3 md:grid-cols-7 md:gap-2" aria-label="Calls by day">
            {data.days.map((day) => (
              <section key={day.key} className={cn("grid min-w-0 content-start gap-2 rounded-lg p-1.5", day.isToday && "bg-primary/5 ring-1 ring-primary/30")} aria-label={day.label}>
                <h3 className="flex items-center justify-between gap-1 text-xs font-medium text-foreground">
                  <span>{day.label}</span>
                  {day.isToday ? <span className="text-primary">Today</span> : <span className="text-muted-foreground tabular-nums md:hidden">{day.calls.length}</span>}
                </h3>
                {day.calls.length ? (
                  <ul className="grid gap-1.5">
                    {day.calls.map((call) => (
                      <CallChip key={call.ref} call={call} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No calls</p>
                )}
              </section>
            ))}
          </div>
        </Panel>
        <Panel className="grid content-start gap-3 p-4 sm:p-6" data-today-rail>
          <SectionTitle icon={Clock}>Today</SectionTitle>
          {data.todayCalls.length ? (
            <ul className="grid gap-2">
              {data.todayCalls.map((call) => (
                <CallChip key={call.ref} call={call} wide />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No calls booked today.</p>
          )}
          <Link href={CALLS_HREF} className="text-xs text-primary underline-offset-2 hover:underline">
            Briefs and notes are in Calls
          </Link>
        </Panel>
      </div>
    </div>
  );
}

/** Dealmaker's Calendar for the organization or the client the picker names. */
export function CalendarTab({ workspaceId }: { workspaceId: Id<"workspaces"> }) {
  const { clientId } = useClientScope();
  const [week, setWeek] = useState(0);
  const data = useQuery(api.dealCalendar.week, { workspaceId, clientId, week });
  if (data === undefined) return <p className="text-sm text-muted-foreground">Reading your calendar…</p>;
  return <CalendarView data={data} onWeek={setWeek} />;
}
