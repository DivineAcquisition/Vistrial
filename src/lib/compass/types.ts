/**
 * Shapes shared by Compass's server and its screens. Nothing here imports
 * server code, so the chat UI can render tool outputs with the same types.
 */

export type CompassAccess = "owner" | "member" | "operator" | "service_team" | "platform_admin";

/** A real record or definition an answer used. Rendered from lookup outputs, never from the model's text. */
export type CompassSource =
  | { kind: "lead"; id: string; label: string; href: string }
  | { kind: "metric"; metric: string; label: string; range: string; href: string; definition: string }
  | { kind: "help"; slug: string; label: string; href: string }
  | { kind: "list"; label: string; href: string };

/** What every lookup returns: data for the model, sources for the screen, and a plain note. */
export type LookupOutput<T = unknown> = {
  ok: boolean;
  /** Plain words for the model and, when nothing was found, for the person. */
  note?: string;
  /** "missing": the workspace does not track it; "hidden": not allowed; "empty": nothing in range. */
  gap?: "missing" | "hidden" | "empty" | "not_found" | "unavailable";
  smallSample?: { count: number; noun: string } | null;
  data?: T;
  sources: CompassSource[];
  /** A capped list: the full filtered list opens here. */
  more?: { total: number; href: string } | null;
};

export type SuggestedActionKind = "open_list" | "open_case_file" | "relay_draft" | "scribe_refresh" | "next_action" | "pin_question";

export type SuggestedAction = {
  id: string;
  kind: SuggestedActionKind;
  /** Exactly what will happen, in plain words. */
  description: string;
  leadId?: string | null;
  leadLabel?: string | null;
  href?: string | null;
  text?: string | null;
  dueAt?: string | null;
  /** Navigation needs no confirmation; everything else does. */
  needsConfirm: boolean;
  /** Set when the person may not do this, so the card says why instead of offering it. */
  unavailable?: string | null;
};

/** What a conversation started from: a lead, a list, Home, or a Results range. */
export type CompassContext =
  | { kind: "none" }
  | { kind: "lead"; leadId: string; label?: string }
  | { kind: "list"; params: Record<string, string>; label?: string }
  | { kind: "home"; label?: string }
  | { kind: "results"; params: Record<string, string>; label?: string };

export type CompassOutcome = "answered" | "no_data" | "out_of_scope" | "unverified" | "error" | "limited" | "stopped" | "unavailable";

/** The answer's footer, saved as message metadata: never lead text. */
export type CompassAnswerMeta = {
  sources: CompassSource[];
  outcome: CompassOutcome;
  unverified?: string[];
  route?: "fast" | "reasoning" | "help" | "refused";
  near?: string | null;
};

export function isCompassContext(value: unknown): value is CompassContext {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "none" || kind === "lead" || kind === "list" || kind === "home" || kind === "results";
}
