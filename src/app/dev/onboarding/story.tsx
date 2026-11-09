"use client";

import { useState } from "react";

import { OnboardingWizard, type WizardData, type WizardStage } from "@/components/onboarding/wizard";

const STAGES: WizardStage[] = ["about", "business", "offer", "goal", "review"];
const GOALS = [
  { kind: "leads", label: "Get more leads" },
  { kind: "ads", label: "Make my ads work better" },
  { kind: "competitors", label: "Understand my competitors" },
  { kind: "prices", label: "Price and package my services" },
  { kind: "retention", label: "Keep customers coming back" },
  { kind: "other", label: "Something else" },
] as const;

const READ = {
  name: "DivineACQ",
  offer: "Growth systems for cleaning businesses: ads, follow-up and booking that turn calls into recurring clients",
  area: "United States (remote)",
  audience: "Owners of residential cleaning companies",
};

/** The wizard with an in-memory backend: saving moves on, and the website "reads" after two seconds. */
export function OnboardingStory({ step, site }: { step: string; site: string }) {
  const index = Math.max(0, STAGES.indexOf(step as WizardStage));
  const filledFrom = (at: number) => index > at;
  const [data, setData] = useState<WizardData>(() => ({
    wizardStep: index,
    person: filledFrom(0) ? { fullName: "Jaylen Brooks", role: "Owner", phone: "", heardFrom: "Google search" } : { fullName: "Jaylen Brooks", role: "", phone: "", heardFrom: "" },
    business: {
      name: filledFrom(0) ? "DivineACQ" : "",
      website: filledFrom(0) ? "https://divineacquisition.io/" : "",
      ...(site === "read" || filledFrom(2) ? { offer: READ.offer, area: READ.area, audience: READ.audience } : { offer: "", area: "", audience: "" }),
    },
    goal: filledFrom(3) ? { kind: "leads", text: "More booked recurring cleans from the calls we already get." } : { kind: "", text: "" },
    site: {
      status: site === "reading" ? "reading" : site === "read" || filledFrom(2) ? "read" : "idle",
      url: filledFrom(0) ? "https://divineacquisition.io/" : "",
      summary: "",
      competitors: site === "read" || filledFrom(2) ? ["Cleaning Business Growth", "BrandBooster.ai"] : [],
    },
    goals: GOALS,
  }));

  return (
    <OnboardingWizard
      data={data}
      actions={{
        save: async () => undefined,
        readSite: async (url) => {
          setData((prev) => ({ ...prev, site: { ...prev.site, status: "reading", url } }));
          setTimeout(() => {
            setData((prev) => ({
              ...prev,
              business: { ...prev.business, offer: READ.offer, area: READ.area, audience: READ.audience },
              site: { ...prev.site, status: "read", competitors: ["Cleaning Business Growth", "BrandBooster.ai"] },
            }));
          }, 2000);
        },
        finish: async () => {
          window.alert("Workspace created. Next: the free research session.");
        },
      }}
    />
  );
}
