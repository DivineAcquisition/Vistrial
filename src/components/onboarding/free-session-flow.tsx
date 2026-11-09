"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";

import { Loader2 } from "@/components/icons";
import { FreeSession, type FreeSessionData } from "@/components/onboarding/free-session";
import { useSession } from "@/components/sessions/use-session";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Onboarding = NonNullable<ReturnType<typeof useOnboarding>>;
const useOnboarding = () => useQuery(api.onboarding.mine, {});

/** The free session and paywall wired to Convex. Paying (or no billing here) moves the person into the app. */
export function FreeSessionFlow() {
  const data = useOnboarding();
  if (data === undefined || !data.workspaceId) return <div className="min-h-dvh bg-background" aria-busy="true" />;
  return <Wired data={data} workspaceId={data.workspaceId as Id<"workspaces">} />;
}

function Wired({ data, workspaceId }: { data: Onboarding; workspaceId: Id<"workspaces"> }) {
  const startFree = useMutation(api.onboarding.startFree);
  const showPaywall = useMutation(api.onboarding.showPaywall);
  const unlock = useMutation(api.onboarding.unlock);
  const subscribe = useAction(api.billingActions.subscribe);
  const refresh = useAction(api.billingActions.refresh);
  const projectId = data.freeProjectId as Id<"researchProjects"> | null;
  const confirming = usePaidReturn(workspaceId, refresh, unlock);

  // The session starts by itself the first time this screen opens.
  const started = useRef(false);
  const [startError, setStartError] = useState<unknown>(null);
  useEffect(() => {
    if (data.stage !== "freeSession" || data.freeRunId || started.current) return;
    started.current = true;
    startFree({}).catch((problem: unknown) => setStartError(problem));
  }, [data.stage, data.freeRunId, startFree]);

  if (confirming) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background p-6">
        <p className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
          <Loader2 aria-hidden className="size-4 animate-spin text-primary motion-reduce:animate-none" /> Confirming your payment and unlocking Vistrial…
        </p>
      </div>
    );
  }

  const view = (session: FreeSessionData["session"]) => (
    <FreeSession
      data={{
        stage: data.stage === "paywall" ? "paywall" : "freeSession",
        workspaceId,
        business: data.business,
        freeAttempts: data.freeAttempts,
        maxAttempts: 2,
        billing: data.billing,
        session,
      }}
      actions={{
        start: async () => {
          setStartError(null);
          await startFree({});
        },
        paywall: (open) => showPaywall({ open }),
        subscribe: () =>
          subscribe({ workspaceId, returnOrigin: typeof window === "undefined" ? undefined : window.location.origin, returnPath: "/app?paid=plan" }),
        unlock: () => unlock({}),
      }}
      startError={startError}
    />
  );

  if (!projectId) return view(null);
  return <WithSession workspaceId={workspaceId} projectId={projectId} render={view} />;
}

function WithSession({
  workspaceId,
  projectId,
  render,
}: {
  workspaceId: Id<"workspaces">;
  projectId: Id<"researchProjects">;
  render: (session: FreeSessionData["session"]) => React.ReactNode;
}) {
  const session = useSession(workspaceId, projectId);
  return <>{render(session)}</>;
}

/**
 * Back from Stripe with ?paid=plan: Autumn may not have told us yet, so read the plan from Autumn a few
 * times and move on as soon as it shows as paid.
 */
function usePaidReturn(
  workspaceId: Id<"workspaces">,
  refresh: (args: { workspaceId: Id<"workspaces"> }) => Promise<null>,
  unlock: (args: Record<string, never>) => Promise<{ unlocked: boolean }>,
) {
  const [confirming, setConfirming] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("paid") === "plan");
  const handled = useRef(false);
  useEffect(() => {
    if (!confirming || handled.current) return;
    handled.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("paid");
    window.history.replaceState(null, "", url.toString());
    void (async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await refresh({ workspaceId }).catch(() => null);
        const result = await unlock({}).catch(() => ({ unlocked: false }));
        // Unlocked: the app frame moves on by itself.
        if (result.unlocked) return;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      setConfirming(false);
    })();
  }, [confirming, workspaceId, refresh, unlock]);
  return confirming;
}
