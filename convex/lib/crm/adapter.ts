/**
 * What one CRM must provide so every skill works with it unchanged: what it can do, and how an approved
 * action becomes the one request that CRM accepts. Reading (the paced sync into the `crm*` tables) stays in
 * each CRM's own module, because sign-in, paging and rate limits differ; what it writes is the shared model
 * in `types.ts`. docs/rebuild/dealmaker.md, section 3.4.
 *
 * Skills never import an adapter: they read through `read.ts` and act through `act.ts`.
 */

import type { ActionInput, Before } from "../crmActions";
import { highLevelAdapter } from "./highlevel";
import type { CrmActionKind, CrmCapabilities, CrmProvider } from "./types";

export type CrmWrite = { method: "PUT" | "POST" | "DELETE" | "PATCH"; path: string; body: Record<string, unknown> };

export type CrmAdapter = {
  provider: CrmProvider;
  /** The CRM's name, for screens and approval summaries. */
  label: string;
  capabilities: CrmCapabilities;
  /** The one request an approved action becomes. Throws on an action this CRM cannot carry out. */
  writeRequest(action: ActionInput & { pipelineId?: string }): CrmWrite;
  /** A request the sender may make. Anything else is refused before it leaves the server. */
  isAllowedWrite(method: string, path: string): boolean;
  /** The action that reverses a done one, or null when it cannot be undone. */
  reverseOf(action: ActionInput, before: Before | undefined): ActionInput | null;
};

/** Every CRM with an adapter. HubSpot and Salesforce join here; nothing in a skill changes. */
export const CRM_ADAPTERS: Partial<Record<CrmProvider, CrmAdapter>> = {
  highlevel: highLevelAdapter,
};

export function adapterFor(provider: string | null | undefined): CrmAdapter | null {
  return provider && Object.hasOwn(CRM_ADAPTERS, provider) ? (CRM_ADAPTERS[provider as CrmProvider] ?? null) : null;
}

/** Whether this CRM can carry out this action at all (before switches and approvals). */
export function canDo(provider: string | null | undefined, kind: CrmActionKind): boolean {
  return adapterFor(provider)?.capabilities.actions.includes(kind) ?? false;
}
