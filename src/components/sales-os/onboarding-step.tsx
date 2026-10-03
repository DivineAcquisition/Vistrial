"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveAllGatesAction } from "@/app/app/settings/vistrial/actions";
import { DestinationSettings, GateChoices, WhoCanChange } from "@/components/sales-os/settings-form";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import type { SalesOsSettings } from "@/lib/sales-os/settings";
import { sectionTitle } from "@/lib/ui";

/** The onboarding version: choices are saved together, so every one is a decision rather than a default. */
export function SalesOsOnboardingStep({
  settings,
  managers,
}: {
  settings: SalesOsSettings;
  managers: Array<{ name: string; role: string }>;
}) {
  const router = useRouter();
  const [modes, setModes] = useState(settings.gates);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className={sectionTitle}>What needs your OK</h2>
        <WhoCanChange managers={managers} />
        <GateChoices settings={settings} modes={modes} onChange={(type, mode) => setModes((m) => ({ ...m, [type]: mode }))} />
      </section>
      <section className="space-y-3">
        <h2 className={sectionTitle}>Where things go</h2>
        <DestinationSettings settings={settings} returnTo="onboarding" />
      </section>
      {error ? <Notice tone="critical">{error}</Notice> : null}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          size="lg"
          disabled={pending || !settings.canManage}
          onClick={() =>
            start(async () => {
              const result = await saveAllGatesAction(modes);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              router.push("/app/onboarding/approvals");
            })
          }
        >
          Save and continue
        </Button>
      </div>
    </div>
  );
}
