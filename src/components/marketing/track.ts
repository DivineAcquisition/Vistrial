import type { MarketingEvent } from "@/lib/marketing/analytics";

const ENDPOINT = "/api/marketing/events";

type TrackInput = MarketingEvent extends infer Event
  ? Event extends MarketingEvent
    ? Omit<Event, "path" | "occurredAt"> & { path?: string }
    : never
  : never;

function payload(event: TrackInput): MarketingEvent {
  return {
    ...event,
    path: event.path ?? (typeof window === "undefined" ? "/" : window.location.pathname),
    occurredAt: new Date().toISOString(),
  } as MarketingEvent;
}

/** Fire-and-forget. Beacon when the tab is closing; fetch otherwise. */
export function trackMarketingEvent(event: TrackInput) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify(payload(event));
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
  } catch {
    /* fall through to fetch */
  }
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
