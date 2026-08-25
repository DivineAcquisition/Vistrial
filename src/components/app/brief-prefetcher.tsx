"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type UpcomingItem = {
  leadId: string;
};

export function BriefPrefetcher() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function prefetch() {
      const response = await fetch("/api/briefs/upcoming", { credentials: "include" });
      if (!response.ok) return;
      const json = (await response.json()) as { items?: UpcomingItem[] };
      if (cancelled) return;
      const items = json.items ?? [];
      try {
        sessionStorage.setItem("vistrial:upcoming-briefs", JSON.stringify(items));
      } catch {
        // Quota is not a reason to skip route prefetch.
      }
      for (const item of items) {
        router.prefetch(`/app/cases/${item.leadId}/brief`);
      }
    }
    void prefetch();
    const timer = window.setInterval(() => void prefetch(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [router]);

  return null;
}
