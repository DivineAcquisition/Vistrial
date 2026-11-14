"use client";

import { useState } from "react";

import { ChecklistView, type ChecklistData } from "@/components/work/call-checklist";

import { StoryFrame } from "../work-tabs/story-frame";

/** A coaching agency's call with Jordan Lee. Sample data. */
function data(state: string): ChecklistData {
  const empty = state === "empty";
  return {
    leadName: "Jordan Lee",
    startsAt: 0,
    timezone: "America/New_York",
    script: empty
      ? []
      : [
          { stage: "Open", items: [{ id: "script:s1", text: "Confirm the time they have and what they want from the call", note: null }] },
          {
            stage: "Discover",
            items: [
              { id: "script:s2", text: "Ask what a full calendar would be worth to them", note: null },
              { id: "script:s3", text: "Ask who else has a say in the decision", note: null },
            ],
          },
          { stage: "Close", items: [{ id: "script:s4", text: "Ask for the decision on the call", note: null }] },
        ],
    lead: empty
      ? []
      : [
          { id: "open:a", text: "What made you book now, after the webinar?", note: "Opening question" },
          { id: "cover:b", text: "Their busy season starts in March", note: "Your data" },
          { id: "ask:c", text: "Find out: who signs off", note: "Not established yet" },
          { id: "objection:d", text: "Be ready for: It costs more than I expected", note: "Heard on the first call" },
          { id: "promise:e", text: "Follow through: send the case study", note: "Promised by the rep" },
        ],
    objections: empty
      ? []
      : [
          { title: "It costs more than I expected", heardWords: "Heard on 7 calls", track: "Put it next to what one more client a month is worth to them, then ask which number matters more." },
          { title: "I need to talk to my partner", heardWords: "Heard on 4 calls", track: null },
          { title: "Now is not the right time", heardWords: "Heard on 2 calls", track: null },
        ],
    leadMissing: empty ? "No brief for this call yet. Ask for one in Calls, and its points appear here." : null,
    scriptMissing: empty ? "No script steps in the Playbook yet. Add them in the Playbook interview, and they appear here in call order." : null,
    ticked: state === "ticked" ? ["script:s1", "script:s2", "open:a"] : [],
    canTick: state !== "viewer",
  };
}

export function CallChecklistStory({ state, theme }: { state: string; theme: string }) {
  const [ticked, setTicked] = useState(data(state).ticked);
  return (
    <StoryFrame theme={theme} role={state === "viewer" ? "viewer" : "owner"}>
      <ChecklistView data={{ ...data(state), ticked }} onTick={(id, on) => setTicked((now) => (on ? [...now, id] : now.filter((row) => row !== id)))} onClose={() => undefined} />
    </StoryFrame>
  );
}
