"use client";

import { AGENT_INTENTS, AGENT_INTENT_COPY, type AgentIntent } from "@/lib/agent-elements/intent";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";

export function IntentSelector({
  value,
  onChange,
  disabled = false,
  described = true,
}: {
  value: AgentIntent;
  onChange: (value: AgentIntent) => void;
  disabled?: boolean;
  described?: boolean;
}) {
  return (
    <div className={disabled ? "pointer-events-none opacity-64" : undefined}>
      <SegmentedRadioGroup
        aria-label="What should Vistrial do"
        size="sm"
        value={value}
        onValueChange={(next) => {
          if (next === "lookup" || next === "draft" || next === "propose") onChange(next);
        }}
        options={AGENT_INTENTS.map((intent) => ({ value: intent, label: AGENT_INTENT_COPY[intent].label }))}
      />
      {described ? <p className="mt-1.5 text-xs text-muted-foreground">{AGENT_INTENT_COPY[value].description}</p> : null}
    </div>
  );
}
