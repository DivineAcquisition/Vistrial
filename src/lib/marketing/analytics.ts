import type { CtaPosition } from "@/lib/marketing/config";

export const SCROLL_DEPTHS = [25, 50, 75, 100] as const;
export type ScrollDepth = (typeof SCROLL_DEPTHS)[number];

export const MARKETING_EVENT_TYPES = [
  "page_view",
  "cta_click",
  "scroll_depth",
  "form_start",
  "form_complete",
] as const;

export type MarketingEventType = (typeof MARKETING_EVENT_TYPES)[number];
export type MarketingFormId = "qualify" | "contact" | "waitlist";

type EventBase = {
  path: string;
  occurredAt: string;
};

export type PageViewEvent = EventBase & {
  type: "page_view";
  referrer: string;
};

export type CtaClickEvent = EventBase & {
  type: "cta_click";
  position: CtaPosition;
  href: string;
};

export type ScrollDepthEvent = EventBase & {
  type: "scroll_depth";
  depth: ScrollDepth;
};

export type FormStartEvent = EventBase & {
  type: "form_start";
  form: MarketingFormId;
};

export type FormCompleteEvent = EventBase & {
  type: "form_complete";
  form: MarketingFormId;
  position: CtaPosition | null;
};

export type MarketingEvent =
  | PageViewEvent
  | CtaClickEvent
  | ScrollDepthEvent
  | FormStartEvent
  | FormCompleteEvent;

const CTA_POSITIONS: CtaPosition[] = ["nav", "hero", "audit", "waitlist"];
const FORMS: MarketingFormId[] = ["qualify", "contact", "waitlist"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseMarketingEvent(raw: unknown): MarketingEvent | null {
  if (!isObject(raw)) return null;
  const type = raw.type;
  const path = asString(raw.path) ?? "/";
  const occurredAt = asString(raw.occurredAt) ?? new Date().toISOString();

  if (type === "page_view") {
    return { type, path, occurredAt, referrer: asString(raw.referrer) ?? "" };
  }

  if (type === "cta_click") {
    const position = asString(raw.position);
    const href = asString(raw.href);
    if (!position || !href) return null;
    if (!(CTA_POSITIONS as string[]).includes(position)) return null;
    return { type, path, occurredAt, position: position as CtaPosition, href };
  }

  if (type === "scroll_depth") {
    const depth = raw.depth;
    if (depth !== 25 && depth !== 50 && depth !== 75 && depth !== 100) return null;
    return { type, path, occurredAt, depth };
  }

  if (type === "form_start") {
    const form = asString(raw.form);
    if (!form || !(FORMS as string[]).includes(form)) return null;
    return { type, path, occurredAt, form: form as MarketingFormId };
  }

  if (type === "form_complete") {
    const form = asString(raw.form);
    if (!form || !(FORMS as string[]).includes(form)) return null;
    const positionRaw = asString(raw.position);
    const position =
      positionRaw && (CTA_POSITIONS as string[]).includes(positionRaw)
        ? (positionRaw as CtaPosition)
        : null;
    return { type, path, occurredAt, form: form as MarketingFormId, position };
  }

  return null;
}
