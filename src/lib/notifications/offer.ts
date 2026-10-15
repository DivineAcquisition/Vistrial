import type { GhlDb } from "@/lib/ghl/tokens";
import { NOTIFICATION_HOURLY_CAP, NOTIFICATION_WORKSPACE_HOURLY_CAP } from "@/lib/notifications/constants";
import { exemptFromLimits, groupHoldUntil, interruptCapped, isCriticalEvent, shouldGroup } from "@/lib/notifications/decisions";
import { appendToBatch, enqueueNotification } from "@/lib/notifications/enqueue";
import { isInsideQuiet, isWithinWorkingHours, nextQuietEnd, nextWorkingStart } from "@/lib/notifications/hours";
import { hourlySummaryCopy, notificationHref } from "@/lib/notifications/messages";
import {
  hourlyCount,
  isEmergency,
  isMuted,
  loadPreferenceOverrides,
  muteApplies,
  pickChannel,
  skipSelf,
  workspaceHourlyCount,
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
    /** Skip instead of falling back when the requested channel is not allowed. */
    exactChannel?: boolean;
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
  if (args.exactChannel && channel !== input.channel) return "skipped";

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

  let sendAfter =
    emergency || args.skipWorkingHours || isWithinWorkingHours(now, args.target.hours)
      ? now
      : nextWorkingStart(now, args.target.hours);

  if (
    !emergency &&
    !exemptFromLimits(input.eventType) &&
    args.target.quiet &&
    isInsideQuiet(now, args.target.quiet, args.target.hours.timeZone)
  ) {
    const resume = nextQuietEnd(now, args.target.quiet, args.target.hours.timeZone);
    if (resume.getTime() > sendAfter.getTime()) sendAfter = resume;
  }

  if (channel !== "team" && channel !== "da_console") {
    const exempt = exemptFromLimits(input.eventType);
    const person = exempt || input.isTest ? 0 : await hourlyCount(db, args.target.userId, now);
    const workspace =
      exempt || input.isTest || !input.orgId ? 0 : await workspaceHourlyCount(db, input.orgId, now);
    if (
      interruptCapped({
        personCount: person,
        workspaceCount: workspace,
        eventType: input.eventType,
        isTest: Boolean(input.isTest),
      }) === "summarize"
    ) {
      const overflow = Math.max(
        person - NOTIFICATION_HOURLY_CAP + 1,
        workspace - NOTIFICATION_WORKSPACE_HOURLY_CAP + 1,
        1
      );
      const critical = isCriticalEvent(input.eventType);
      const summary = hourlySummaryCopy(overflow, critical);
      const summaryId = await enqueueNotification(db, {
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
        isEmergency: critical,
        sendAfter: critical ? now : sendAfter,
      });
      if (summaryId && critical) {
        await db
          .from("notifications")
          .update({
            title: summary.title,
            body: summary.body,
            is_emergency: true,
            updated_at: now.toISOString(),
          })
          .eq("id", summaryId)
          .eq("status", "queued");
      }
      return "capped";
    }
  }

  const hold = emergency ? null : groupHoldUntil(now, input.eventType, Boolean(args.batch));
  if (hold && hold.getTime() > sendAfter.getTime()) sendAfter = hold;

  if (args.batch && shouldGroup(input.eventType) && !emergency) {
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
    batchKey: args.batch && shouldGroup(input.eventType) && !emergency ? args.batch.key : input.batchKey,
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
