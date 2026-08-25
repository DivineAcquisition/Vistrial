import { computeSendAt } from "@/lib/follow-up/quiet-hours";
import { nextWorkingStart, resolveWorkingHours } from "@/lib/notifications/hours";
import type { WorkingHours } from "@/lib/notifications/types";

export function orgWorkingHours(input: {
  timezone: string;
  start?: string | null;
  end?: string | null;
  days?: number[] | null;
}): WorkingHours {
  return resolveWorkingHours({
    orgTimeZone: input.timezone,
    orgStart: input.start?.slice(0, 5),
    orgEnd: input.end?.slice(0, 5),
    orgDays: input.days,
  });
}

/** Quiet hours first, then org business hours. Follow-up may not send off-hours. */
export function computeFollowUpSendAt(args: {
  now: Date;
  leadTimeZone: string;
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  businessHours: WorkingHours;
}): Date {
  const afterQuiet = computeSendAt({
    now: args.now,
    timeZone: args.leadTimeZone,
    enabled: args.quietEnabled,
    startHm: args.quietStart,
    endHm: args.quietEnd,
  });
  return nextWorkingStart(afterQuiet, args.businessHours);
}

export function followUpSendAtIso(args: {
  now: Date;
  leadTimeZone: string;
  quietEnabled: boolean;
  quietStart: string | null | undefined;
  quietEnd: string | null | undefined;
  orgTimezone: string;
  workingHoursStart?: string | null;
  workingHoursEnd?: string | null;
  workingDays?: number[] | null;
}): string {
  return computeFollowUpSendAt({
    now: args.now,
    leadTimeZone: args.leadTimeZone,
    quietEnabled: args.quietEnabled,
    quietStart: (args.quietStart ?? "21:00").slice(0, 5),
    quietEnd: (args.quietEnd ?? "08:00").slice(0, 5),
    businessHours: orgWorkingHours({
      timezone: args.orgTimezone,
      start: args.workingHoursStart,
      end: args.workingHoursEnd,
      days: args.workingDays,
    }),
  }).toISOString();
}
