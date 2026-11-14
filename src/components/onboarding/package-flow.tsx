"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import Logo from "@/components/brand/logo";
import { FirstPackage } from "@/components/home/first-package";
import { ArrowRight, Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { errorWords } from "@/lib/research/words";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/**
 * Go: right after Confirm, the first package runs here with its live progress, and its reports open as they
 * arrive. The rest of Vistrial opens with the plan; the paywall sits under the package (decision D4).
 */
export function PackageFlow() {
  const data = useQuery(api.onboarding.mine, {});
  const showPaywall = useMutation(api.onboarding.showPaywall);
  const unlock = useMutation(api.onboarding.unlock);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (data === undefined || !data.workspaceId) return <div className="min-h-dvh bg-background" aria-busy="true" />;
  const workspaceId = data.workspaceId as Id<"workspaces">;
  const next = async () => {
    setBusy(true);
    setError("");
    try {
      // No billing on this deployment (or already paid): straight in. Otherwise the plan.
      const result = await unlock({});
      if (!result.unlocked) await showPaywall({ open: true });
    } catch (cause) {
      setError(errorWords(cause, "That did not open."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-h-dvh bg-background px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-8">
        <header className="flex items-center gap-2.5">
          <Logo markOnly className="size-8" title="" />
          <span className="font-heading text-lg text-strong">Vistrial</span>
        </header>
        <FirstPackage
          workspaceId={workspaceId}
          keepWhenDismissed
          footer={
            <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">Your package keeps going while you look around. Open the rest of Vistrial to run more research, offers and creative.</p>
              <Button variant="gradient" disabled={busy} onClick={() => void next()}>
                {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
                Open Vistrial <ArrowRight aria-hidden />
              </Button>
            </div>
          }
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
