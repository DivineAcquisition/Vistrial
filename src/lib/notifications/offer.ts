import type { GhlDb } from "@/lib/ghl/tokens";
import { NOTIFICATION_HOURLY_CAP } from "@/lib/notifications/constants";
import { appendToBatch, enqueueNotification } from "@/lib/notifications/enqueue";
import { isWithinWorkingHours, nextWorkingStart } from "@/lib/notifications/hours";
import { hourlySummaryCopy, notificationHref } from "@/lib/notifications/messages";
import {
  hourlyCount,
  isEmergency,
  isMuted,
  loadPreferenceOverrides,
  muteApplies,
  overHourlyCap,
  pickChannel,
  skipSelf,
} from "@/lib/notifications/policy";
import type { EnqueueInput, MemberNotifyTarget, NotificationChannel } from "@/lib/notifications/types";

export async function offerToMember(
  db: GhlDb,
  args: {
    target: MemberNotifyTarget;
    input: Omit<EnqueueInput, "recipientUserId" | "recipientMemberId" | "sendAfter">;
    now?: Date;
    isEscalationToAdmin?: boolean;
    orgSmsEnabled?: boolean;
    forceChannel?: boolean;
    skipWorkingHours?: boolean;
    batch?: {
      key: string;
      subjectId: string;
      title: string;
      body: string;
      forCount?: (count: number) => { title: string; body: string };
    };
  }
): Promise<"enqueued" | "batched" | "skipped" | "capped"> {
  const now = args.now ?? new Date();
  const input = args.input;
  if (skipSelf(input.actorUserId, args.target.userId)) return "skipped";

  const emergency = input.isEmergency || isEmergency(input.eventType);
  const overrides = await loadPreferenceOverrides(db, args.target.memberId, input.eventType);
  const channel = pickChannel({
    role: args.target.role,
    eventType: input.eventType,
    requested: input.channel,
    overrides,
    isEscalationToAdmin: Boolean(args.isEscalationToAdmin),
    forceChannel: args.forceChannel || input.isTest,
    orgSmsEnabled: args.orgSmsEnabled,
  });
  if (!channel) return "skipped";

  if (
    muteApplies({
      emergency,
      isEscalationToAdmin: Boolean(args.isEscalationToAdmin),
      eventType: input.eventType,
    }) &&
    (await isMuted(db, args.target.memberId, now))
  ) {
    return "skipped";
  }

  const sendAfter =
    emergency || args.skipWorkingHours || isWithinWorkingHours(now, args.target.hours)
      ? now
      : nextWorkingStart(now, args.target.hours);

  if (!emergency && channel !== "team" && channel !== "da_console" && !input.isTest) {
    const count = await hourlyCount(db, args.target.userId, now);
    if (overHourlyCap(count)) {
      const summary = hourlySummaryCopy(count - NOTIFICATION_HOURLY_CAP + 1);
      await enqueueNotification(db, {
        orgId: input.orgId,
        eventType: "hourly_summary",
        channel,
        recipientUserId: args.target.userId,
        recipientMemberId: args.target.memberId,
        subjectIds: input.subjectIds,
        title: summary.title,
        body: summary.body,
        href: notificationHref("/app/queue"),
        dedupeKey: `hourly_summary:${args.target.userId}:${Math.floor(now.getTime() / 3600000)}`,
        sendAfter,
      });
      return "capped";
    }
  }

  if (args.batch) {
    const batched = await appendToBatch(db, {
      orgId: input.orgId ?? "",
      batchKey: args.batch.key,
      subjectId: args.batch.subjectId,
      title: args.batch.title,
      body: args.batch.body,
      forCount: args.batch.forCount,
    });
    if (batched) return "batched";
  }

  const id = await enqueueNotification(db, {
    ...input,
    channel,
    recipientUserId: args.target.userId,
    recipientMemberId: args.target.memberId,
    sendAfter,
  });
  return id ? "enqueued" : "skipped";
}

export async function offerTeam(
  db: GhlDb,
  input: Omit<EnqueueInput, "recipientUserId" | "recipientMemberId" | "channel">
): Promise<void> {
  await enqueueNotification(db, {
    ...input,
    channel: "team" satisfies NotificationChannel,
    recipientUserId: null,
    recipientMemberId: null,
  });
}

export async function offerDaConsole(
  db: GhlDb,
  input: Omit<EnqueueInput, "recipientUserId" | "recipientMemberId" | "channel">
): Promise<void> {
  await enqueueNotification(db, {
    ...input,
    channel: "da_console",
    recipientUserId: null,
    recipientMemberId: null,
    sendAfter: new Date(),
  });
}
