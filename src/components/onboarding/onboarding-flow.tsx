"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { HighLevelConnectSlot } from "@/components/connections/highlevel";
import { UploadForm } from "@/components/connections/results-files";
import { OnboardingSetup, type SetupStage } from "@/components/onboarding/setup";
import type { CaptureData } from "@/components/settings/brand-section";
import { connectCards } from "@/lib/onboarding/connect";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** Where an account sign-in comes back to: the app, which shows the Connect step while onboarding is on it. */
const RETURN_PATH = "/app";

/** Onboarding wired to Convex: Website, Connect, Confirm. Confirming starts the first work; the app frame moves on. */
export function OnboardingFlow() {
  const data = useQuery(api.onboarding.mine, {});
  const workspaceId = (data?.workspaceId ?? null) as Id<"workspaces"> | null;
  const capture = useQuery(api.siteCapture.latest, workspaceId ? { workspaceId } : "skip");
  const onConnect = data?.stage === "connect" && workspaceId;
  const meta = useQuery(api.metaAds.status, onConnect ? { workspaceId } : "skip");
  const providers = useQuery(api.integrations.list, onConnect || data?.stage === "confirm" ? (workspaceId ? { workspaceId } : "skip") : "skip");
  const highLevel = useQuery(api.highLevel.status, workspaceId && (data?.stage === "connect" || data?.stage === "confirm") ? { workspaceId } : "skip");
  const uploads = useQuery(api.resultUploads.list, workspaceId && (data?.stage === "connect" || data?.stage === "confirm") ? { workspaceId } : "skip");
  const submitWebsite = useMutation(api.onboarding.submitWebsite);
  const skipWebsite = useMutation(api.onboarding.skipWebsite);
  const goTo = useMutation(api.onboarding.goTo);
  const confirm = useMutation(api.onboarding.confirm);
  const startMeta = useMutation(api.metaAds.startConnect);
  const startProvider = useMutation(api.integrations.startConnect);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");

  if (data === undefined || (workspaceId && capture === undefined)) return <div className="min-h-dvh bg-background" aria-busy="true" />;
  const stage = (["website", "connect", "confirm"].includes(data.stage) ? data.stage : "website") as SetupStage;
  const cards = connectCards({
    meta: meta ? { configured: meta.configured, connected: meta.connection?.status === "connected", label: meta.connection?.adAccountName ?? meta.connection?.metaUserName ?? null } : null,
    providers: providers?.providers ?? [],
    uploads: uploads?.length ?? 0,
    highLevel: highLevel ? { configured: highLevel.configured, connected: highLevel.connection?.status === "connected", label: highLevel.connection?.accountName ?? null } : null,
  });
  const returned = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("highlevel");
  const origin = typeof window === "undefined" ? undefined : window.location.origin;

  return (
    <OnboardingSetup
      // The Confirm step prefills from what was found, so it starts afresh when the reading finishes.
      key={`${stage}:${capture?.id ?? "none"}:${capture?.status ?? ""}`}
      data={{ stage, person: data.person, business: data.business, goal: data.goal, goals: data.goals, hasWorkspace: Boolean(workspaceId) }}
      capture={(capture ?? null) as CaptureData | null}
      connect={cards}
      crm={workspaceId ? <HighLevelConnectSlot workspaceId={workspaceId} returnPath={RETURN_PATH} returned={returned} /> : null}
      upload={
        uploading && workspaceId ? (
          <div className="grid gap-2 rounded-xl border border-border bg-card p-4">
            <UploadForm workspaceId={workspaceId} onNotice={setNotice} />
            {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
          </div>
        ) : null
      }
      actions={{
        submitWebsite: (url) => submitWebsite({ url }),
        skipWebsite: () => skipWebsite({}),
        goTo: (next) => goTo({ stage: next }),
        connect: async (key) => {
          if (!workspaceId) return;
          if (key === "results") {
            setUploading(true);
            return;
          }
          const { url } = key === "meta" ? await startMeta({ workspaceId, returnOrigin: origin, returnPath: RETURN_PATH }) : await startProvider({ workspaceId, provider: key, returnOrigin: origin, returnPath: RETURN_PATH });
          window.location.assign(url);
        },
        confirm: (payload) => confirm(payload),
      }}
    />
  );
}
