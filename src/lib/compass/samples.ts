import type { UIMessage } from "ai";

import type { CompassAnswerMeta, CompassSource, SuggestedAction } from "@/lib/compass/types";

/**
 * Sample Compass conversations for the layout reference. Made-up leads and
 * numbers; nothing here is read from or sent to a workspace.
 */

export const COMPASS_SAMPLE_STATES = [
  { id: "empty", label: "Empty" },
  { id: "streaming", label: "Looking it up" },
  { id: "answer", label: "Answer with sources" },
  { id: "no_data", label: "No data" },
  { id: "unverified", label: "Unchecked figure" },
  { id: "suggestion", label: "Suggested action" },
  { id: "error", label: "Error" },
  { id: "limit", label: "Limit reached" },
  { id: "legacy", label: "Earlier conversation" },
] as const;

export type CompassSampleState = (typeof COMPASS_SAMPLE_STATES)[number]["id"];

export function isCompassSampleState(value: unknown): value is CompassSampleState {
  return COMPASS_SAMPLE_STATES.some((item) => item.id === value);
}

const LEAD_A = "5a5a0000-0000-4000-8000-000000000001";
const LEAD_B = "5a5a0000-0000-4000-8000-000000000002";

const SOURCES: CompassSource[] = [
  {
    kind: "metric",
    metric: "response_rate",
    label: "Answered inside the window",
    range: "Last 7 days",
    href: "/app/results/leads?metric=response_late&range=last_7_days",
    definition: "/app/compass/definitions#response_rate",
  },
  { kind: "lead", id: LEAD_A, label: "Jordan Avery", href: `/app/cases/${LEAD_A}` },
  { kind: "lead", id: LEAD_B, label: "Sam Rivera", href: `/app/cases/${LEAD_B}` },
];

function user(id: string, text: string): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

function assistant(id: string, parts: unknown[], meta?: CompassAnswerMeta): UIMessage {
  return { id, role: "assistant", parts: parts as UIMessage["parts"], ...(meta ? { metadata: meta } : {}) };
}

function tool(name: string, output: unknown, state: "output-available" | "input-available" = "output-available") {
  return { type: `tool-${name}`, toolCallId: `call-${name}`, state, input: {}, ...(state === "output-available" ? { output } : {}) };
}

const QUESTION = "How did our response time look this week?";

const ANSWER = [
  tool("response_health", { ok: true, sources: SOURCES.slice(0, 1), data: { rate: 0.75 } }),
  tool("metric_leads", { ok: true, sources: SOURCES.slice(1), data: { rows: 2 } }),
  {
    type: "text",
    text: "This week **75%** of new leads were answered inside your response window (18 of 24). Two of the late ones are still open: Jordan Avery and Sam Rivera.",
  },
];

const SUGGESTION: SuggestedAction = {
  id: "sample-suggestion",
  kind: "relay_draft",
  description: "Ask Relay to draft a follow-up for Jordan Avery. It goes to the approval queue; nothing is sent until someone approves it.",
  leadId: LEAD_A,
  leadLabel: "Jordan Avery",
  needsConfirm: true,
};

export function compassSample(state: CompassSampleState): { messages: UIMessage[]; error: string | null; readOnly: boolean } {
  switch (state) {
    case "empty":
      return { messages: [], error: null, readOnly: false };
    case "streaming":
      return {
        messages: [user("u1", QUESTION), assistant("a1", [tool("response_health", null, "input-available")])],
        error: null,
        readOnly: false,
      };
    case "answer":
      return { messages: [user("u1", QUESTION), assistant("a1", ANSWER, { sources: SOURCES, outcome: "answered", route: "fast" })], error: null, readOnly: false };
    case "no_data":
      return {
        messages: [
          user("u1", "How much revenue did we make last month?"),
          assistant(
            "a1",
            [
              tool("pipeline", { ok: false, gap: "missing", sources: [] }),
              { type: "text", text: "I don't have that. This workspace doesn't record payments yet, so there is no revenue to count. Results shows revenue once payments are connected." },
            ],
            { sources: [], outcome: "no_data", route: "fast" }
          ),
        ],
        error: null,
        readOnly: false,
      };
    case "unverified":
      return {
        messages: [
          user("u1", QUESTION),
          assistant(
            "a1",
            [ANSWER[0], { type: "text", text: "75% of new leads were answered inside the window, up from about 60% the week before." }],
            { sources: SOURCES.slice(0, 1), outcome: "unverified", unverified: ["60%"], route: "fast" }
          ),
        ],
        error: null,
        readOnly: false,
      };
    case "suggestion":
      return {
        messages: [
          user("u1", "What should happen next with Jordan Avery?"),
          assistant(
            "a1",
            [
              tool("read_case_file", { ok: true, sources: SOURCES.slice(1, 2) }),
              { type: "text", text: "Jordan asked about price on Tuesday and hasn't heard back since. A short follow-up that answers the price question is the next step." },
              tool("suggest_action", { ok: true, sources: [], data: { suggestion: SUGGESTION } }),
            ],
            { sources: SOURCES.slice(1, 2), outcome: "answered", route: "reasoning" }
          ),
        ],
        error: null,
        readOnly: false,
      };
    case "error":
      return { messages: [user("u1", QUESTION)], error: "Compass couldn't finish this answer. Nothing was changed. Try again.", readOnly: false };
    case "limit":
      return {
        messages: [user("u1", QUESTION)],
        error: "You've reached today's limit for Compass questions. It resets tomorrow. If you need more, ask your team from Help.",
        readOnly: false,
      };
    case "legacy":
      return {
        messages: [user("u1", "Where are my leads leaking?"), assistant("a1", [{ type: "text", text: "An earlier answer from Ask Vistrial." }])],
        error: null,
        readOnly: true,
      };
  }
}
