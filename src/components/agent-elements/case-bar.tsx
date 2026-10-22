"use client";

import { useState } from "react";

import { AgentComposer } from "@/components/agent-elements/composer";
import { COMPASS_OPEN_EVENT, type CompassOpenDetail } from "@/components/compass/panel";
import { OPERATOR_OPEN_RUN_EVENT, type OperatorOpenDetail } from "@/components/operator/open-run-button";
import type { AgentIntent } from "@/lib/agent-elements/intent";

/** Ask about the open case file. Look up and draft stay on Compass. Propose opens a change that waits for an OK. */
export function CaseAgentBar({ leadName }: { leadName: string }) {
  const [value, setValue] = useState("");
  const [intent, setIntent] = useState<AgentIntent>("lookup");
  const suggestions = [
    { label: "What should we do next?", value: `What should we do next for ${leadName}?` },
    { label: "Draft a follow-up", value: `Draft a follow-up for ${leadName}.` },
    { label: "Propose the next owner", value: `Propose who should own ${leadName} next.` },
  ];

  return (
    <div className="mb-6">
      <AgentComposer
        value={value}
        onChange={setValue}
        intent={intent}
        onIntentChange={setIntent}
        contextLabel={leadName}
        placeholder={`Ask about ${leadName}`}
        suggestions={suggestions}
        onSend={(text) => {
          if (intent === "propose") {
            window.dispatchEvent(new CustomEvent<OperatorOpenDetail>(OPERATOR_OPEN_RUN_EVENT, { detail: { request: text, intent } }));
          } else {
            window.dispatchEvent(new CustomEvent<CompassOpenDetail>(COMPASS_OPEN_EVENT, { detail: { question: text, send: true, intent } }));
          }
          setValue("");
        }}
      />
    </div>
  );
}
