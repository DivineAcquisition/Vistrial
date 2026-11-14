/**
 * The one door a skill acts in a CRM through. It proposes an approved action (an Owner or Admin decides; an
 * Owner types VALUE or SEND where the rules say so) and never fails a run when it cannot: when no CRM is
 * connected, the CRM cannot do the action, acting or messaging is switched off, or the action is refused, it
 * returns why and the step in plain words for a person to do themselves ("Do this in your CRM"), and for a
 * message the draft stays for the person to copy. docs/rebuild/dealmaker.md, sections 3.6 and 4.4.
 */

import { ConvexError } from "convex/values";

import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { ACTING_OFF_WORDS, MESSAGING_OFF_WORDS, ORG_OFF_WORDS, proposeAgentAction } from "../../crmActions";
import { isMessage, type ActionInput } from "../crmActions";
import type { UserErrorData } from "../errors";
import { adapterFor, canDo } from "./adapter";
import { crmConnectionFor } from "./read";

export type CrmProposal = ActionInput & { why: string };

export type ProposeOutcome =
  | { ok: true; actionId: Id<"crmActions"> }
  | {
      ok: false;
      code: "no_crm" | "not_supported" | "acting_off" | "messaging_off" | "refused";
      /** Why it was not proposed, for the screen. */
      reason: string;
      /** The same step for a person to do in their CRM. A message's draft is shown with Copy instead. */
      doItYourself: string;
    };

/** The step in a sentence, for a person to do in their own CRM. `words` names what the CRM ids cannot. */
export function doItYourself(action: ActionInput, words: { crm?: string; stage?: string; lead?: string } = {}): string {
  const crm = words.crm ?? "your CRM";
  const lead = words.lead ?? "the lead";
  switch (action.kind) {
    case "move_stage":
      return `Move the deal to ${words.stage ? `"${words.stage}"` : "the next stage"} in ${crm}.`;
    case "set_status":
      return `Mark the deal ${action.status} in ${crm}.`;
    case "add_tag":
      return `Add the tag "${action.tag}" to ${lead} in ${crm}.`;
    case "remove_tag":
      return `Remove the tag "${action.tag}" from ${lead} in ${crm}.`;
    case "add_note":
      return `Add this note to ${lead} in ${crm}.`;
    case "create_task":
      return `Create the task "${action.title}" for ${lead} in ${crm}${typeof action.dueAt === "number" ? `, due ${new Date(action.dueAt).toISOString().slice(0, 10)}` : ""}.`;
    case "send_sms":
      return `Copy the text and send it to ${lead} yourself.`;
    case "send_email":
      return `Copy the email and send it to ${lead} yourself.`;
  }
}

/**
 * Proposes one action in the CRM connected for this organization or client, as the agent. Returns the
 * action's id, or why it was not proposed with the step for a person. Never throws for a reason a person
 * can act on; a programming error still throws.
 */
export async function proposeCrmAction(
  ctx: MutationCtx,
  scope: { workspaceId: Id<"workspaces">; clientId?: Id<"clients">; agentSlug: string },
  proposal: CrmProposal,
  words: { stage?: string; lead?: string } = {},
): Promise<ProposeOutcome> {
  const { why, ...action } = proposal;
  const connection = await crmConnectionFor(ctx, scope);
  const adapter = adapterFor(connection?.provider);
  const fallback = (code: Exclude<ProposeOutcome, { ok: true }>["code"], reason: string): ProposeOutcome => ({
    ok: false,
    code,
    reason,
    doItYourself: doItYourself(action, { ...words, crm: adapter?.label }),
  });
  if (!connection || !adapter) return fallback("no_crm", "No CRM is connected here.");
  if (!canDo(connection.provider, action.kind)) return fallback("not_supported", `${adapter.label} cannot do this through Vistrial.`);
  try {
    const actionId = await proposeAgentAction(ctx, { ...scope, why, ...action });
    return { ok: true, actionId };
  } catch (error) {
    if (!(error instanceof ConvexError)) throw error;
    const message = (error.data as UserErrorData | undefined)?.message ?? "";
    if (message === ACTING_OFF_WORDS || message === ORG_OFF_WORDS) return fallback("acting_off", message);
    if (message === MESSAGING_OFF_WORDS && isMessage(action.kind)) return fallback("messaging_off", message);
    return fallback("refused", message || "The CRM change was not proposed.");
  }
}
