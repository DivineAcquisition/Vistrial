/**
 * Conversation titles name the topic, not the lead. A title is generated from
 * what Compass looked up, so it never carries a name, a phone number, or
 * anything else personal from the question. The person can rename it.
 */

const TOPIC: Record<string, string> = {
  response_health: "Response times",
  pipeline: "Pipeline and outcomes",
  objections: "Objections",
  agent_activity: "What the agents did",
  team_activity: "Team numbers",
  metric_leads: "Leads behind a number",
  find_leads: "Finding leads",
  read_case_file: "A lead's case file",
  read_call_transcript: "A lead's calls",
  find_leads_by_theme: "Leads by theme",
  product_help: "How Vistrial works",
  suggest_action: "A suggestion",
};

export function titleFor(lookups: string[], fallbackDate: string): string {
  const first = lookups.find((name) => name !== "suggest_action" && TOPIC[name]) ?? lookups.find((name) => TOPIC[name]);
  return first ? TOPIC[first]! : `A question on ${fallbackDate}`;
}

/** Cleans a title the person typed: no control characters, a sensible length. */
export function cleanTitle(input: string): string | null {
  const cleaned = input.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned || null;
}
