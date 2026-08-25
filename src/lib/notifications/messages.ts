import { appUrl } from "@/lib/app-url";
import { leadDisplayName, sanitizeNotificationText } from "@/lib/notifications/copy";

export function notificationHref(path: string): string {
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  return `${appUrl()}${trimmed}`;
}

export function hrefWithNotification(href: string, notificationId: string): string {
  const url = new URL(href, appUrl());
  url.searchParams.set("nid", notificationId);
  return url.toString();
}

export function speedToLeadCopy(
  names: string[],
  minutes: number,
  assigned = true
): { title: string; body: string } {
  if (names.length === 1) {
    return {
      title: `${leadDisplayName(names[0])} has been waiting ${minutes} minutes`,
      body: sanitizeNotificationText(
        assigned ? "Assigned to you. Open the queue." : "Unassigned. Open the queue."
      ),
    };
  }
  return {
    title: `${names.length} leads are past the speed-to-lead window`,
    body: sanitizeNotificationText("Open the queue."),
  };
}

export function unassignedReadyCopy(name: string | null): { title: string; body: string } {
  return {
    title: `${leadDisplayName(name)} is ready and unassigned`,
    body: sanitizeNotificationText("A high-scoring lead has nobody responsible."),
  };
}

export function ghostDigestCopy(count: number): { title: string; body: string } {
  return {
    title: `${count} lead${count === 1 ? " is" : "s are"} approaching ghost`,
    body: sanitizeNotificationText("Open case files before they go quiet."),
  };
}

export function pendingDraftCopy(name: string | null, escalate: boolean): { title: string; body: string } {
  return {
    title: escalate
      ? `A follow-up for ${leadDisplayName(name)} is stale`
      : `A follow-up for ${leadDisplayName(name)} still needs approval`,
    body: sanitizeNotificationText("Open the draft. It cannot send after it expires."),
  };
}

export function callSoonCopy(name: string | null): { title: string; body: string } {
  return {
    title: `Call with ${leadDisplayName(name)} starts in 30 minutes`,
    body: sanitizeNotificationText("Open the pre-call brief."),
  };
}

export function unmatchedCopy(count: number, escalate: boolean): { title: string; body: string } {
  return {
    title: escalate
      ? `${count} unmatched transcripts need a person`
      : `${count} unmatched transcript${count === 1 ? "" : "s"}`,
    body: sanitizeNotificationText("Open integrations to match or discard."),
  };
}

export function ingestionStalledCopy(): { title: string; body: string } {
  return {
    title: "Ingestion has stalled",
    body: sanitizeNotificationText("No events are processing. Open integrations."),
  };
}

export function crmBrokenCopy(): { title: string; body: string } {
  return {
    title: "CRM connection is broken",
    body: sanitizeNotificationText("Token refresh failed. Follow-up dispatch is halted."),
  };
}

export function jobFailureCopy(job: string): { title: string; body: string } {
  return {
    title: `${job} did not run`,
    body: sanitizeNotificationText("Staff only. Clients do not see this."),
  };
}

export function adoptionCopy(alarmCount: number): { title: string; body: string } {
  return {
    title: `${alarmCount} adoption warning${alarmCount === 1 ? "" : "s"} this week`,
    body: sanitizeNotificationText("Open adoption. This is a trend, not an interruption."),
  };
}

export function hourlySummaryCopy(count: number): { title: string; body: string } {
  return {
    title: `${count} more alerts were rolled up this hour`,
    body: sanitizeNotificationText("Open the queue. The cap held; this is the overflow."),
  };
}

export function testSendCopy(channel: string): { title: string; body: string } {
  return {
    title: `Vistrial test on ${channel}`,
    body: sanitizeNotificationText("If you received this, this channel is working."),
  };
}
