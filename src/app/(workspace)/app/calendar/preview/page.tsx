import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SalesCalendarScreen } from "@/components/calendar/sales-calendar";
import { PageFrame } from "@/components/app/page-frame";
import { buildSalesCalendar, EMPTY_FILTERS, type CalendarPayload } from "@/lib/calendar/model";
import { getAuthContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Calendar preview", robots: { index: false, follow: false } };

const NOW = new Date("2026-10-22T15:00:00.000Z");

/** Development only. Sample names, no workspace records. */
export default async function CalendarPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const ctx = await getAuthContext();
  const zone = ctx.org.timezone || "America/New_York";
  const built = buildSalesCalendar({
    orgId: "preview",
    timeZone: zone,
    now: NOW,
    range: { start: new Date("2026-10-19T00:00:00.000Z"), end: new Date("2026-11-16T00:00:00.000Z") },
    filters: EMPTY_FILTERS,
    hours: null,
    dailyCallTarget: 2,
    quietStart: "20:00",
    quietEnd: "08:00",
    reps: [
      { id: "rep-ada", name: "Ada North" },
      { id: "rep-ben", name: "Ben Cole" },
    ],
    leads: [
      {
        id: "lead-1",
        orgId: "preview",
        firstName: "Riley",
        lastName: "Sample",
        timeZone: "America/Los_Angeles",
        stage: "working",
        setterId: "rep-ada",
        closerId: "rep-ben",
        tier: "hot",
      },
      {
        id: "lead-2",
        orgId: "preview",
        firstName: "Quinn",
        lastName: "Sample",
        timeZone: "America/New_York",
        stage: "follow_up",
        setterId: "rep-ada",
        closerId: null,
        tier: "warm",
      },
    ],
    calls: [
      {
        id: "call-1",
        orgId: "preview",
        leadId: "lead-1",
        scheduledAt: "2026-10-22T18:00:00.000Z",
        occurredAt: null,
        durationSeconds: 1800,
        outcome: null,
        ranByMemberId: "rep-ben",
      },
      {
        id: "call-2",
        orgId: "preview",
        leadId: "lead-2",
        scheduledAt: "2026-10-21T14:00:00.000Z",
        occurredAt: "2026-10-21T14:05:00.000Z",
        durationSeconds: 900,
        outcome: "no_show",
        ranByMemberId: "rep-ada",
      },
    ],
    blocks: [
      {
        id: "hold-1",
        orgId: "preview",
        kind: "hold",
        source: "person",
        startsAt: "2026-10-23T16:00:00.000Z",
        endsAt: "2026-10-23T17:00:00.000Z",
        memberId: "rep-ada",
        leadId: null,
        eventStatus: null,
      },
    ],
    tasks: [
      {
        id: "task-1",
        orgId: "preview",
        leadId: "lead-2",
        dueAt: "2026-10-22T13:00:00.000Z",
        taskType: "follow_up",
        status: "open",
        ownerMemberId: "rep-ada",
        sourceKind: "person",
      },
    ],
    drafts: [
      {
        itemId: "item-1",
        orgId: "preview",
        status: "pending",
        assignedMemberId: "rep-ada",
        leadId: "lead-1",
        channel: "sms",
        sendAt: "2026-10-22T02:00:00.000Z",
      },
    ],
    windows: [
      {
        id: "window-1",
        orgId: "preview",
        leadId: "lead-2",
        state: "on_time",
        deadlineAt: "2026-10-22T20:00:00.000Z",
      },
    ],
    workflows: [
      {
        id: "step-1",
        orgId: "preview",
        leadId: "lead-1",
        status: "active",
        nextDueAt: "2026-10-24T15:00:00.000Z",
        boxTitle: "Follow-up 2",
      },
    ],
  });
  const initial: CalendarPayload = {
    ...built,
    timeZone: zone,
    canPickRep: true,
    canCreateTask: false,
    canCreateHold: false,
    quietStart: "20:00",
    quietEnd: "08:00",
    filters: EMPTY_FILTERS,
  };
  return (
    <PageFrame title="Calendar preview" description="Sample leads only. Nothing on this page is saved or sent.">
      <SalesCalendarScreen initial={initial} memberId={ctx.member.id} />
    </PageFrame>
  );
}
