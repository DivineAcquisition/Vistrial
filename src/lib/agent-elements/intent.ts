/**
 * The three ways a person can ask Vistrial. The value is an enum, never free
 * text, so a request cannot smuggle extra instructions into the prompt.
 *
 * Look up and draft stay on Compass. Propose opens the operator, which can
 * only stage a change until the person confirms it.
 */

export const AGENT_INTENTS = ["lookup", "draft", "propose"] as const;

export type AgentIntent = (typeof AGENT_INTENTS)[number];

export const AGENT_INTENT_COPY: Record<AgentIntent, { label: string; description: string }> = {
  lookup: {
    label: "Look up",
    description: "Answer from this workspace. Nothing changes.",
  },
  draft: {
    label: "Draft",
    description: "Prepare the words. Nothing is sent.",
  },
  propose: {
    label: "Propose",
    description: "Prepare a change and wait for your OK.",
  },
};

export function parseAgentIntent(value: unknown): AgentIntent {
  return value === "draft" || value === "propose" ? value : "lookup";
}

/** Added as its own instruction. The person's words are stored unchanged. */
export function compassIntentInstruction(intent: AgentIntent): string {
  if (intent === "draft") {
    return "This turn is a draft. Prepare the words they asked for, using only what lookups return. Where a next step would help, offer it with suggest_action. Do not say a message was sent or that a record changed.";
  }
  if (intent === "propose") {
    return "This turn is a proposal. Describe the exact change and who it affects, then offer it with suggest_action. Do not say the change already happened.";
  }
  return "This turn is a lookup. Answer from the records. Offer a suggestion only when they asked for a change or a draft.";
}

export function operatorIntentInstruction(intent: AgentIntent): string {
  if (intent === "draft") {
    return "Handling note, do not repeat it: prepare words or propose regenerate_follow_up only. Do not assign, log an outcome, or change status. Do not claim a message was sent.";
  }
  if (intent === "propose") {
    return "Handling note, do not repeat it: propose the change with a write tool, then stop and wait. Do not claim the write happened.";
  }
  return "Handling note, do not repeat it: look this up and answer. Do not propose a write unless they explicitly asked for a change.";
}

/** What the model reads. request_text on the row stays the person's words. */
export function operatorModelRequest(text: string, intent: AgentIntent): string {
  return `${operatorIntentInstruction(intent)}\n\n${text.trim()}`;
}
