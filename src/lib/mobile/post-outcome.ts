import {
  isRetryableOutcomeError,
  type OutcomeSyncResult,
  type QueuedOutcome,
} from "@/lib/mobile/outcome-queue";

export async function postQueuedOutcome(entry: QueuedOutcome): Promise<OutcomeSyncResult> {
  try {
    const response = await fetch("/api/outcomes/sync", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: entry.leadId,
        channel: entry.channel,
        direction: entry.direction,
        outcome: entry.outcome,
        note: entry.note,
        actorMemberId: entry.actorMemberId,
        clientEventId: entry.clientEventId,
        clientLoggedAt: entry.clientLoggedAt,
        queuedOffline: entry.queuedOffline,
        clientSurface: entry.clientSurface,
        expectedLeadStatus: entry.expectedLeadStatus,
        expectedLastTouchAt: entry.expectedLastTouchAt,
        expectedFirstHumanTouchAt: entry.expectedFirstHumanTouchAt,
      }),
    });
    const json = (await response.json().catch(() => null)) as {
      ok?: boolean;
      duplicate?: boolean;
      discrepancy?: string | null;
      error?: string;
      retryable?: boolean;
    } | null;
    if (response.ok && json?.ok) {
      return {
        ok: true,
        duplicate: Boolean(json.duplicate),
        discrepancy: json.discrepancy ?? null,
      };
    }
    return {
      ok: false,
      error: json?.error ?? "Could not log that outcome.",
      retryable: json?.retryable === true || isRetryableOutcomeError(response.status),
    };
  } catch {
    return { ok: false, error: "No connection.", retryable: true };
  }
}
