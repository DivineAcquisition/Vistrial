"use client";

import { useEffect } from "react";

import { SCROLL_DEPTHS, type ScrollDepth } from "@/lib/marketing/analytics";
import type { CtaPosition } from "@/lib/marketing/config";
import { trackMarketingEvent } from "@/components/marketing/track";

const CTA_POSITIONS: CtaPosition[] = ["nav", "hero", "audit", "waitlist"];

function positionFrom(value: string | null): CtaPosition | null {
  if (value && (CTA_POSITIONS as string[]).includes(value)) return value as CtaPosition;
  return null;
}

export function MarketingAnalytics() {
  useEffect(() => {
    trackMarketingEvent({
      type: "page_view",
      referrer: document.referrer,
    });

    const seen = new Set<ScrollDepth>();
    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      const percent = max <= 0 ? 100 : Math.round((el.scrollTop / max) * 100);
      for (const depth of SCROLL_DEPTHS) {
        if (percent >= depth && !seen.has(depth)) {
          seen.add(depth);
          trackMarketingEvent({ type: "scroll_depth", depth });
        }
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("[data-cta-position]");
      if (!(link instanceof HTMLElement)) return;
      const position = positionFrom(link.getAttribute("data-cta-position"));
      if (!position) return;
      const href = link instanceof HTMLAnchorElement ? link.href : link.getAttribute("href") ?? "";
      trackMarketingEvent({ type: "cta_click", position, href });
    };
    document.addEventListener("click", onClick);

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick);
    };
  }, []);

  return null;
}
