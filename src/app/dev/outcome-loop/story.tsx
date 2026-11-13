"use client";

import { useState } from "react";

import { MeasuredChanges, OutcomeForm, RESULT_WORDS } from "@/components/research/outcome-loop";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

/** The outcome loop's parts: recording what happened, and the measured change beside it. */
export function OutcomeLoopStory() {
  const [saved, setSaved] = useState<string>("");
  return (
    <main className="mx-auto grid max-w-3xl gap-4 p-4 sm:p-8">
      <h1 className="font-heading text-xl text-foreground">Outcome loop</h1>
      <Panel className="grid gap-3 p-4 sm:p-5">
        <h2 className="font-heading text-base text-card-foreground">Lead with a first-month pilot price</h2>
        <p className="text-sm text-muted-foreground">Check-in due now. Starting figures saved from Meta ads, Jobber bookings.</p>
        <OutcomeForm
          onSubmit={async (result, note) => {
            setSaved(`${RESULT_WORDS[result].label}${note ? `: ${note}` : ""}`);
          }}
        />
        {saved ? <p className="text-xs text-muted-foreground">Saved: {saved}</p> : null}
      </Panel>
      <Panel className="grid gap-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={RESULT_WORDS.better.label} tone={RESULT_WORDS.better.tone} className="[&_span]:normal-case" />
          <span className="text-xs text-muted-foreground">Recorded Nov 8, 2026. The next research session builds on this.</span>
        </div>
        <p className="text-sm text-card-foreground">&ldquo;Ran 20% off the first month for four weeks.&rdquo;</p>
        <MeasuredChanges
          changes={[
            { label: "Meta ads", metric: "spend", before: 1200, after: 1100, percent: -8.3 },
            { label: "Meta ads", metric: "conversions", before: 40, after: 58, percent: 45 },
            { label: "Jobber bookings", metric: "revenue", before: 9800, after: 12400, percent: 26.5 },
          ]}
        />
      </Panel>
      <Panel className="grid gap-2 p-4 sm:p-5">
        <MeasuredChanges changes={[]} />
      </Panel>
    </main>
  );
}
