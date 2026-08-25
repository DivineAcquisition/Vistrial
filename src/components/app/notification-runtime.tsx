"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function NotificationRuntime() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const nid = searchParams.get("nid");
    if (!nid) return;
    const supabase = createClient();
    const now = new Date().toISOString();
    void supabase
      .from("notifications")
      .update({ status: "acted", acted_at: now, updated_at: now })
      .eq("id", nid);
  }, [searchParams]);

  useEffect(() => {
    if (!pathname.startsWith("/app")) return;
    const path = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
    const beat = () => {
      void fetch("/api/notifications/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
    };
    beat();
    const timer = window.setInterval(beat, 20000);
    return () => window.clearInterval(timer);
  }, [pathname, searchParams]);

  return null;
}
