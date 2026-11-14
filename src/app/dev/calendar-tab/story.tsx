"use client";

import { useState } from "react";

import { CalendarView, type CalendarData } from "@/components/work/calendar-tab";
import { BRIEF_LABEL, STATUS_LABEL, briefBadge, dayLabel, showFigures, timeLabel, weekDays, type BriefState } from "../../../../convex/lib/dealmaker/calendar";
import type { AppointmentStatus } from "../../../../convex/lib/crm/types";

import { StoryFrame } from "../work-tabs/story-frame";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Saturday 14 November 2026, 10:00 in New York.
const NOW = Date.UTC(2026, 10, 14, 15);
const TZ = "America/New_York";

/** A coaching agency's booked calls. Sample data. */
const SAMPLE: { ref: string; at: number; lead: string; stage: string; status: AppointmentStatus; brief: BriefState }[] = [
  { ref: "a1", at: NOW - 5 * DAY - 1 * HOUR, lead: "Alex Kim", stage: "Call booked", status: "showed", brief: "ready" },
  { ref: "a2", at: NOW - 4 * DAY + 4 * HOUR, lead: "Priya Shah", stage: "Proposal sent", status: "showed", brief: "ready" },
  { ref: "a3", at: NOW - 3 * DAY, lead: "Lee Park", stage: "Call booked", status: "noShow", brief: "none" },
  { ref: "a4", at: NOW - 2 * DAY + 2 * HOUR, lead: "Ana Diaz", stage: "Proposal sent", status: "showed", brief: "ready" },
  { ref: "a5", at: NOW - DAY - 2 * HOUR, lead: "Chris Moore", stage: "Call booked", status: "cancelled", brief: "none" },
  { ref: "a6", at: NOW + 1 * HOUR, lead: "Jordan Lee", stage: "Call booked", status: "confirmed", brief: "ready" },
  { ref: "a7", at: NOW + 5 * HOUR, lead: "Sam Ray", stage: "Call booked", status: "booked", brief: "none" },
  { ref: "a8", at: NOW + 27 * HOUR, lead: "Riley Park", stage: "Proposal sent", status: "booked", brief: "running" },
];

function data(view: string, week: number): CalendarData {
  const days = weekDays(NOW, TZ, week);
  const calls = (view === "empty" ? [] : SAMPLE)
    .map((row) => {
      const badge = briefBadge(row.brief, row.at, NOW, row.status);
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(row.at);
      return {
        ref: row.ref,
        day,
        startsAt: row.at,
        time: timeLabel(row.at, TZ),
        status: row.status,
        statusLabel: STATUS_LABEL[row.status],
        leadName: row.lead,
        stage: row.stage,
        brief: badge,
        briefLabel: BRIEF_LABEL[badge],
        past: row.at <= NOW,
      };
    })
    .filter((row) => days.includes(row.day));
  const figures = showFigures(view === "empty" ? [] : SAMPLE.map((row) => ({ startsAt: row.at, status: row.status })), NOW);
  const ahead = calls.filter((row) => !row.past && row.status !== "cancelled");
  return {
    connected: true,
    appointments: true,
    crm: { label: "HighLevel" },
    scopeWhy: "You see every call.",
    timezone: TZ,
    week,
    weeksRange: 8,
    today: "2026-11-14",
    days: days.map((key) => ({ key, label: dayLabel(key), isToday: key === "2026-11-14", calls: calls.filter((row) => row.day === key) })),
    todayCalls: calls.filter((row) => row.day === "2026-11-14"),
    figures: {
      ...figures,
      upcoming: week === 0 ? ahead.length : 0,
      confirmed: week === 0 ? ahead.filter((row) => row.status === "confirmed").length : 0,
      briefsDue: week === 0 ? ahead.filter((row) => row.brief === "due").length : 0,
    },
  };
}

/** Today so far, as an Owner sees it. Sample data. */
const today = {
  connected: true as const,
  appointments: true as const,
  scopeWhy: "You see every deal.",
  day: "Sat, Nov 14",
  figures: { calls: 5, held: 3, noShow: 1, cancelled: 0, notMarked: 0, later: 1 },
  done: { briefs: 4, notes: 2, reviews: 1, sent: 6 },
  open: ["Add notes for 1 held call.", "1 held call with notes has no review yet.", "2 messages wait in Comms.", "1 call tomorrow has no brief yet."],
  tomorrow: { calls: 3, withoutBrief: 1 },
  headline: "5 booked calls today: 3 held, 1 no-show, 1 later. 3 calls tomorrow.",
  reps: [
    { name: "Ada Okafor", held: 2, noShow: 0, notMarked: 0, noted: 1 },
    { name: "Milo Grant", held: 1, noShow: 1, notMarked: 0, noted: 1 },
  ],
};

export function CalendarTabStory({ view, theme }: { view: string; theme: string }) {
  const [week, setWeek] = useState(0);
  return (
    <StoryFrame theme={theme} role="owner">
      <CalendarView
        data={data(view, week)}
        onWeek={setWeek}
        auto={{ on: view === "auto", canSet: true, hoursBefore: 3, cap: { briefs: 200, credits: 600 }, used: { briefs: view === "auto" ? 14 : 0, credits: view === "auto" ? 212 : 0 } }}
        onAuto={async () => undefined}
        today={view === "endOfDay" ? today : null}
      />
    </StoryFrame>
  );
}
