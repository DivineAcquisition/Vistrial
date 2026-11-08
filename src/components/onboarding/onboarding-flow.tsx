"use client";

import { useMutation, useQuery } from "convex/react";

import { OnboardingWizard } from "@/components/onboarding/wizard";
import { api } from "../../../convex/_generated/api";

/** The wizard wired to Convex. Finishing it creates the workspace; the app frame then moves on. */
export function OnboardingFlow() {
  const data = useQuery(api.onboarding.mine, {});
  const save = useMutation(api.onboarding.save);
  const readSite = useMutation(api.onboarding.readSite);
  const finish = useMutation(api.onboarding.finish);

  if (data === undefined) {
    return <div className="min-h-dvh bg-background" aria-busy="true" />;
  }
  return (
    <OnboardingWizard
      data={data}
      actions={{
        save: (stage, patch) => save({ stage, ...patch }),
        readSite: (url) => readSite({ url }),
        finish: ({ serviceTeamAccess }) => finish({ serviceTeamAccess }),
      }}
    />
  );
}
