"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { showWelcomeBanner } from "@/lib/home/simple";

export function WelcomeBanner({ orgId, wentLiveAt }: { orgId: string; wentLiveAt: string | null }) {
  const key = `vistrial:welcome-banner:${orgId}`;
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!showWelcomeBanner(wentLiveAt)) return;
    if (window.localStorage.getItem(key) === "dismissed") return;
    setVisible(true);
  }, [key, wentLiveAt]);
  if (!visible) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3" role="status">
      <p className="text-sm text-card-foreground">We watch. We suggest. You approve. We learn.</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          window.localStorage.setItem(key, "dismissed");
          setVisible(false);
        }}
      >
        Dismiss
      </Button>
    </div>
  );
}
